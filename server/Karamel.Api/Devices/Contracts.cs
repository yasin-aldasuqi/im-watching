namespace Karamel.Api.Devices;

// The JSON the API accepts and returns. Property names are camelCase on the wire, and
// RegisterDeviceRequest.Subscription has the shape of the browser's PushSubscription.toJSON().

public sealed record RegisterDeviceRequest(PushSubscriptionRequest Subscription);

public sealed record PushSubscriptionRequest(string Endpoint, PushKeysRequest Keys);

public sealed record PushKeysRequest(string P256dh, string Auth);

public sealed record RegisterDeviceResponse(Guid DeviceId, string Secret);

public sealed record ReplaceSchedulesRequest(IReadOnlyList<ScheduleRequest> Schedules);

/// <param name="ReminderKey">The reminder's id in the app, for example "posture" or "custom-k3x9".</param>
/// <param name="FiresInSeconds">
/// Seconds from now, not a clock time: the server adds them to its own clock, so a device
/// with a wrong clock cannot shift its reminders.
/// </param>
/// <param name="IntervalSeconds">Seconds between firings when the reminder restarts by itself; null fires once.</param>
public sealed record ScheduleRequest(string ReminderKey, int FiresInSeconds, int? IntervalSeconds);
