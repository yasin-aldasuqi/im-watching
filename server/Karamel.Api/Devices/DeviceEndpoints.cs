using Karamel.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Karamel.Api.Devices;

public static class DeviceEndpoints
{
    public static void MapDeviceEndpoints(this IEndpointRouteBuilder app)
    {
        var devices = app.MapGroup("/api/devices");
        devices.MapPost("/", Register).RequireRateLimiting(RateLimits.Register);

        var device = devices.MapGroup("/{deviceId:guid}")
            .AddEndpointFilter<DeviceSecretFilter>()
            .RequireRateLimiting(RateLimits.Device);
        device.MapPut("/schedules", ReplaceSchedules);
        device.MapDelete("/", Forget);
    }

    /// <summary>
    /// Registers a push address and returns a new device id and secret key. Registering an
    /// address again (for example after the app lost its key) keeps the id, gives a new key,
    /// and drops the old schedules: whoever held the old key no longer controls the device.
    /// </summary>
    private static async Task<Results<Created<RegisterDeviceResponse>, ValidationProblem>> Register(
        RegisterDeviceRequest request, KaramelDb db, TimeProvider clock, IOptions<PushOptions> push, CancellationToken ct)
    {
        var errors = RequestRules.Check(request, push.Value.AllowedEndpointHosts);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var (secret, hash) = DeviceSecret.Create();
        var now = clock.GetUtcNow();
        var subscription = request.Subscription;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // One statement, so two registrations of the same address at the same moment cannot
        // both insert: PostgreSQL turns the second into an update.
        var ids = await db.Database.SqlQuery<Guid>($"""
            INSERT INTO devices (id, secret_hash, push_endpoint, p256dh, auth, created_at, last_seen_at)
            VALUES ({Guid.CreateVersion7()}, {hash}, {subscription.Endpoint}, {subscription.Keys.P256dh},
                    {subscription.Keys.Auth}, {now}, {now})
            ON CONFLICT (push_endpoint) DO UPDATE SET
                secret_hash = EXCLUDED.secret_hash,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                last_seen_at = EXCLUDED.last_seen_at
            RETURNING id AS "Value"
            """).ToListAsync(ct);
        var deviceId = ids.Single();
        await db.ReminderSchedules.Where(s => s.DeviceId == deviceId).ExecuteDeleteAsync(ct);
        await transaction.CommitAsync(ct);

        return TypedResults.Created($"/api/devices/{deviceId}", new RegisterDeviceResponse(deviceId, secret));
    }

    /// <summary>Replaces all of the device's schedules with the given list (an empty list clears them).</summary>
    private static async Task<Results<NoContent, ValidationProblem, ProblemHttpResult>> ReplaceSchedules(
        Guid deviceId, ReplaceSchedulesRequest request, KaramelDb db, TimeProvider clock,
        HttpContext http, CancellationToken ct)
    {
        var errors = RequestRules.Check(request);
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // This UPDATE also locks the device's row until the commit. A second request for the
        // same device waits here, so the result is always one whole list, never a mix of two
        // (and never a duplicate-key error).
        var found = await db.Devices
            .Where(d => d.Id == deviceId)
            .ExecuteUpdateAsync(set => set.SetProperty(d => d.LastSeenAt, now), ct);
        if (found == 0) // Deleted after the key was checked.
            return DeviceSecretFilter.Unauthorized(http);

        await db.ReminderSchedules.Where(s => s.DeviceId == deviceId).ExecuteDeleteAsync(ct);
        db.ReminderSchedules.AddRange(request.Schedules.Select(schedule => new ReminderSchedule
        {
            Id = Guid.CreateVersion7(),
            DeviceId = deviceId,
            ReminderKey = schedule.ReminderKey,
            NextFireAt = now.AddSeconds(schedule.FiresInSeconds),
            IntervalSeconds = schedule.IntervalSeconds,
        }));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return TypedResults.NoContent();
    }

    /// <summary>Deletes the device; PostgreSQL deletes its schedules with it (ON DELETE CASCADE).</summary>
    private static async Task<NoContent> Forget(Guid deviceId, KaramelDb db, CancellationToken ct)
    {
        await db.Devices.Where(d => d.Id == deviceId).ExecuteDeleteAsync(ct);
        return TypedResults.NoContent();
    }
}
