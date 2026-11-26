namespace Karamel.Api.Devices;

/// <summary>Settings from the "Push" configuration section.</summary>
public sealed class PushOptions
{
    /// <summary>
    /// The only hosts a push address may point to: the browsers' push services.
    /// "*.example.com" allows any subdomain. In step 3 the server sends requests to these
    /// addresses, so without this list anyone could make it call any URL (SSRF).
    /// </summary>
    public List<string> AllowedEndpointHosts { get; set; } = [];
}
