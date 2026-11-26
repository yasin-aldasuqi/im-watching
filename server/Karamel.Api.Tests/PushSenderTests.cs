using System.Net;
using System.Net.Http.Json;
using Karamel.Api.Devices;
using Karamel.Api.Push;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Karamel.Api.Tests;

public class PushSenderTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?> { ["Push:RetryDelayMilliseconds"] = "10" })
{
    private sealed record Subscribed(RegisterDeviceResponse Device, TestBrowser Browser, string Endpoint);

    private async Task<Subscribed> SubscribeAsync(params object[] schedules)
    {
        var browser = new TestBrowser();
        var endpoint = NewEndpoint();
        var response = await Client.PostAsJsonAsync("/api/devices", Subscription(endpoint, browser.P256dh, browser.Auth));
        var device = (await response.Content.ReadFromJsonAsync<RegisterDeviceResponse>())!;
        if (schedules.Length > 0)
        {
            var put = await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(schedules));
            Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);
        }
        return new Subscribed(device, browser, endpoint);
    }

    private async Task<int> SendDueAsync(CancellationToken ct = default)
    {
        await using var scope = Api.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PushDispatcher>().SendDueAsync(ct);
    }

    private List<PushRequest> SentTo(string endpoint) => Api.Push.Requests.Where(r => r.Endpoint == endpoint).ToList();

    private async Task<Dictionary<string, DateTimeOffset>> NextFiringsAsync(Guid deviceId)
    {
        await using var db = Database.CreateContext();
        return await db.ReminderSchedules.Where(s => s.DeviceId == deviceId)
            .ToDictionaryAsync(s => s.ReminderKey, s => s.NextFireAt);
    }

    [Fact]
    public async Task A_due_reminder_is_sent_as_an_encrypted_and_signed_web_push()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60, interval: 1800));
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        Assert.Equal(1, await SendDueAsync());

        var push = Assert.Single(SentTo(phone.Endpoint));
        Assert.Equal(HttpMethod.Post, push.Method);
        // Only the phone can read the message, and it holds the reminder id, nothing else.
        Assert.Equal("""{"reminderKey":"posture"}""", phone.Browser.Decrypt(push.Body));
        Assert.Equal("aes128gcm", push.Headers["Content-Encoding"]);
        Assert.Equal("900", push.Headers["TTL"]);
        Assert.Equal("high", push.Headers["Urgency"]);
        Assert.Equal(PushDispatcher.Topic("posture"), push.Headers["Topic"]);

        // Signed with the server's VAPID key, for this push service, expiring within the hour.
        var (publicKey, claims) = TestBrowser.VerifyVapid(push.Headers["Authorization"]);
        Assert.Equal(Api.VapidPublicKey, publicKey);
        Assert.Equal("https://web.push.apple.com", claims.GetProperty("aud").GetString());
        Assert.Equal("https://karamel-mauve.vercel.app", claims.GetProperty("sub").GetString());
        var expires = DateTimeOffset.FromUnixTimeSeconds(claims.GetProperty("exp").GetInt64());
        Assert.InRange(expires, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddHours(1).AddMinutes(1));
    }

    [Fact]
    public async Task Reminders_that_are_not_due_yet_are_not_sent()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60));
        Api.Clock.Advance(TimeSpan.FromSeconds(59));

        await SendDueAsync();

        Assert.Empty(SentTo(phone.Endpoint));
    }

    [Fact]
    public async Task A_repeating_reminder_keeps_its_rhythm_and_a_one_time_reminder_is_removed()
    {
        var start = Api.Clock.GetUtcNow();
        var phone = await SubscribeAsync(
            Schedule("posture", firesIn: 60, interval: 1800),
            Schedule("custom-call-mom", firesIn: 60, interval: null));
        Api.Clock.Advance(TimeSpan.FromSeconds(61)); // A second late.

        await SendDueAsync();

        Assert.Equal(2, SentTo(phone.Endpoint).Count);
        var next = await NextFiringsAsync(phone.Device.DeviceId);
        Assert.Equal(["posture"], next.Keys);
        Assert.Equal(start.AddSeconds(60 + 1800), next["posture"]); // On the beat, not "now + 30 minutes".

        Api.Clock.Advance(TimeSpan.FromSeconds(1800));
        await SendDueAsync();
        Assert.Equal(3, SentTo(phone.Endpoint).Count);
    }

    [Fact]
    public async Task Firings_missed_while_the_server_was_down_collapse_into_one()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60, interval: 1800));
        Api.Clock.Advance(TimeSpan.FromSeconds(60 + 3 * 1800 + 5)); // Three firings missed.

        await SendDueAsync();
        await SendDueAsync();

        Assert.Single(SentTo(phone.Endpoint));
        var next = await NextFiringsAsync(phone.Device.DeviceId);
        Assert.Equal(Api.Clock.GetUtcNow().AddSeconds(1800), next["posture"]);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.Gone)]
    public async Task A_phone_that_unsubscribed_is_forgotten(HttpStatusCode answer)
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60), Schedule("water", firesIn: 3600));
        Api.Push.Respond = request => request.Endpoint == phone.Endpoint ? answer : HttpStatusCode.Created;
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        await SendDueAsync();

        Assert.Single(SentTo(phone.Endpoint)); // Not retried.
        await using var db = Database.CreateContext();
        Assert.False(await db.Devices.AnyAsync(d => d.Id == phone.Device.DeviceId));
        Assert.Empty(await NextFiringsAsync(phone.Device.DeviceId));
    }

    [Fact]
    public async Task A_temporary_failure_is_retried_once()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60));
        var answers = new Queue<HttpStatusCode>([HttpStatusCode.ServiceUnavailable, HttpStatusCode.Created]);
        Api.Push.Respond = request => request.Endpoint == phone.Endpoint ? answers.Dequeue() : HttpStatusCode.Created;
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        Assert.Equal(1, await SendDueAsync());
        Assert.Equal(2, SentTo(phone.Endpoint).Count);
    }

    public static TheoryData<string> LastingFailures => ["500", "429", "network error"];

    [Theory]
    [MemberData(nameof(LastingFailures))]
    public async Task After_one_retry_the_firing_is_dropped_and_the_device_is_kept(string failure)
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60, interval: 1800));
        Api.Push.Respond = request => request.Endpoint != phone.Endpoint ? HttpStatusCode.Created : failure switch
        {
            "network error" => throw new HttpRequestException("Connection refused"),
            _ => (HttpStatusCode)int.Parse(failure),
        };
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        Assert.Equal(0, await SendDueAsync());
        await SendDueAsync(); // The firing is not repeated right away.

        Assert.Equal(2, SentTo(phone.Endpoint).Count);
        await using var db = Database.CreateContext();
        Assert.True(await db.Devices.AnyAsync(d => d.Id == phone.Device.DeviceId));
        Assert.Contains("posture", (await NextFiringsAsync(phone.Device.DeviceId)).Keys);
    }

    [Fact]
    public async Task A_rejected_push_is_not_retried_and_the_device_is_kept()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60));
        Api.Push.Respond = request => request.Endpoint == phone.Endpoint ? HttpStatusCode.Forbidden : HttpStatusCode.Created;
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        await SendDueAsync();

        Assert.Single(SentTo(phone.Endpoint));
        await using var db = Database.CreateContext();
        Assert.True(await db.Devices.AnyAsync(d => d.Id == phone.Device.DeviceId));
    }

    [Fact]
    public async Task Several_senders_at_once_send_each_reminder_exactly_once()
    {
        var phones = new List<Subscribed>();
        for (var i = 0; i < 20; i++)
            phones.Add(await SubscribeAsync([.. Enumerable.Range(0, 10).Select(k => Schedule($"custom-{k}", firesIn: 60))]));
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        // Test database only: make every row change take 2 ms, so the senders' statements
        // really overlap, as under load. Without it, one sender could finish before the next
        // starts and the test would prove nothing.
        await using (var db = Database.CreateContext())
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE OR REPLACE FUNCTION slow_down() RETURNS trigger AS $$
                BEGIN PERFORM pg_sleep(0.002); RETURN COALESCE(NEW, OLD); END $$ LANGUAGE plpgsql;
                CREATE TRIGGER slow_down BEFORE UPDATE OR DELETE ON reminder_schedules
                FOR EACH ROW EXECUTE FUNCTION slow_down();
                """);
        }
        try
        {
            // Like four copies of the server running at the same moment.
            await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Task.Run(() => SendDueAsync())));
        }
        finally
        {
            await using var db = Database.CreateContext();
            await db.Database.ExecuteSqlRawAsync("DROP TRIGGER slow_down ON reminder_schedules");
        }

        var endpoints = phones.Select(p => p.Endpoint).ToHashSet();
        var sent = Api.Push.Requests.Where(r => endpoints.Contains(r.Endpoint)).ToList();
        Assert.Equal(200, sent.Select(r => (r.Endpoint, r.Headers["Topic"])).Distinct().Count()); // Every one sent...
        Assert.Equal(200, sent.Count); // ...and none twice.
    }

    [Fact]
    public async Task A_reminder_another_sender_is_busy_with_is_skipped_not_waited_for()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60), Schedule("water", firesIn: 60));
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        // Another sender holds the posture row.
        await using var other = new NpgsqlConnection(Database.ConnectionString);
        await other.OpenAsync();
        await using var transaction = await other.BeginTransactionAsync();
        await using (var lockRow = new NpgsqlCommand(
            "SELECT id FROM reminder_schedules WHERE device_id = @d AND reminder_key = 'posture' FOR UPDATE",
            other, transaction))
        {
            lockRow.Parameters.AddWithValue("d", phone.Device.DeviceId);
            await lockRow.ExecuteScalarAsync();
        }

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await SendDueAsync(timeout.Token);

        var sent = SentTo(phone.Endpoint);
        Assert.Equal([PushDispatcher.Topic("water")], sent.Select(r => r.Headers["Topic"]));

        await transaction.RollbackAsync(); // The other sender gave up; now posture goes out.
        await SendDueAsync();
        Assert.Equal(2, SentTo(phone.Endpoint).Count);
    }

    [Fact]
    public async Task An_address_that_is_no_longer_allowed_gets_nothing()
    {
        var phone = await SubscribeAsync(Schedule("posture", firesIn: 60));
        await using (var db = Database.CreateContext())
        {
            await db.Devices.Where(d => d.Id == phone.Device.DeviceId)
                .ExecuteUpdateAsync(set => set.SetProperty(d => d.PushEndpoint, "https://169.254.169.254/latest/meta-data/"));
        }
        Api.Clock.Advance(TimeSpan.FromSeconds(60));

        await SendDueAsync();

        Assert.DoesNotContain(Api.Push.Requests, r => r.Uri.Host == "169.254.169.254");
    }

    [Fact]
    public async Task The_public_key_is_available_to_the_website()
    {
        var body = await Client.GetFromJsonAsync<Dictionary<string, string>>("/api/push/public-key");
        Assert.Equal(Api.VapidPublicKey, body!["publicKey"]);
    }
}

public class PushSenderServiceTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?>
    {
        ["Push:SenderEnabled"] = "true",
        ["Push:SendIntervalSeconds"] = "5",
    })
{
    [Fact]
    public async Task The_background_sender_runs_every_few_seconds()
    {
        var browser = new TestBrowser();
        var endpoint = NewEndpoint();
        var response = await Client.PostAsJsonAsync("/api/devices", Subscription(endpoint, browser.P256dh, browser.Auth));
        var device = (await response.Content.ReadFromJsonAsync<RegisterDeviceResponse>())!;
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("posture", firesIn: 3)));

        Api.Clock.Advance(TimeSpan.FromSeconds(5)); // One tick of the sender's timer.

        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!Api.Push.Requests.Any(r => r.Endpoint == endpoint) && DateTime.UtcNow < deadline)
            await Task.Delay(50);
        var push = Assert.Single(Api.Push.Requests, r => r.Endpoint == endpoint);
        Assert.Equal("""{"reminderKey":"posture"}""", browser.Decrypt(push.Body));
    }
}

public class PushSenderResilienceTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?>
    {
        ["Push:SenderEnabled"] = "true",
        ["Push:SendIntervalSeconds"] = "5",
    })
{
    [Fact]
    public async Task The_background_sender_survives_a_failed_round()
    {
        var browser = new TestBrowser();
        var endpoint = NewEndpoint();
        var response = await Client.PostAsJsonAsync("/api/devices", Subscription(endpoint, browser.P256dh, browser.Auth));
        var device = (await response.Content.ReadFromJsonAsync<RegisterDeviceResponse>())!;
        await PutSchedulesAsync(device.DeviceId, device.Secret,
            Schedules(Schedule("posture", firesIn: 3), Schedule("water", firesIn: 8)));

        // The first round crashes with an unexpected error (not a network error).
        var calls = 0;
        Api.Push.Respond = _ => Interlocked.Increment(ref calls) == 1
            ? throw new InvalidOperationException("Something unexpected")
            : HttpStatusCode.Created;

        Api.Clock.Advance(TimeSpan.FromSeconds(5));
        await WaitUntilAsync(() => Volatile.Read(ref calls) >= 1);
        Api.Clock.Advance(TimeSpan.FromSeconds(5)); // The next round must still run.
        await WaitUntilAsync(() => Api.Push.Requests.Count(r => r.Endpoint == endpoint) >= 2);

        var water = Api.Push.Requests.Last(r => r.Endpoint == endpoint);
        Assert.Equal("""{"reminderKey":"water"}""", browser.Decrypt(water.Body));
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition() && DateTime.UtcNow < deadline) await Task.Delay(50);
        Assert.True(condition(), "Timed out waiting.");
    }
}

public class PushConfigurationTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public void Generated_keys_are_a_valid_pair_and_mixed_pairs_are_caught()
    {
        var first = VapidKeys.Generate();
        var second = VapidKeys.Generate();
        Assert.Null(VapidKeys.Problem(first.PublicKey, first.PrivateKey));
        Assert.Contains("do not belong together", VapidKeys.Problem(first.PublicKey, second.PrivateKey));
    }

    public static TheoryData<string, string> BadSettings()
    {
        var mine = VapidKeys.Generate();
        var other = VapidKeys.Generate();
        return new()
        {
            { "Push:VapidPrivateKey", "" },
            { "Push:VapidPrivateKey", other.PrivateKey },
            { "Push:VapidPublicKey", "not*base64!" },
            { "Push:VapidSubject", "http://karamel.example" },
        };
    }

    [Theory]
    [MemberData(nameof(BadSettings))]
    public void The_server_refuses_to_start_with_unusable_push_settings(string key, string value)
    {
        using var api = new KaramelApiFactory(database.ConnectionString, new Dictionary<string, string?> { [key] = value });
        var error = Assert.ThrowsAny<Exception>(() => api.CreateClient());
        Assert.Contains("Push:Vapid", error.Message);
    }

    [Fact]
    public void The_push_client_never_follows_redirects()
    {
        using var api = new KaramelApiFactory(database.ConnectionString, fakePushService: false);
        var handlers = api.Services.GetRequiredService<IHttpMessageHandlerFactory>();
        HttpMessageHandler handler = handlers.CreateHandler(PushDispatcher.HttpClientName);
        while (handler is DelegatingHandler outer) handler = outer.InnerHandler!;

        var sockets = Assert.IsType<SocketsHttpHandler>(handler);
        Assert.False(sockets.AllowAutoRedirect);
    }
}
