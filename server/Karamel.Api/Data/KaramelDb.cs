using Microsoft.EntityFrameworkCore;

namespace Karamel.Api.Data;

public class KaramelDb(DbContextOptions<KaramelDb> options) : DbContext(options)
{
    public const int MaxEndpointLength = 2048;
    public const int MaxKeyLength = 256;
    public const int MaxReminderKeyLength = 64;

    public DbSet<Device> Devices => Set<Device>();

    public DbSet<ReminderSchedule> ReminderSchedules => Set<ReminderSchedule>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Device>(device =>
        {
            // HasMaxLength does not limit bytea in PostgreSQL, so a check constraint does.
            device.ToTable(t => t.HasCheckConstraint(
                "ck_devices_secret_hash_sha256", "octet_length(secret_hash) = 32"));
            device.Property(d => d.PushEndpoint).HasMaxLength(MaxEndpointLength);
            device.Property(d => d.P256dh).HasMaxLength(MaxKeyLength);
            device.Property(d => d.Auth).HasMaxLength(MaxKeyLength);
            // One row per push address: subscribing again updates the same device.
            device.HasIndex(d => d.PushEndpoint).IsUnique();
            device.HasMany(d => d.Schedules)
                .WithOne(s => s.Device)
                .HasForeignKey(s => s.DeviceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<ReminderSchedule>(schedule =>
        {
            schedule.Property(s => s.ReminderKey).HasMaxLength(MaxReminderKeyLength);
            schedule.HasIndex(s => new { s.DeviceId, s.ReminderKey }).IsUnique();
            // The push sender asks "what is due?" every few seconds.
            schedule.HasIndex(s => s.NextFireAt);
            schedule.ToTable(t => t.HasCheckConstraint(
                "ck_reminder_schedules_interval_positive",
                "interval_seconds IS NULL OR interval_seconds > 0"));
        });
    }
}
