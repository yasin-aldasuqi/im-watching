using System.Buffers.Text;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Karamel.Api.Devices;
using Microsoft.EntityFrameworkCore;

namespace Karamel.Api.Tests;

public class RegisterTests(PostgresDatabase database) : ApiTestBase(database)
{
    [Fact]
    public async Task Registering_returns_an_id_and_a_secret_and_stores_only_the_secrets_hash()
    {
        var endpoint = NewEndpoint();
        var response = await PostRegisterAsync(endpoint);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<RegisterDeviceResponse>())!;
        Assert.Equal($"/api/devices/{body.DeviceId}", response.Headers.Location?.ToString());
        var secret = Base64Url.DecodeFromChars(body.Secret);
        Assert.Equal(32, secret.Length);

        await using var db = Database.CreateContext();
        var device = await db.Devices.SingleAsync(d => d.PushEndpoint == endpoint);
        Assert.Equal(body.DeviceId, device.Id);
        Assert.Equal(SHA256.HashData(secret), device.SecretHash);
        Assert.Equal(Api.Clock.GetUtcNow(), device.CreatedAt);
    }

    [Theory]
    [InlineData("https://web.push.apple.com/QGuQyavXutnMbpu")]
    [InlineData("https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91b")]
    [InlineData("https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB")]
    [InlineData("https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB")]
    public async Task Every_known_push_service_is_accepted(string endpoint)
    {
        var response = await PostRegisterAsync(endpoint + Guid.NewGuid().ToString("N"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    public static TheoryData<string> NotPushServices => new()
    {
        "http://web.push.apple.com/x",                // not https
        "https://evil.example/x",                     // another host
        "https://web.push.apple.com.evil.example/x",  // allowed name as a prefix
        "https://evilweb.push.apple.com/x",           // allowed name as a suffix, without a dot
        "https://notify.windows.com/x",               // "*." needs a subdomain
        "https://evilnotify.windows.com/x",
        "https://user@web.push.apple.com/x",          // user info
        "https://web.push.apple.com:8443/x",          // custom port
        "https://169.254.169.254/latest/meta-data/",  // cloud metadata IP, the classic SSRF target
        "https://[::1]/x",
        "https://localhost/x",
        "file:///etc/passwd",
        "/api/devices",
        "not a url",
        "https://web.push.apple.com/" + new string('a', 2048), // too long
    };

    [Theory]
    [MemberData(nameof(NotPushServices))]
    public async Task Addresses_outside_the_push_services_are_refused(string endpoint)
    {
        var errors = await ValidationErrorsAsync(await PostRegisterAsync(endpoint));
        Assert.Contains("subscription.endpoint", errors.Keys);

        await using var db = Database.CreateContext();
        Assert.False(await db.Devices.AnyAsync(d => d.PushEndpoint == endpoint));
    }

    public static TheoryData<string, string, string> BadKeys()
    {
        static string Bytes(int length, byte first = 0x04)
        {
            var bytes = new byte[length];
            if (length > 0) bytes[0] = first;
            return Base64Url.EncodeToString(bytes);
        }
        var goodKey = Bytes(65);
        var goodAuth = Bytes(16);
        return new()
        {
            { Bytes(64), goodAuth, "subscription.keys.p256dh" },
            { Bytes(65, first: 0x02), goodAuth, "subscription.keys.p256dh" }, // compressed point
            { "not*base64!", goodAuth, "subscription.keys.p256dh" },
            { goodKey, Bytes(15), "subscription.keys.auth" },
            { goodKey, Bytes(17), "subscription.keys.auth" },
            { goodKey, "", "subscription.keys.auth" },
        };
    }

    [Theory]
    [MemberData(nameof(BadKeys))]
    public async Task Malformed_encryption_keys_are_refused(string p256dh, string auth, string field)
    {
        var response = await Client.PostAsJsonAsync("/api/devices", Subscription(p256dh: p256dh, auth: auth));
        var errors = await ValidationErrorsAsync(response);
        Assert.Equal([field], errors.Keys);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"subscription":null}""")]
    [InlineData("""{"subscription":{"endpoint":"https://web.push.apple.com/x"}}""")]
    [InlineData("""{"subscription":{"endpoint":"https://web.push.apple.com/x","keys":{"p256dh":null,"auth":"x"}}}""")]
    [InlineData("not json")]
    public async Task Incomplete_or_ambiguous_json_is_refused(string json)
    {
        var response = await Client.PostAsync("/api/devices", new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_duplicated_field_is_refused_even_when_each_value_alone_is_valid()
    {
        // Otherwise the parser would keep one of the two values, and other code (a proxy, a
        // log) might read the other one.
        var json = $$$"""
            {"subscription":{
              "endpoint":"https://evil.example/x",
              "endpoint":"{{{NewEndpoint()}}}",
              "keys":{"p256dh":"{{{NewP256dh()}}}","auth":"{{{NewAuth()}}}"}
            }}
            """;
        var response = await Client.PostAsync("/api/devices", new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Registering_again_keeps_the_id_gives_a_new_secret_and_drops_old_schedules()
    {
        var endpoint = NewEndpoint();
        var first = await RegisterAsync(endpoint);
        var put = await PutSchedulesAsync(first.DeviceId, first.Secret, Schedules(Schedule("posture")));
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var second = await RegisterAsync(endpoint);

        Assert.Equal(first.DeviceId, second.DeviceId);
        Assert.NotEqual(first.Secret, second.Secret);
        await using (var db = Database.CreateContext())
        {
            Assert.Equal(1, await db.Devices.CountAsync(d => d.PushEndpoint == endpoint));
            Assert.Equal(0, await db.ReminderSchedules.CountAsync(s => s.DeviceId == first.DeviceId));
        }
        var withOldSecret = await PutSchedulesAsync(first.DeviceId, first.Secret, Schedules());
        Assert.Equal(HttpStatusCode.Unauthorized, withOldSecret.StatusCode);
        var withNewSecret = await PutSchedulesAsync(second.DeviceId, second.Secret, Schedules());
        Assert.Equal(HttpStatusCode.NoContent, withNewSecret.StatusCode);
    }

    [Fact]
    public async Task Simultaneous_registrations_of_one_address_leave_one_device_with_one_working_secret()
    {
        var endpoint = NewEndpoint();
        var responses = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => PostRegisterAsync(endpoint)));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Created, response.StatusCode));
        var devices = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<RegisterDeviceResponse>()));
        Assert.Single(devices.Select(d => d!.DeviceId).Distinct());

        await using var db = Database.CreateContext();
        Assert.Equal(1, await db.Devices.CountAsync(d => d.PushEndpoint == endpoint));

        // Only the secret of the registration that committed last still works.
        var results = await Task.WhenAll(devices.Select(d => PutSchedulesAsync(d!.DeviceId, d.Secret, Schedules())));
        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.NoContent));
    }
}
