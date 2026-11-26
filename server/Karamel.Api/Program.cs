using Karamel.Api.Data;
using Karamel.Api.Devices;
using Karamel.Api.Health;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Fail at startup, with a clear message, instead of on the first request.
var connectionString = builder.Configuration.GetConnectionString("Karamel")
    ?? throw new InvalidOperationException(
        "Missing the connection string 'ConnectionStrings:Karamel' " +
        "(environment variable ConnectionStrings__Karamel).");

builder.Services.AddDbContext<KaramelDb>(options => options
    .UseNpgsql(connectionString)
    .UseSnakeCaseNamingConvention());

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

builder.Services.AddOptions<PushOptions>()
    .Bind(builder.Configuration.GetSection("Push"))
    .Validate(push => push.AllowedEndpointHosts.Count > 0, "Push:AllowedEndpointHosts must not be empty.")
    .ValidateOnStart();

var rateLimits = builder.Configuration.GetSection("RateLimits").Get<RateLimitOptions>() ?? new RateLimitOptions();
builder.Services.AddKaramelRateLimits(rateLimits);

// Every request body here is tiny. Bigger ones are refused before they are read.
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 16 * 1024);

builder.Services.ConfigureHttpJsonOptions(json =>
{
    // Missing or null required fields fail as 400 Bad Request instead of becoming nulls.
    json.SerializerOptions.RespectNullableAnnotations = true;
    json.SerializerOptions.RespectRequiredConstructorParameters = true;
    // {"endpoint": "a", "endpoint": "b"} is ambiguous, so it is refused.
    json.SerializerOptions.AllowDuplicateProperties = false;
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

// Everything lives under /api: the website forwards /api/* here, so the browser
// only ever talks to the website's own origin.
// Health probes from the hosting platform must always get through, even during a flood.
app.MapHealthChecks("/api/health").DisableRateLimiting();
app.MapDeviceEndpoints();

app.Run();
