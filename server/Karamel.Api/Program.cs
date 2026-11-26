using Karamel.Api.Data;
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

builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();

// Everything lives under /api: the website forwards /api/* here, so the
// browser only ever talks to the website's own origin.
app.MapHealthChecks("/api/health");

app.Run();
