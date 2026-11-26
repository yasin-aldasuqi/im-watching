using Karamel.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Karamel.Api.Devices;

/// <summary>
/// Lets a request through only with the device's own secret key. An unknown device and a
/// wrong key get the same answer, so the response does not reveal which device ids exist.
/// </summary>
public sealed class DeviceSecretFilter(KaramelDb db) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var presented = DeviceSecret.HashFromAuthorizationHeader(http.Request.Headers.Authorization);
        if (presented is null
            || http.Request.RouteValues["deviceId"] is not string raw
            || !Guid.TryParse(raw, out var deviceId))
        {
            return Unauthorized(http);
        }

        var stored = await db.Devices
            .Where(d => d.Id == deviceId)
            .Select(d => d.SecretHash)
            .SingleOrDefaultAsync(http.RequestAborted);
        if (stored is null || !DeviceSecret.Matches(presented, stored))
            return Unauthorized(http);

        return await next(context);
    }

    public static ProblemHttpResult Unauthorized(HttpContext http)
    {
        http.Response.Headers.WWWAuthenticate = "Bearer";
        return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Unknown device or wrong secret.");
    }
}
