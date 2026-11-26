using System.Buffers.Text;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Karamel.Api.Devices;
using Microsoft.AspNetCore.Http;

namespace Karamel.Api.Tests;

/// <summary>
/// One fresh API per test (with its own fake clock and rate limiters), sharing the test
/// class's PostgreSQL database. Rate limits are set high unless a test asks otherwise.
/// </summary>
public abstract class ApiTestBase : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private static readonly Dictionary<string, string?> HighLimits = new()
    {
        ["RateLimits:GlobalPerMinute"] = "100000",
        ["RateLimits:RegisterPerMinute"] = "100000",
        ["RateLimits:DevicePerMinute"] = "100000",
    };

    protected ApiTestBase(PostgresDatabase database, IDictionary<string, string?>? settings = null)
    {
        Database = database;
        var merged = new Dictionary<string, string?>(HighLimits);
        foreach (var (key, value) in settings ?? new Dictionary<string, string?>()) merged[key] = value;
        Api = new KaramelApiFactory(database.ConnectionString, merged);
        Client = Api.CreateClient();
    }

    protected PostgresDatabase Database { get; }

    protected KaramelApiFactory Api { get; }

    protected HttpClient Client { get; }

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await Api.DisposeAsync();

    // ---- Push subscriptions like a browser's PushSubscription.toJSON() ----

    protected static string NewEndpoint(string host = "web.push.apple.com") => $"https://{host}/{Guid.NewGuid():N}";

    protected static string NewP256dh()
    {
        var key = RandomNumberGenerator.GetBytes(65);
        key[0] = 0x04; // Uncompressed P-256 point.
        return Base64Url.EncodeToString(key);
    }

    protected static string NewAuth() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));

    protected static object Subscription(string? endpoint = null, string? p256dh = null, string? auth = null) => new
    {
        subscription = new
        {
            endpoint = endpoint ?? NewEndpoint(),
            expirationTime = (object?)null,
            keys = new { p256dh = p256dh ?? NewP256dh(), auth = auth ?? NewAuth() },
        },
    };

    // ---- Requests ----

    protected Task<HttpResponseMessage> PostRegisterAsync(string? endpoint = null) =>
        Client.PostAsJsonAsync("/api/devices", Subscription(endpoint));

    protected async Task<RegisterDeviceResponse> RegisterAsync(string? endpoint = null)
    {
        var response = await PostRegisterAsync(endpoint);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RegisterDeviceResponse>())!;
    }

    protected static object Schedule(string key, int firesIn = 1800, int? interval = 1800) =>
        new { reminderKey = key, firesInSeconds = firesIn, intervalSeconds = interval };

    protected static object Schedules(params object[] schedules) => new { schedules };

    protected Task<HttpResponseMessage> PutSchedulesAsync(Guid deviceId, string? secret, object body) =>
        SendAsync(HttpMethod.Put, $"/api/devices/{deviceId}/schedules", secret, JsonContent.Create(body));

    protected Task<HttpResponseMessage> PutSchedulesJsonAsync(Guid deviceId, string secret, string json) =>
        SendAsync(HttpMethod.Put, $"/api/devices/{deviceId}/schedules", secret,
            new StringContent(json, Encoding.UTF8, "application/json"));

    protected Task<HttpResponseMessage> DeleteDeviceAsync(Guid deviceId, string? secret) =>
        SendAsync(HttpMethod.Delete, $"/api/devices/{deviceId}", secret, content: null);

    protected Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string url, string? secret, HttpContent? content, string scheme = "Bearer")
    {
        var request = new HttpRequestMessage(method, url) { Content = content };
        if (secret is not null) request.Headers.Authorization = new AuthenticationHeaderValue(scheme, secret);
        return Client.SendAsync(request);
    }

    protected static async Task<IDictionary<string, string[]>> ValidationErrorsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>();
        return problem!.Errors;
    }
}
