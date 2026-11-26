# Karamel server

The backend for **reminders while Karamel is closed**. Phones freeze a web page soon after you
leave it, so the page cannot send its own notifications. This server sends a Web Push message at
the right time instead, and the phone's push service (for example Apple's) wakes Karamel to show
it.

> Status: step 1 of 5, the foundation (project, database, health check, tests, CI). The API, the
> push sender, the website changes, and hosting come in the next pull requests.

## What it stores

The server is designed to know as little as possible:

| Table | Holds | Does not hold |
| --- | --- | --- |
| `devices` | the push address the browser gave out, its encryption keys, a SHA-256 hash of the device's secret key, and two timestamps | names, emails, IP addresses, reminder names or messages |
| `reminder_schedules` | a reminder id (such as `posture`), its next time, and its interval | the reminder's name or messages; the device turns the id back into text itself |

- The device's secret key is never stored, only its hash, like a password hash. A leaked database
  does not let anyone change a device's reminders.
- The database enforces its own rules (so they hold even if the code has a bug): one device per
  push address, a hash of exactly 32 bytes, positive intervals, one schedule per reminder per
  device, and deleting a device deletes its schedules (`ON DELETE CASCADE`).

## Tech

- ASP.NET Core minimal API on **.NET 10 (LTS**, supported until November 2028), not .NET 11
  (short-term support).
- PostgreSQL with EF Core (Npgsql) and snake_case names. The schema lives in committed
  migrations (`Karamel.Api/Data/Migrations`).
- Every endpoint is under `/api`. The website will forward `/api/*` to this server, so the browser
  only talks to the website's own origin: the CSP stays `connect-src 'self'` and no CORS is needed.
- `TreatWarningsAsErrors`, NuGet lock files (`packages.lock.json`), and `dotnet format` in CI.

## Run it locally

Needs the .NET 10 SDK and PostgreSQL.

```bash
cd server
dotnet tool restore                      # the EF Core command-line tool (dotnet-ef)
dotnet ef database update -p Karamel.Api # create the tables
dotnet run --project Karamel.Api         # http://localhost:5080
curl localhost:5080/api/health           # "Healthy", or 503 "Unhealthy" without a database
```

The development connection string is in `Karamel.Api/appsettings.Development.json`
(port 55432, user `karamel`, no password). Elsewhere, set the environment variable
`ConnectionStrings__Karamel`. The app refuses to start without it.

## Tests

```bash
cd server
dotnet test
```

The tests use **a real PostgreSQL**, not an in-memory fake, because the fakes skip constraints,
unique indexes, and locking. Each test class creates its own database, builds it with the real
migrations, and drops it afterwards. Point them at a server with the environment variable
`KARAMEL_TEST_POSTGRES` (default `Host=localhost;Port=55432;Username=karamel`; the user needs the
`CREATEDB` right). In CI, a `postgres:18` service container is used.

- `HealthTests`: healthy with the database, 503 without it (the real app, in memory).
- `SchemaTests`: the migrations match the model, and every database rule above, checked by
  asserting PostgreSQL's own error code and constraint name.

Each guarantee was checked by breaking it on purpose: removing the cascade or the unique index
from the migration, changing the model without a migration, and a health check that always says
"healthy" each make a test fail.
