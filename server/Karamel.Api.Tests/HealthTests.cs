using System.Net;

namespace Karamel.Api.Tests;

public class HealthTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Healthy_when_the_database_answers()
    {
        await using var api = new KaramelApiFactory(database.ConnectionString);
        var response = await api.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Unhealthy_when_the_database_is_down()
    {
        // Nothing listens on port 1, so every connection attempt fails.
        await using var api = new KaramelApiFactory("Host=localhost;Port=1;Username=karamel;Timeout=2");
        var response = await api.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("Unhealthy", await response.Content.ReadAsStringAsync());
    }
}
