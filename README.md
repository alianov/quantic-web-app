# Cafe Fausse

Cafe Fausse is a complete five-page restaurant web application built for the
provided Software Requirements Specification. It uses React and CSS for the
interface, Flask for the REST API, PostgreSQL for stored data, and Docker
Compose for local development and a production-like demo.

Read [ARCHITECTURE_WORKBOOK.md](quantic_docs/ARCHITECTURE_WORKBOOK.md) for a B2-level guide
to the system boundaries, request flows, data rules, failure behavior, and safe
change steps.

Use [DEMO_GUIDE.md](quantic_docs/DEMO_GUIDE.md) for the required 5–10 minute recording and
final submission checklist.

## Prerequisites

- Docker Desktop with Docker Compose.
- Make and curl for the short helper commands.
- Node.js 22.12 or newer only if you want to run frontend checks outside
  Docker. The application build itself uses the supported Node 22 container.

## Included features

- Home, Menu, Reservations, About Us, and Gallery pages.
- Responsive navigation and layouts for desktop, tablet, and mobile screens.
- Full menu, restaurant story, contact details, hours, awards, and reviews from
  the SRS.
- Accessible gallery lightbox with keyboard controls.
- Newsletter signup with server-side validation and PostgreSQL storage.
- Live reservation availability and confirmation with a random table number.
- Clear form errors without losing the user's entered data.
- The four restaurant images supplied with the assignment.
- Flask unit tests and database rules that prevent overlapping table bookings.

## Reservation rules

The SRS leaves some booking details open. This implementation uses the
approved course-demo defaults:

- Restaurant timezone: `America/New_York` (Washington, DC).
- Start times every 30 minutes.
- Each reservation keeps its table for two hours.
- Party size from 1 to 12 guests.
- 30 tables, with one available table chosen at random.
- Booking dates from today through 90 days ahead.
- Monday–Saturday: 5:00 PM–11:00 PM.
- Sunday: 5:00 PM–9:00 PM.

The last start time leaves enough time for the two-hour visit before closing.
PostgreSQL rejects any overlapping use of the same table, even when two
requests reach the API at nearly the same time.

`time_slot` remains the canonical timestamp. PostgreSQL generates `local_time`
beside it as the matching Washington wall-clock value for database inspection.
Booking and conflict logic always uses `time_slot`.

## Run options

First-time Make commands create `.env` from the safe local example when needed.

| Mode | Command | URLs |
| --- | --- | --- |
| Development debugging | `make up` | Web `http://127.0.0.1:5173`, API `http://127.0.0.1:8000` |
| Production-like demo | `make demo` | Web `https://localhost:9443` or `https://127.0.0.1:9443` |
| Development debugging + database viewer | `make tools` | Web `http://127.0.0.1:5173`, Adminer `http://127.0.0.1:8091` |
| Demo + database viewer | `make demo-tools` | Web `https://localhost:9443`, Adminer `https://localhost:9443/adminer/` |

`make up` uses `compose.override.yaml` automatically. It enables React and
Flask hot reload and publishes loopback HTTP ports for debugging. Demo commands
use only `compose.yaml`: Gunicorn serves Flask, Caddy serves the compiled React
bundle over local HTTPS, and PostgreSQL stays private. Requests to
`http://localhost:8080` and `http://127.0.0.1:8080` redirect to their matching
HTTPS addresses on port `9443`.

In demo mode, Adminer is available only through Caddy at `/adminer/`. Its
direct port `8091` is available only in development debugging mode.

To run without Make:

```bash
cp .env.example .env
docker compose up --build

# Production-like local build without the development override.
docker compose -f compose.yaml up --build -d --wait

# Add the optional database viewer.
docker compose --profile tools up --build
```

In Adminer, use `postgres` as the server and the database credentials from
`.env`.

### Trust the local HTTPS certificate

Caddy creates an internal certificate authority (CA) because public CAs do not
issue certificates for `localhost`. Its data volume keeps the same local CA
when the container is rebuilt.

Start the demo and copy its public root certificate to a temporary file:

