namespace Karamel.Api.Data;

/// <summary>
/// A browser or installed app that allowed push notifications.
/// It holds no personal data: no name, no email, no reminder text.
/// </summary>
public class Device
{
    public Guid Id { get; set; }

    /// <summary>
    /// SHA-256 of the device's secret key. The key itself is never stored, so a
    /// leaked database does not let anyone change this device's reminders.
    /// </summary>
    public required byte[] SecretHash { get; set; }

    /// <summary>The push service URL for this device (for example on web.push.apple.com).</summary>
    public required string PushEndpoint { get; set; }

    /// <summary>The device's public key, used to encrypt each push message (Web Push encryption).</summary>
    public required string P256dh { get; set; }

    /// <summary>The device's authentication secret for Web Push encryption.</summary>
    public required string Auth { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }

    public List<ReminderSchedule> Schedules { get; set; } = [];
}
