# Karamel server

The backend for **reminders while Karamel is closed**. Phones freeze a web page soon after you
leave it, so the page cannot send its own notifications. This server sends a Web Push message at
the right time instead, and the phone's push service (for example Apple's) wakes Karamel to show
it.

> Status: step 2 of 5. Done: the foundation (project, database, health check, CI) and the API.
> Next: the push sender, the website changes, and hosting.

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

## API

All JSON, all under `/api`.

| Method and path | Auth | What it does |
| --- | --- | --- |
| `GET /api/health` | none | `200 Healthy` when the database answers, `503 Unhealthy` when not. Never rate-limited. |
| `POST /api/devices` | none | Body: `{"subscription": <PushSubscription.toJSON()>}`. Returns `201` with `{"deviceId", "secret"}`. |
| `PUT /api/devices/{id}/schedules` | `Bearer <secret>` | Body: `{"schedules": [{"reminderKey", "firesInSeconds", "intervalSeconds"}]}`. Replaces the whole list (empty clears it). `204`. |
| `DELETE /api/devices/{id}` | `Bearer <secret>` | Forgets the device and its schedules. `204`. |

Errors use Problem Details (RFC 9457): `400` with an `errors` object per field, `401` (with
`WWW-Authenticate: Bearer`), `413`, and `429` (with `Retry-After`).

### Design decisions

- **Only real push services as push addresses** (`Push:AllowedEndpointHosts` in
  `appsettings.json`: Apple, Google, Mozilla, Microsoft). The push sender will send requests to
  these addresses, so without the list, anyone could make the server call any URL, such as a cloud
  metadata address (SSRF). Only `https`, port 443, a host name (no IP), and no `user@` part.
  `*.example.com` needs a real subdomain with a dot boundary.
- **The device secret**: 32 random bytes, returned once, stored only as SHA-256. A fast hash is
  fine for a random 256-bit key (slow hashes like bcrypt are for guessable passwords). It is
  compared in constant time. An unknown device and a wrong key get the same `401`, so responses do
  not reveal which ids exist.
- **Relative times**: `firesInSeconds` instead of a clock time. The server adds it to its own
  clock, so a phone with a wrong clock cannot shift its reminders.
- **Replace the whole list**: the app sends all its reminders after any change. One simple,
  idempotent call instead of separate add, change, and remove calls.
- **Registering again**: the same push address keeps its device id, gets a new secret, and loses
  its schedules, so whoever held the old secret no longer controls the device. This is useful
  when the app lost its secret (for example, cleared site data). Anyone registering an address
  must know it, and only the browser and its push service do.
- **Concurrency**, both checked with parallel requests against real PostgreSQL:
  - Registration is one `INSERT … ON CONFLICT (push_endpoint) DO UPDATE` statement, so two
    registrations of one address at the same moment cannot both insert.
  - Replacing schedules first updates the device's `last_seen_at`, which also **locks its row**
    until the commit. A second update for the same device waits, so the result is always one
    whole list. Without the lock, both would insert `posture` and one would fail with a
    duplicate key error (a `500`), which a test showed.
- **Limits**: bodies up to 16 KB (refused by Kestrel before reading), up to 20 schedules, reminder
  keys `^[a-z0-9-]{1,64}\z` (`\z`, because `$` also matches before a final newline), intervals
  from 30 seconds to 1 day, and `firesInSeconds` up to 7 days. The JSON reader refuses missing or
  `null` required fields and duplicated fields.
- **Rate limits** (`RateLimits` in `appsettings.json`, per minute): all requests together (600),
  registrations together (30), and each device (60). Not per IP address, because every request
  arrives through the website's proxy and would share its IP. The overall ceiling also bounds how
  many per-device limiters a flood of made-up device ids can create. The trade-off: a flood of
  registrations can block other registrations for a minute, but cannot reach the database in bulk.
- **Logs**: EF Core logs SQL without parameter values (they show as `'?'`), so secrets, hashes,
  and push addresses do not end up in logs.

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
- `RegisterTests`: registering stores only the secret's hash; every push service is accepted;
  15 addresses outside them are refused (SSRF cases); malformed keys and JSON are refused;
  registering again rotates the secret; 30 simultaneous registrations of one address leave one
  device with exactly one working secret.
- `AuthTests`: no header, a malformed or short key, a wrong key, another device's key, an unknown
  device, and the Basic scheme all get `401` and change nothing.
- `ScheduleTests`: times come from the server's (fake) clock, each update replaces the whole list,
  12 kinds of invalid lists are refused and change nothing, 40 simultaneous updates end with one
  whole list, and forgetting a device deletes everything.
- `LimitTests`: registration, per-device, and overall rate limits; and on the real Kestrel server,
  bodies over 16 KB get `413`.

Each guarantee was checked by breaking it on purpose (17 times so far): for example, removing the
row lock, the `ON CONFLICT`, the dot boundary for `*.` hosts, the `user@`/port check, the hash
(storing the secret itself), the constant-time comparison, `\z`, the JSON strictness options, the
body size limit, or the overall rate limit each make a test fail. The tests also ran three times in
a row without the row lock (failed every time) and three times with it (passed every time).
