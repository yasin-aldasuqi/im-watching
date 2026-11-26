using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Karamel.Api.Devices;

/// <summary>Settings from the "RateLimits" configuration section (requests per minute).</summary>
public sealed class RateLimitOptions
{
    /// <summary>All requests together: a ceiling for floods, including made-up device ids.</summary>
    public int GlobalPerMinute { get; set; } = 600;

    /// <summary>New registrations, from everyone together.</summary>
    public int RegisterPerMinute { get; set; } = 30;

    /// <summary>Requests for one device. The app syncs after Start, Pause, Done, and so on.</summary>
    public int DevicePerMinute { get; set; } = 60;
}

/// <summary>
/// Limits are per device and overall, not per IP address: every request arrives through the
/// website's proxy (Vercel), so they would all share the proxy's IP address.
/// </summary>
public static class RateLimits
{
    public const string Register = "register";
    public const string Device = "device";

    public static IServiceCollection AddKaramelRateLimits(this IServiceCollection services, RateLimitOptions limits)
    {
        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, _) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                }
                return ValueTask.CompletedTask;
            };

            // Per-device limiters are created per device id. The global ceiling also bounds how
            // many of them a flood of made-up ids can create.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(
                _ => RateLimitPartition.GetFixedWindowLimiter("all", _ => PerMinute(limits.GlobalPerMinute)));
            options.AddPolicy(Register,
                _ => RateLimitPartition.GetFixedWindowLimiter(Register, _ => PerMinute(limits.RegisterPerMinute)));
            options.AddPolicy(Device, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Request.RouteValues["deviceId"] as string ?? "",
                _ => PerMinute(limits.DevicePerMinute)));
        });
    }

    private static FixedWindowRateLimiterOptions PerMinute(int permits) => new()
    {
        PermitLimit = permits,
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    };
}
