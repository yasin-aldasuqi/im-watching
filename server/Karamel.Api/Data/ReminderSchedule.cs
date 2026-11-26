namespace Karamel.Api.Data;

/// <summary>When one reminder of one device should fire next.</summary>
public class ReminderSchedule
{
    public Guid Id { get; set; }

    public Guid DeviceId { get; set; }

    public Device? Device { get; set; }

    /// <summary>
    /// The reminder's id on the device (for example "posture" or "custom-k3x9").
    /// The device turns it back into the reminder's name and message, so the
    /// text never reaches the server.
    /// </summary>
    public required string ReminderKey { get; set; }

    public DateTimeOffset NextFireAt { get; set; }

    /// <summary>Seconds between firings when the reminder restarts by itself; null fires once.</summary>
    public int? IntervalSeconds { get; set; }
}
