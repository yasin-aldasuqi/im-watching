using System.Net;
using Microsoft.EntityFrameworkCore;

namespace Karamel.Api.Tests;

public class ScheduleTests(PostgresDatabase database) : ApiTestBase(database)
{
    [Fact]
    public async Task Times_are_counted_from_the_servers_clock()
    {
        var device = await RegisterAsync();
        Api.Clock.Advance(TimeSpan.FromMinutes(10));
        var now = Api.Clock.GetUtcNow();

        var response = await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(
            Schedule("posture", firesIn: 1800, interval: 1800),
            Schedule("custom-k3x9", firesIn: 60, interval: null)));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = Database.CreateContext();
        var saved = await db.ReminderSchedules
            .Where(s => s.DeviceId == device.DeviceId)
            .ToDictionaryAsync(s => s.ReminderKey);
        Assert.Equal(now.AddSeconds(1800), saved["posture"].NextFireAt);
        Assert.Equal(1800, saved["posture"].IntervalSeconds);
        Assert.Equal(now.AddSeconds(60), saved["custom-k3x9"].NextFireAt);
        Assert.Null(saved["custom-k3x9"].IntervalSeconds);
        Assert.Equal(now, (await db.Devices.SingleAsync(d => d.Id == device.DeviceId)).LastSeenAt);
    }

    [Fact]
    public async Task Each_update_replaces_the_whole_list()
    {
        var device = await RegisterAsync();
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("posture"), Schedule("water")));
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("eyes")));
        Assert.Equal(["eyes"], await KeysAsync(device.DeviceId));

        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules());
        Assert.Empty(await KeysAsync(device.DeviceId));
    }

    private static string Item(string key, int firesIn = 60, string interval = "1800") =>
        $$"""{"reminderKey":"{{key}}","firesInSeconds":{{firesIn}},"intervalSeconds":{{interval}}}""";

    public static TheoryData<string, string> InvalidLists => new()
    {
        { $"[{Item("water")},{Item("water")}]", "schedules[1].reminderKey" },
        { $"[{Item("Posture")}]", "schedules[0].reminderKey" },
        { $"[{Item("posture\\n")}]", "schedules[0].reminderKey" }, // a regex ending in $ would let this through
        { $"[{Item("")}]", "schedules[0].reminderKey" },
        { $"[{Item(new string('a', 65))}]", "schedules[0].reminderKey" },
        { $"[{Item("posture", firesIn: -1)}]", "schedules[0].firesInSeconds" },
        { $"[{Item("posture", firesIn: 7 * 86400 + 1)}]", "schedules[0].firesInSeconds" },
        { $"[{Item("posture", interval: "29")}]", "schedules[0].intervalSeconds" },
        { $"[{Item("posture", interval: "0")}]", "schedules[0].intervalSeconds" },
        { $"[{Item("posture", interval: "86401")}]", "schedules[0].intervalSeconds" },
        { "[" + string.Join(",", Enumerable.Range(0, 21).Select(i => Item($"custom-{i}"))) + "]", "schedules" },
        { "[null]", "schedules[0]" },
    };

    [Theory]
    [MemberData(nameof(InvalidLists))]
    public async Task Invalid_lists_are_refused_and_change_nothing(string list, string field)
    {
        var device = await RegisterAsync();
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("posture")));

        var response = await PutSchedulesJsonAsync(device.DeviceId, device.Secret, $$"""{"schedules":{{list}}}""");

        var errors = await ValidationErrorsAsync(response);
        Assert.Contains(field, errors.Keys);
        Assert.Equal(["posture"], await KeysAsync(device.DeviceId));
    }

    [Fact]
    public async Task Simultaneous_updates_for_one_device_end_with_one_whole_list()
    {
        var device = await RegisterAsync();

        // Each request sends three reminders that all fire at its own, different time.
        var responses = await Task.WhenAll(Enumerable.Range(0, 40).Select(i =>
            PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(
                Schedule("posture", firesIn: 100 + i),
                Schedule("water", firesIn: 100 + i),
                Schedule("eyes", firesIn: 100 + i)))));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.NoContent, response.StatusCode));
        await using var db = Database.CreateContext();
        var saved = await db.ReminderSchedules.Where(s => s.DeviceId == device.DeviceId).ToListAsync();
        Assert.Equal(3, saved.Count);
        Assert.Single(saved.Select(s => s.NextFireAt).Distinct()); // All from the same request: no mix.
    }

    [Fact]
    public async Task Forgetting_a_device_deletes_it_and_its_schedules()
    {
        var device = await RegisterAsync();
        await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules(Schedule("posture"), Schedule("water")));

        var response = await DeleteDeviceAsync(device.DeviceId, device.Secret);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using (var db = Database.CreateContext())
        {
            Assert.False(await db.Devices.AnyAsync(d => d.Id == device.DeviceId));
            Assert.Empty(await KeysAsync(device.DeviceId));
        }
        var afterwards = await PutSchedulesAsync(device.DeviceId, device.Secret, Schedules());
        Assert.Equal(HttpStatusCode.Unauthorized, afterwards.StatusCode);
    }

    private async Task<List<string>> KeysAsync(Guid deviceId)
    {
        await using var db = Database.CreateContext();
        return await db.ReminderSchedules
            .Where(s => s.DeviceId == deviceId)
            .OrderBy(s => s.ReminderKey)
            .Select(s => s.ReminderKey)
            .ToListAsync();
    }
}
