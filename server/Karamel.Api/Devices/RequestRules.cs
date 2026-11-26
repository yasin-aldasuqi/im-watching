using System.Buffers.Text;
using System.Text.RegularExpressions;
using Karamel.Api.Data;

namespace Karamel.Api.Devices;

/// <summary>Checks request bodies. Each method returns the problems per field; empty means valid.</summary>
public static partial class RequestRules
{
    /// <summary>The app allows 4 built-in and 10 custom reminders.</summary>
    public const int MaxSchedules = 20;
    public const int MinIntervalSeconds = 30;
    public const int MaxIntervalSeconds = 24 * 60 * 60;
    public const int MaxFiresInSeconds = 7 * 24 * 60 * 60;

    // \z, not $: in .NET, $ also matches before a final newline.
    [GeneratedRegex(@"^[a-z0-9-]{1,64}\z", RegexOptions.CultureInvariant)]
    private static partial Regex ReminderKeyPattern();

    public static Dictionary<string, string[]> Check(RegisterDeviceRequest request, IReadOnlyList<string> allowedHosts)
    {
        var errors = new Dictionary<string, string[]>();
        if (EndpointProblem(request.Subscription.Endpoint, allowedHosts) is { } endpoint)
            errors["subscription.endpoint"] = [endpoint];
        // A P-256 public key in uncompressed form: 65 bytes, starting with 0x04.
        if (Decode(request.Subscription.Keys.P256dh) is not { Length: 65 } key || key[0] != 0x04)
            errors["subscription.keys.p256dh"] = ["Must be a base64url P-256 public key (65 bytes)."];
        if (Decode(request.Subscription.Keys.Auth) is not { Length: 16 })
            errors["subscription.keys.auth"] = ["Must be a base64url 16-byte secret."];
        return errors;
    }

    public static Dictionary<string, string[]> Check(ReplaceSchedulesRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Schedules.Count > MaxSchedules)
        {
            errors["schedules"] = [$"At most {MaxSchedules} schedules."];
            return errors;
        }
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < request.Schedules.Count; i++)
        {
            var schedule = request.Schedules[i];
            var at = $"schedules[{i}]";
            // Elements can be null in JSON even though the type says otherwise.
            if (schedule is null)
            {
                errors[at] = ["Must be an object."];
                continue;
            }
            if (!ReminderKeyPattern().IsMatch(schedule.ReminderKey))
                errors[$"{at}.reminderKey"] = ["1 to 64 characters: a-z, 0-9, and -."];
            else if (!seen.Add(schedule.ReminderKey))
                errors[$"{at}.reminderKey"] = ["Each reminder may appear only once."];
            if (schedule.FiresInSeconds is < 0 or > MaxFiresInSeconds)
                errors[$"{at}.firesInSeconds"] = [$"Must be between 0 and {MaxFiresInSeconds}."];
            if (schedule.IntervalSeconds is < MinIntervalSeconds or > MaxIntervalSeconds)
                errors[$"{at}.intervalSeconds"] = [$"Must be null or between {MinIntervalSeconds} and {MaxIntervalSeconds}."];
        }
        return errors;
    }

    /// <summary>Why a push address is not allowed, or null when it is.</summary>
    public static string? EndpointProblem(string endpoint, IReadOnlyList<string> allowedHosts)
    {
        if (endpoint.Length > KaramelDb.MaxEndpointLength)
            return $"At most {KaramelDb.MaxEndpointLength} characters.";
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            return "Must be an https URL.";
        // No "user@host", no custom port, no IP address: only a plain host name on port 443.
        if (uri.UserInfo.Length > 0 || !uri.IsDefaultPort || uri.HostNameType != UriHostNameType.Dns)
            return "Must be a plain https URL on a push service.";
        return allowedHosts.Any(allowed => HostMatches(uri.IdnHost, allowed))
            ? null
            : "Must be on a known push service (Apple, Google, Mozilla, or Microsoft).";
    }

    private static bool HostMatches(string host, string allowed) =>
        allowed.StartsWith("*.", StringComparison.Ordinal)
            // "*.notify.windows.com" matches "wns2-par02p.notify.windows.com", not "evilnotify.windows.com".
            ? host.EndsWith(allowed[1..], StringComparison.OrdinalIgnoreCase)
            : host.Equals(allowed, StringComparison.OrdinalIgnoreCase);

    private static byte[]? Decode(string value)
    {
        if (value.Length > KaramelDb.MaxKeyLength) return null;
        try
        {
            return Base64Url.DecodeFromChars(value);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