```bash
make demo
make demo-ca
```

On macOS, trust that certificate for a warning-free browser demo:

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  /tmp/cafe-fausse-caddy-root.crt
```

Restart the browser after this step. Some browsers, including some Firefox
setups, use their own certificate store and may need a separate import. Trust
only the certificate copied from your own stack. Never copy or commit Caddy's
CA private key or its `/data` directory.

## API routes

| Method and path | Purpose |
| --- | --- |
| `GET /api/healthz` | Check that Flask is alive. |
| `GET /api/readyz` | Check that Flask can reach PostgreSQL. |
| `GET /api/availability?date=YYYY-MM-DD` | List valid start times and free table counts. |
| `POST /api/reservations` | Validate and create a reservation. |
| `POST /api/newsletter` | Store a normalized newsletter email. |

Browser requests use relative `/api` paths. Vite proxies them during HTTP
debugging. In demo mode, Caddy receives HTTPS traffic and proxies `/api`
requests to Flask over the private Docker network.

## Verification

```bash
docker compose --env-file .env.example config --quiet
docker compose -f compose.yaml --env-file .env.example config --quiet

# Frontend logic check and production bundle.
npm --prefix frontend run check

# Backend tests inside the pinned API image.
docker compose --env-file .env.example run --rm --no-deps \
  api python -m unittest -v test_app

# Real PostgreSQL capacity test. It removes only its own temporary records.
docker compose run --rm -e RUN_POSTGRES_INTEGRATION=1 \
  api python -m unittest -v test_app.CafeFaussePostgresIntegrationTests

# Start the development stack, then check its database-backed readiness.
docker compose --env-file .env.example up -d --build --wait
curl -fsS http://127.0.0.1:5173/api/readyz
```

Use `docker compose ps` and `docker compose logs -f api postgres` if startup
fails. Run `make demo-smoke` to copy the local CA certificate and check the
HTTPS application route without disabling certificate checks. After starting
`make demo-tools`, run `make demo-tools-smoke` to check both the application
and Adminer. If you change
`WEB_HTTPS_PORT`, pass the matching URL, for example
`make demo-smoke DEMO_BASE_URL=https://127.0.0.1:10443`.

## Showing stored data in the course demo

Run `make demo-tools`, submit a newsletter email, and create a reservation.
Then open Adminer at `https://localhost:9443/adminer/`, sign in with the `.env` database
values, and show the `customers` and `reservations` rows.

You can also use PostgreSQL directly:

```bash
docker compose exec postgres psql -U cafe_fausse -d cafe_fausse \
  -c "SELECT * FROM reservations ORDER BY created_at DESC;"
```

## Architecture and safety

```text
Browser --HTTP debugging--> Vite -------> Flask API -----> PostgreSQL
Browser --HTTPS demo-----> Caddy --/api--^                    ^
                              \--/adminer--> Adminer ----------/
```

- `web` is the only host-facing entry point in demo mode.
- `api` joins the frontend and backend networks.
- `postgres` uses a named volume and has no host port in demo mode.
- `adminer` is optional and has no direct host port in demo mode. Caddy exposes
  it under the loopback-only HTTPS gateway.
- Caddy terminates local HTTPS and adds compression, a small request limit,
  and security headers.

The SQL bootstrap runs only when Docker creates a fresh PostgreSQL volume. Use
a migration tool before changing a schema that already contains important
data. A shared deployment needs a real domain with a publicly trusted
certificate, managed secrets, backups, and a hosting plan.

To stop containers while preserving data:

```bash
make down
```

`docker compose -f compose.yaml --profile tools down --volumes` deletes the
local database and Caddy's local certificate authority. The database deletion
cannot be undone, and a new CA must be trusted after the next demo start.
Remove the old Caddy root from the system trust store if you no longer use it.

## Deliberate omissions

Newsletter delivery, an admin dashboard, Redis, background workers, and cloud
deployment are outside the approved scope. Newsletter signups are stored only.
Adminer gives the course demo a database view through Caddy without adding a
product administration feature.
