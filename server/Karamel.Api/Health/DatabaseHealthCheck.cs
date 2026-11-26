using Karamel.Api.Data;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Karamel.Api.Health;

/// <summary>Healthy only when the database answers.</summary>
public class DatabaseHealthCheck(KaramelDb db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        return await db.Database.CanConnectAsync(cancellationToken)
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("The database is not reachable.");
    }
}
