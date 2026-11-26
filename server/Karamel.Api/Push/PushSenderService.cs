using Karamel.Api.Devices;
using Microsoft.Extensions.Options;

namespace Karamel.Api.Push;

/// <summary>Runs the push sender every few seconds while the server runs.</summary>
public sealed partial class PushSenderService(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    IOptions<PushOptions> options,
    ILogger<PushSenderService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.Value.SendIntervalSeconds), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<PushDispatcher>().SendDueAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                // An unhandled exception would stop the whole server (the default since .NET 8).
                // A database hiccup should only cost one round: try again on the next tick.
                LogRoundFailed(error);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Sending due reminders failed; trying again on the next tick.")]
    private partial void LogRoundFailed(Exception error);
}
