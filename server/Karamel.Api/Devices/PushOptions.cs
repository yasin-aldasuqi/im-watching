namespace Karamel.Api.Devices;

/// <summary>Settings from the "Push" configuration section.</summary>
public sealed class PushOptions
{
    /// <summary>
    /// The only hosts a push address may point to: the browsers' push services.
    /// "*.example.com" allows any subdomain. The server sends requests to these
    /// addresses, so without this list anyone could make it call any URL (SSRF).
    /// </summary>
    public List<string> AllowedEndpointHosts { get; set; } = [];

    /// <summary>The server's VAPID public key: base64url, 65 bytes (an uncompressed P-256 point).</summary>
    public string VapidPublicKey { get; set; } = "";

    /// <summary>
    /// The server's VAPID private key: base64url, 32 bytes. A secret: set it with
    /// "dotnet user-secrets" in development and an environment variable when hosted,
    /// never in a committed file.
    /// </summary>
    public string VapidPrivateKey { get; set; } = "";

    /// <summary>How push services can reach whoever runs this server: an https URL or a mailto: address.</summary>
    public string VapidSubject { get; set; } = "";

    /// <summary>Whether the background sender runs. Tests turn it off and call the sender directly.</summary>
    public bool SenderEnabled { get; set; } = true;

    /// <summary>How often the background sender looks for due reminders.</summary>
    public int SendIntervalSeconds { get; set; } = 5;

    /// <summary>Due reminders claimed per database round trip.</summary>
    public int BatchSize { get; set; } = 50;

    /// <summary>How long a push service keeps a message for a phone that is offline.</summary>
    public int TimeToLiveSeconds { get; set; } = 15 * 60;

    /// <summary>The wait before the one retry after a temporary failure.</summary>
    public int RetryDelayMilliseconds { get; set; } = 1000;
}
