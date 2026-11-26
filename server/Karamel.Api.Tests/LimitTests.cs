using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace Karamel.Api.Tests;

public class RegisterLimitTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?> { ["RateLimits:RegisterPerMinute"] = "3" })
{
    [Fact]
    public async Task Registrations_are_rate_limited()
    {
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Created, (await PostRegisterAsync()).StatusCode);

        var refused = await PostRegisterAsync();

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.True(int.Parse(refused.Headers.GetValues("Retry-After").Single()) > 0);
        Assert.Equal(HttpStatusCode.OK, (await Client.GetAsync("/api/health")).StatusCode); // Probes still pass.
    }
}

public class DeviceLimitTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?> { ["RateLimits:DevicePerMinute"] = "2" })
{
    [Fact]
    public async Task Each_device_has_its_own_rate_limit()
    {
        var busy = await RegisterAsync();
        var quiet = await RegisterAsync();
        for (var i = 0; i < 2; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await PutSchedulesAsync(busy.DeviceId, busy.Secret, Schedules())).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await PutSchedulesAsync(busy.DeviceId, busy.Secret, Schedules())).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PutSchedulesAsync(quiet.DeviceId, quiet.Secret, Schedules())).StatusCode);
    }
}

public class GlobalLimitTests(PostgresDatabase database)
    : ApiTestBase(database, new Dictionary<string, string?> { ["RateLimits:GlobalPerMinute"] = "3" })
{
    [Fact]
    public async Task All_requests_together_have_a_ceiling()
    {
        // Made-up device ids: each would get its own per-device limiter, but the ceiling still applies.
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await PutSchedulesAsync(Guid.NewGuid(), "x", Schedules())).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await PostRegisterAsync()).StatusCode);
    }
}

/// <summary>Runs on the real web server (Kestrel), which enforces the body size limit.</summary>
public class BodySizeTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Theory]
    [InlineData(15 * 1024, HttpStatusCode.BadRequest)] // Read, then refused as an invalid address.
    [InlineData(17 * 1024, HttpStatusCode.RequestEntityTooLarge)]
    public async Task Bodies_over_16_KB_are_refused_before_they_are_read(int size, HttpStatusCode expected)
    {
        await using var api = new KaramelApiFactory(database.ConnectionString);
        api.UseKestrel(0);
        api.StartServer();
        using var client = api.CreateClient();

        var padding = new string('a', size - 120);
        var json = "{\"subscription\":{\"endpoint\":\"https://web.push.apple.com/" + padding
            + "\",\"keys\":{\"p256dh\":\"a\",\"auth\":\"b\"}}}";
        var response = await client.PostAsync("/api/devices", new StringContent(json, Encoding.UTF8, "application/json"));

        Assert.Equal(expected, response.StatusCode);
    }
}
