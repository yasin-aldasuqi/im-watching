using System.Buffers.Text;
using System.Net;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;

namespace Karamel.Api.Tests;

public class AuthTests(PostgresDatabase database) : ApiTestBase(database)
{
    [Theory]
    [InlineData("no header")]
    [InlineData("not base64")]
    [InlineData("too short")]
    [InlineData("wrong secret")]
    [InlineData("another device's secret")]
    [InlineData("unknown device")]
    [InlineData("Basic scheme")]
    public async Task Only_the_devices_own_secret_can_change_or_delete_it(string attempt)
    {
        var device = await RegisterAsync();
        var other = await RegisterAsync();
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("posture")));

        var (deviceId, secret, scheme) = attempt switch
        {
            "no header" => (device.DeviceId, null, "Bearer"),
            "not base64" => (device.DeviceId, "not*base64!", "Bearer"),
            "too short" => (device.DeviceId, Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16)), "Bearer"),
            "wrong secret" => (device.DeviceId, Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32)), "Bearer"),
            "another device's secret" => (device.DeviceId, other.Secret, "Bearer"),
            "unknown device" => (Guid.NewGuid(), device.Secret, "Bearer"),
            "Basic scheme" => (device.DeviceId, device.Secret, "Basic"),
            _ => throw new ArgumentOutOfRangeException(nameof(attempt)),
        };

        var put = await SendAsync(HttpMethod.Put, $"/api/devices/{deviceId}/schedules", secret,
            System.Net.Http.Json.JsonContent.Create(Schedules()), scheme);
        var delete = await SendAsync(HttpMethod.Delete, $"/api/devices/{deviceId}", secret, null, scheme);

        foreach (var response in new[] { put, delete })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("Bearer", response.Headers.WwwAuthenticate.ToString());
        }
        await using var db = Database.CreateContext();
        Assert.True(await db.Devices.AnyAsync(d => d.Id == device.DeviceId));
        Assert.Equal(1, await db.ReminderSchedules.CountAsync(s => s.DeviceId == device.DeviceId));
    }
}
