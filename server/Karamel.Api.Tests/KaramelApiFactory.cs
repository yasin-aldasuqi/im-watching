using Karamel.Api.Push;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Karamel.Api.Tests;

/// <summary>
/// The real API, running in memory, connected to the given database, with a fake clock that
/// tests move by hand and a fake push service. Settings override appsettings.json; by default
/// the background sender is off (tests call it directly) and a fresh VAPID key pair is used.
/// </summary>
public sealed class KaramelApiFactory(
    string connectionString, IDictionary<string, string?>? settings = null, bool fakePushService = true)
    : WebApplicationFactory<Program>
{
    private static readonly (string Public, string Private) Keys = VapidKeys.Generate();

    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero));

    public FakePushService Push { get; } = new();

    public string VapidPublicKey => Keys.Public;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Karamel", connectionString);
        builder.UseSetting("Push:VapidPublicKey", Keys.Public);
        builder.UseSetting("Push:VapidPrivateKey", Keys.Private);
        builder.UseSetting("Push:SenderEnabled", "false");
        foreach (var (key, value) in settings ?? new Dictionary<string, string?>())
            builder.UseSetting(key, value);
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(Clock);
            if (fakePushService)
                services.AddHttpClient(PushDispatcher.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Push);
        });
    }
}
