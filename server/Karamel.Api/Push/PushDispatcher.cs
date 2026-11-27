using System.Buffers.Text;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Karamel.Api.Data;
using Karamel.Api.Devices;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Karamel.Api.Push;

/// <summary>A reminder that is due, with the device to send it to.</summary>
public sealed record DuePush(Guid ScheduleId, Guid DeviceId, string ReminderKey, string Endpoint, string P256dh, string Auth);

/// <summary>Finds due reminders and sends them as Web Push messages.</summary>
public sealed partial class PushDispatcher(
    KaramelDb db,
    IHttpClientFactory httpClients,
    IOptions<PushOptions> options,
    TimeProvider clock,
    ILogger<PushDispatcher> logger)
{
    public const string HttpClientName = "push";

    private enum Outcome { Sent, Gone, Temporary, Rejected }

    /// <summary>Sends every reminder that is due now. Returns how many were sent successfully.</summary>
    public async Task<int> SendDueAsync(CancellationToken ct)
    {
        var settings = options.Value;
        using var vapid = new VapidAuthentication(settings.VapidPublicKey, settings.VapidPrivateKey)
        {
            Subject = settings.VapidSubject,
            Expiration = 60 * 60, // Seconds. RFC 8292 allows up to 24 hours; shorter is safer.
        };
        var client = new PushServiceClient(httpClients.CreateClient(HttpClientName))
        {
            DefaultAuthentication = vapid,
            DefaultAuthenticationScheme = VapidAuthenticationScheme.Vapid,
            // A push service may ask to wait (429 with Retry-After), possibly for an hour.
            // Never block the sender for that: retry once, then let the next firing try.
            AutoRetryAfter = false,
        };

        var sent = 0;
        while (true)
        {
            var batch = await ClaimDueAsync(settings.BatchSize, ct);
            // One at a time: simple, and plenty for this app's scale (see README).
            foreach (var push in batch)
            {
                if (await SendAsync(client, push, ct) == Outcome.Sent) sent++;
            }
            if (batch.Count < settings.BatchSize) return sent;
        }
    }

    /// <summary>
    /// Claims up to <paramref name="batchSize"/> due reminders in one statement: repeating ones
    /// move to their next time, one-time ones are deleted, and the claimed rows are returned.
    /// The change is committed before anything is sent, so a reminder is never sent twice,
    /// not even by two copies of the server (at most once: a crash right after this statement
    /// would skip that one firing).
    /// </summary>
    public async Task<IReadOnlyList<DuePush>> ClaimDueAsync(int batchSize, CancellationToken ct)
    {
        // FOR UPDATE SKIP LOCKED: rows another sender (or an API update) is busy with are
        // skipped instead of waited for. A repeating reminder that missed several firings (the
        // server was down) fires once and continues one interval from now.
        const string sql = """
            WITH due AS (
                SELECT id FROM reminder_schedules
                WHERE next_fire_at <= @now
                ORDER BY next_fire_at
                LIMIT @batch
                FOR UPDATE SKIP LOCKED
            ),
            repeating AS (
                UPDATE reminder_schedules AS s
                SET next_fire_at = CASE
                    WHEN s.next_fire_at + make_interval(secs => s.interval_seconds) > @now
                        THEN s.next_fire_at + make_interval(secs => s.interval_seconds)
                    ELSE @now + make_interval(secs => s.interval_seconds)
                END
                FROM due
                WHERE s.id = due.id AND s.interval_seconds IS NOT NULL
                RETURNING s.id, s.device_id, s.reminder_key
            ),
            once AS (
                DELETE FROM reminder_schedules AS s
                USING due
                WHERE s.id = due.id AND s.interval_seconds IS NULL
                RETURNING s.id, s.device_id, s.reminder_key
            )
            SELECT f.id, f.device_id, f.reminder_key, d.push_endpoint, d.p256dh, d.auth
            FROM (SELECT * FROM repeating UNION ALL SELECT * FROM once) AS f
            JOIN devices AS d ON d.id = f.device_id
            """;

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("now", clock.GetUtcNow());
            command.Parameters.AddWithValue("batch", batchSize);
            await using var reader = await command.ExecuteReaderAsync(ct);
            var claimed = new List<DuePush>();
            while (await reader.ReadAsync(ct))
            {
                claimed.Add(new DuePush(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5)));
            }
            return claimed;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    private async Task<Outcome> SendAsync(PushServiceClient client, DuePush push, CancellationToken ct)
    {
        // Checked again before sending: the database may hold addresses from before a host
        // was removed from the list.
        if (RequestRules.EndpointProblem(push.Endpoint, options.Value.AllowedEndpointHosts) is not null)
        {
            LogNotAllowed(push.DeviceId);
            return Outcome.Rejected;
        }

        var outcome = await TrySendAsync(client, push, ct);
        if (outcome == Outcome.Temporary)
        {
            await Task.Delay(options.Value.RetryDelayMilliseconds, ct);
            outcome = await TrySendAsync(client, push, ct);
        }

        if (outcome == Outcome.Gone)
        {
            // The phone unsubscribed or uninstalled the app: forget it (and its schedules).
            await db.Devices.Where(d => d.Id == push.DeviceId).ExecuteDeleteAsync(ct);
            LogForgotten(push.DeviceId);
        }
        else if (outcome == Outcome.Temporary)
        {
            LogGaveUp(push.DeviceId);
        }
        return outcome;
    }

    private async Task<Outcome> TrySendAsync(PushServiceClient client, DuePush push, CancellationToken ct)
    {
        var subscription = new PushSubscription { Endpoint = push.Endpoint };
        subscription.SetKey(PushEncryptionKeyName.P256DH, push.P256dh);
        subscription.SetKey(PushEncryptionKeyName.Auth, push.Auth);
        var message = new PushMessage(JsonSerializer.Serialize(new { reminderKey = push.ReminderKey }))
        {
            Topic = Topic(push.ReminderKey),
            Urgency = PushMessageUrgency.High,
            TimeToLive = options.Value.TimeToLiveSeconds,
        };

        try
        {
            await client.RequestPushMessageDeliveryAsync(subscription, message, ct);
            return Outcome.Sent;
        }
        catch (PushServiceClientException error) when (error.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return Outcome.Gone;
        }
        catch (PushServiceClientException error) when ((int)error.StatusCode is 429 or >= 500)
        {
            LogTemporary(push.DeviceId, (int)error.StatusCode);
            return Outcome.Temporary;
        }
        catch (PushServiceClientException error)
        {
            // For example 400 (bad message), 403 (VAPID keys do not match), 413 (too large).
            LogRejected(push.DeviceId, (int)error.StatusCode);
            return Outcome.Rejected;
        }
        catch (Exception error) when (error is HttpRequestException
            || (error is TaskCanceledException && !ct.IsCancellationRequested)) // Timeout.
        {
            LogTemporary(push.DeviceId, 0);
            return Outcome.Temporary;
        }
    }

    /// <summary>
    /// A newer message with the same topic replaces an undelivered older one, so a phone that
    /// was offline gets one posture reminder, not one per missed firing. Topics are at most 32
    /// URL-safe base64 characters, so the key is hashed.
    /// </summary>
    public static string Topic(string reminderKey) =>
        Base64Url.EncodeToString(SHA256.HashData(Encoding.UTF8.GetBytes(reminderKey)))[..32];

    // Logs name the device id and status code only, never the push address or keys.
    [LoggerMessage(Level = LogLevel.Information, Message = "Device {DeviceId} unsubscribed; forgot it.")]
    private partial void LogForgotten(Guid deviceId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push for device {DeviceId} failed temporarily (status {Status}).")]
    private partial void LogTemporary(Guid deviceId, int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Gave up on this push for device {DeviceId} after one retry.")]
    private partial void LogGaveUp(Guid deviceId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push service rejected the push for device {DeviceId} (status {Status}).")]
    private partial void LogRejected(Guid deviceId, int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Device {DeviceId} has a push address that is no longer allowed; not sent.")]
    private partial void LogNotAllowed(Guid deviceId);
}
