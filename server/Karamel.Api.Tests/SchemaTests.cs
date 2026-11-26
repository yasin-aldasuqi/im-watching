using Karamel.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Karamel.Api.Tests;

/// <summary>The rules the database itself enforces, checked against real PostgreSQL.</summary>
public class SchemaTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    private static Device NewDevice(string? endpoint = null, int hashLength = 32) => new()
    {
        Id = Guid.NewGuid(),
        SecretHash = new byte[hashLength],
        PushEndpoint = endpoint ?? $"https://web.push.apple.com/{Guid.NewGuid():N}",
        P256dh = "p256dh-key",
        Auth = "auth-secret",
        CreatedAt = DateTimeOffset.UtcNow,
        LastSeenAt = DateTimeOffset.UtcNow,
    };

    private static ReminderSchedule NewSchedule(Guid deviceId, string key = "posture", int? interval = 1800) => new()
    {
        Id = Guid.NewGuid(),
        DeviceId = deviceId,
        ReminderKey = key,
        NextFireAt = DateTimeOffset.UtcNow.AddMinutes(30),
        IntervalSeconds = interval,
    };

    /// <summary>Saves, expecting PostgreSQL to refuse with the given error code and constraint.</summary>
    private static async Task AssertRejectedAsync(KaramelDb db, string sqlState, string constraint)
    {
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        var postgres = Assert.IsType<PostgresException>(error.InnerException);
        Assert.Equal(sqlState, postgres.SqlState);
        Assert.Equal(constraint, postgres.ConstraintName);
    }

    [Fact]
    public async Task The_migrations_match_the_model()
    {
        // Fails when someone changes the model but forgets to add a migration.
        await using var db = database.CreateContext();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [Fact]
    public async Task A_push_address_belongs_to_one_device_only()
    {
        await using var db = database.CreateContext();
        var endpoint = $"https://web.push.apple.com/{Guid.NewGuid():N}";
        db.Devices.Add(NewDevice(endpoint));
        await db.SaveChangesAsync();

        db.Devices.Add(NewDevice(endpoint));
        await AssertRejectedAsync(db, PostgresErrorCodes.UniqueViolation, "ix_devices_push_endpoint");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(31)]
    [InlineData(64)]
    public async Task The_secret_hash_must_be_a_SHA256(int length)
    {
        await using var db = database.CreateContext();
        db.Devices.Add(NewDevice(hashLength: length));
        await AssertRejectedAsync(db, PostgresErrorCodes.CheckViolation, "ck_devices_secret_hash_sha256");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-30)]
    public async Task The_interval_must_be_positive(int interval)
    {
        await using var db = database.CreateContext();
        var device = NewDevice();
        db.Devices.Add(device);
        db.ReminderSchedules.Add(NewSchedule(device.Id, interval: interval));
        await AssertRejectedAsync(db, PostgresErrorCodes.CheckViolation, "ck_reminder_schedules_interval_positive");
    }

    [Fact]
    public async Task A_one_time_reminder_has_no_interval()
    {
        await using var db = database.CreateContext();
        var device = NewDevice();
        db.Devices.Add(device);
        db.ReminderSchedules.Add(NewSchedule(device.Id, interval: null));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Each_reminder_has_one_schedule_per_device()
    {
        await using var db = database.CreateContext();
        var first = NewDevice();
        var second = NewDevice();
        db.Devices.AddRange(first, second);
        db.ReminderSchedules.Add(NewSchedule(first.Id, "water"));
        db.ReminderSchedules.Add(NewSchedule(second.Id, "water")); // Same key, other device: fine.
        await db.SaveChangesAsync();

        db.ReminderSchedules.Add(NewSchedule(first.Id, "water"));
        await AssertRejectedAsync(
            db, PostgresErrorCodes.UniqueViolation, "ix_reminder_schedules_device_id_reminder_key");
    }

    [Fact]
    public async Task A_schedule_needs_an_existing_device()
    {
        await using var db = database.CreateContext();
        db.ReminderSchedules.Add(NewSchedule(Guid.NewGuid()));
        await AssertRejectedAsync(
            db, PostgresErrorCodes.ForeignKeyViolation, "fk_reminder_schedules_devices_device_id");
    }

    [Fact]
    public async Task Deleting_a_device_deletes_its_schedules_in_the_database()
    {
        Guid deviceId;
        await using (var db = database.CreateContext())
        {
            var device = NewDevice();
            deviceId = device.Id;
            db.Devices.Add(device);
            db.ReminderSchedules.AddRange(NewSchedule(device.Id, "posture"), NewSchedule(device.Id, "eyes"));
            await db.SaveChangesAsync();
        }

        // A plain SQL delete, so PostgreSQL's ON DELETE CASCADE does the work, not EF Core.
        await using (var db = database.CreateContext())
        {
            await db.Devices.Where(d => d.Id == deviceId).ExecuteDeleteAsync();
            Assert.Equal(0, await db.ReminderSchedules.CountAsync(s => s.DeviceId == deviceId));
        }
    }

    [Fact]
    public async Task Times_are_stored_in_UTC_without_losing_precision()
    {
        var at = new DateTimeOffset(2026, 11, 26, 15, 30, 0, 123, TimeSpan.Zero);
        Guid id;
        await using (var db = database.CreateContext())
        {
            var device = NewDevice();
            db.Devices.Add(device);
            var schedule = NewSchedule(device.Id);
            schedule.NextFireAt = at;
            id = schedule.Id;
            db.ReminderSchedules.Add(schedule);
            await db.SaveChangesAsync();
        }
        await using (var db = database.CreateContext())
        {
            var saved = await db.ReminderSchedules.SingleAsync(s => s.Id == id);
            Assert.Equal(at, saved.NextFireAt);
            Assert.Equal(TimeSpan.Zero, saved.NextFireAt.Offset);
        }
    }
}
