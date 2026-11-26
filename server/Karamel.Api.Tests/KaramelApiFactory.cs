using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Karamel.Api.Tests;

/// <summary>
/// The real API, running in memory, connected to the given database, with a fake clock
/// that tests move by hand. Extra settings override appsettings.json.
/// </summary>
public sealed class KaramelApiFactory(string connectionString, IDictionary<string, string?>? settings = null)
    : WebApplicationFactory<Program>
{
    public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Karamel", connectionString);
        foreach (var (key, value) in settings ?? new Dictionary<string, string?>())
            builder.UseSetting(key, value);
        builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(Clock));
    }
}
