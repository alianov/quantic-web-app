# Cafe Fausse

Cafe Fausse is a complete five-page restaurant web application built for the
provided Software Requirements Specification. It uses React and CSS for the
interface, Flask for the REST API, PostgreSQL for stored data, and Docker
Compose for local development and a production-like demo.

Read [ARCHITECTURE_WORKBOOK.md](ARCHITECTURE_WORKBOOK.md) for a B2-level guide
to the system boundaries, request flows, data rules, failure behavior, and safe
change steps.

Use [DEMO_GUIDE.md](DEMO_GUIDE.md) for the required 5–10 minute recording and
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

## Run options

First-time Make commands create `.env` from the safe local example when needed.

| Mode | Command | URLs |
| --- | --- | --- |
| Development | `make up` | Web `http://127.0.0.1:5173`, API `http://127.0.0.1:8000` |
| Production-like demo | `make demo` | Web `http://127.0.0.1:8080` |
| Development + database viewer | `make tools` | Web `http://127.0.0.1:5173`, Adminer `http://127.0.0.1:8091` |
| Demo + database viewer | `make demo-tools` | Web `http://127.0.0.1:8080`, Adminer `http://127.0.0.1:8091` |

`make up` uses `compose.override.yaml` automatically. It enables React and
Flask hot reload and publishes local developer ports. Demo commands use only
`compose.yaml`: Gunicorn serves Flask, Caddy serves the compiled React bundle,
and PostgreSQL stays private.

To run without Make:

```bash
cp .env.example .env
docker compose up --build

# Production-like local build without the development override.
docker compose -f compose.yaml up --build -d

# Add the optional database viewer.
docker compose --profile tools up --build
```

In Adminer, use `postgres` as the server and the database credentials from
`.env`.

## API routes

| Method and path | Purpose |
| --- | --- |
| `GET /api/healthz` | Check that Flask is alive. |
| `GET /api/readyz` | Check that Flask can reach PostgreSQL. |
| `GET /api/availability?date=YYYY-MM-DD` | List valid start times and free table counts. |
| `POST /api/reservations` | Validate and create a reservation. |
| `POST /api/newsletter` | Store a normalized newsletter email. |

Browser requests use relative `/api` paths. Vite proxies them in development,
and Caddy proxies them in demo mode.

## Verification

```bash
docker compose --env-file .env.example config --quiet
docker compose -f compose.yaml --env-file .env.example config --quiet

# Frontend logic check and production bundle.
npm --prefix frontend run check

# Backend tests inside the pinned API image.
docker compose --env-file .env.example run --rm --no-deps \
  api python -m unittest -v test_app

# Start the development stack, then check its database-backed readiness.
docker compose --env-file .env.example up -d --build --wait
curl -fsS http://127.0.0.1:5173/api/readyz
```

Use `docker compose ps` and `docker compose logs -f api postgres` if startup
fails. Run `make smoke BASE_URL=http://127.0.0.1:8080` for the demo build.

## Showing stored data in the course demo

Run `make demo-tools`, submit a newsletter email, and create a reservation.
Then open Adminer at `http://127.0.0.1:8091`, sign in with the `.env` database
values, and show the `customers` and `reservations` rows.

You can also use PostgreSQL directly:

```bash
docker compose exec postgres psql -U cafe_fausse -d cafe_fausse \
  -c "SELECT * FROM reservations ORDER BY created_at DESC;"
```

## Architecture and safety

```text
Browser -> Vite (development) or Caddy (demo) -> Flask API -> PostgreSQL
                                                     |
                                      private backend network
```

- `web` is the only host-facing entry point in demo mode.
- `api` joins the frontend and backend networks.
- `postgres` uses a named volume and has no host port in demo mode.
- `adminer` is optional, loopback-only, and only for local inspection.
- Caddy adds compression, a small request limit, and security headers.

The SQL bootstrap runs only when Docker creates a fresh PostgreSQL volume. Use
a migration tool before changing a schema that already contains important
data. A shared deployment also needs HTTPS, managed secrets, backups, and a
real hosting plan.

To stop containers while preserving data:

```bash
docker compose down
```

`docker compose down --volumes` deletes the local database and cannot be
undone.

## Deliberate omissions

Newsletter delivery, an admin dashboard, Redis, background workers, and cloud
deployment are outside the approved scope. Newsletter signups are stored only.
Adminer gives the course demo a direct database view without adding a product
administration feature.
