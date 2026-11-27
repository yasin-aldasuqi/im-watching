using System.Collections.Concurrent;
using System.Net;

namespace Karamel.Api.Tests;

/// <summary>A request the sender made to a push service.</summary>
public sealed record PushRequest(HttpMethod Method, Uri Uri, IReadOnlyDictionary<string, string> Headers, byte[] Body)
{
    public string Endpoint => Uri.OriginalString;
}

/// <summary>
/// Stands in for Apple's, Google's, or Mozilla's push service: records every request and
/// answers with the status a test chooses (201 Created by default). Nothing leaves the machine.
/// </summary>
public sealed class FakePushService : HttpMessageHandler
{
    private readonly ConcurrentQueue<PushRequest> _requests = new();

    public IReadOnlyList<PushRequest> Requests => [.. _requests];

    /// <summary>Decides the answer per request. Throwing simulates a network error.</summary>
    public Func<PushRequest, HttpStatusCode> Respond { get; set; } = _ => HttpStatusCode.Created;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var headers = request.Headers.Concat(request.Content?.Headers ?? Enumerable.Empty<KeyValuePair<string, IEnumerable<string>>>())
            .ToDictionary(h => h.Key, h => string.Join(", ", h.Value), StringComparer.OrdinalIgnoreCase);
        var body = request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(ct);
        var recorded = new PushRequest(request.Method, request.RequestUri!, headers, body);
        _requests.Enqueue(recorded);
        return new HttpResponseMessage(Respond(recorded)) { RequestMessage = request };
    }

    // HttpClientFactory disposes handlers when it recycles them; this fake must outlive that.
    protected override void Dispose(bool disposing) { }
}
