# Cafe Fausse Architecture Workbook

## Purpose and audience

This workbook explains the complete Cafe Fausse course application to a
mid-level developer. It uses direct language and focuses on decisions that
affect future changes.

The main rule is simple: keep the browser, API, and database responsibilities
separate. Put business rules in Flask and final data guarantees in PostgreSQL.

## 1. Current delivery status

The required course application is implemented.

- Home, Menu, Reservations, About Us, and Gallery React pages.
- Responsive Flexbox and Grid layouts with an accessible navigation menu.
- An accessible gallery lightbox and optimized local images.
- Newsletter storage and live reservation availability through the Flask API.
- Server-side validation and clear user-facing success or error messages.
- Random assignment across 30 tables with transaction-safe overlap protection.
- PostgreSQL tables for customers and reservations.
- Docker development and production-like demo modes.
- Caddy local HTTPS, HTTP redirection, routing, compression, request-size
  limits, and security headers.
- Health-gated startup, private networks, and optional Adminer access.
- Focused frontend logic checks, Flask unit tests, and real database checks.

Cloud hosting, email delivery, cancellations, and a product admin dashboard are
outside the approved scope. The local demo uses HTTPS with Caddy's internal
certificate authority. It is not a public production deployment because it has
no public domain or publicly trusted certificate.

## 2. Repository map

| Path | Responsibility |
| --- | --- |
| `compose.yaml` | Production-like service definitions and private networks. |
| `compose.override.yaml` | Local hot reload, bind mounts, and loopback ports. |
| `.env.example` | Supported local configuration and safe example values. |
| `backend/app.py` | Validation, availability, booking, newsletter, and health routes. |
| `backend/test_app.py` | Focused Flask and booking-rule unit tests. |
| `backend/Dockerfile` | Python runtime and Gunicorn command. |
| `database/init.sql` | First-volume database bootstrap. |
| `frontend/src/` | React pages, forms, routing, and presentation logic. |
| `frontend/public/images/` | The four supplied WebP restaurant images used by the pages. |
| `frontend/scripts/` | Small runnable checks for non-visual client logic. |
| `frontend/vite.config.js` | Local `/api` proxy. |
| `frontend/Caddyfile` | Demo HTTPS, HTTP redirection, static hosting, and `/api` reverse proxy. |
| `Makefile` | Short commands for common stack modes. |
| `README.md` | Setup, feature, API, and safety quick reference. |
| `quantic_docs/` | Architecture, demo, AI disclosure, and local assignment references. |

## 3. System context

```text
Browser ──HTTP──> Vite (development debugging) ─┐
                                                ├──HTTP /api/*──> Flask API
Browser ─HTTPS──> Caddy (demo) ──/api───────────────┘                    │
                         │                                               │ SQL
                         └──/adminer──> Adminer ─────────────────────────┤
HTTP :8080 ──308 redirect──> HTTPS :9443                                 │
                                                                           v
                                                                      PostgreSQL
```

The browser never connects to PostgreSQL. In demo mode, it also cannot connect
to Flask directly. Caddy is the single browser entry point. It receives local
HTTPS traffic, forwards `/api/*` requests to Flask, and exposes the optional
Adminer service under `/adminer/` without giving it a direct demo host port.

## 4. Component boundaries

| Component | Owns | Does not own |
| --- | --- | --- |
| React | Pages, forms, client navigation, accessible feedback. | Booking capacity or database rules. |
| Vite | Local build server and local `/api` proxy. | Production traffic. |
| Caddy | Local TLS, HTTP redirection, compiled files, API and Adminer proxying, small request limits, headers. | Reservation decisions. |
| Flask | Validation, workflow rules, transactions, response messages. | Final uniqueness guarantees. |
| PostgreSQL | Persistent records, foreign keys, checks, uniqueness. | User interface behavior. |
| Adminer | Local inspection during development and the demo. | Product administration. |

When a rule protects data, enforce it in PostgreSQL even if Flask also checks
it. Two browser requests can reach Flask at nearly the same time.

## 5. Runtime modes

### Development mode

Run `make up`. Docker Compose reads both Compose files automatically.

- Vite serves React on loopback host port `5173` over HTTP.
- Flask's debug server is available on loopback host port `8000` over HTTP.
- PostgreSQL is available on host port `5432` for local tools.
- Source directories are mounted into the containers for hot reload.
- All published ports bind to `127.0.0.1` by default.

These HTTP addresses are direct debugging endpoints. Use the production-like
demo mode when testing browser behavior over HTTPS.

### Production-like demo mode

Run `make demo`. The command passes only `compose.yaml`, so the development
override is not loaded.

- Caddy serves the compiled React bundle over HTTPS on host port `9443`.
- HTTP requests on host port `8080` receive a permanent redirect to HTTPS.
- Gunicorn runs Flask with two workers.
- Flask and PostgreSQL have no host ports.
- Containers use restart policies.
- A named Caddy data volume keeps the local certificate authority across
  container rebuilds.

This mode checks packaging and routing. It is not a complete public deployment
because it uses an internal local certificate authority and local environment
variables instead of a public domain and managed services.

Run `make demo-ca` after the demo starts to copy Caddy's public root
certificate to `/tmp/cafe-fausse-caddy-root.crt`. Trust that certificate in
the browser's certificate store for a warning-free demo. Run `make demo-smoke`
to copy the certificate and verify the HTTPS route without disabling
certificate checks. Never copy or commit Caddy's CA private key or `/data`
directory.

### Optional database viewer

Run `make tools` or `make demo-tools`. Development exposes Adminer directly on
loopback port `8091`. Demo mode gives it no direct host port; open it through
Caddy at `https://localhost:9443/adminer/`. Use `postgres` as the database
server inside Adminer.

Adminer is not part of the product. Never enable it on a public host.

## 6. Startup and health model

Startup follows this order:

```text
PostgreSQL healthy
        ↓
Flask /api/readyz succeeds
        ↓
Web service starts
```

The two Flask health routes answer different questions:

| Route | Question | Database required? |
| --- | --- | --- |
| `GET /api/healthz` | Is the Flask process alive? | No |
| `GET /api/readyz` | Can this API accept database work? | Yes |

Do not change liveness to require PostgreSQL. If the database has a short
outage, Flask should remain alive and continue checking readiness.

`depends_on` controls startup order only. It does not stop the web container if
PostgreSQL fails after startup.

## 7. Request flows

### Readiness request

1. React calls `/api/readyz` on its own origin.
2. Vite or Caddy proxies the path to `api:8000`.
3. Flask opens a short PostgreSQL connection and checks required columns plus
   the table-overlap constraint.
4. Flask returns `200` with `ready`, or `503` with `not_ready`.
5. Compose uses the response to decide when the web service may start.

The API logs the database exception but does not return connection details to
the browser.

### Reservation request

The implemented path is:

```text
React form
   ↓ POST /api/reservations
Flask validates and normalizes the selected slot
   ↓
PostgreSQL transaction locks the selected local date
   ↓
Select one random table with no overlapping two-hour reservation
   ↓
Insert or update customer + insert reservation
   ↓
Commit and return confirmation
```

The form first requests `GET /api/availability?date=YYYY-MM-DD` and shows each
valid start with its free-table count. A booking request sends `date`, `time`,
`guest_count`, `name`, `email`, and optional `phone`.

Flask validates the values in Washington, DC time. It accepts 30-minute starts,
1–12 guests, and dates up to 90 days ahead. One transaction handles the
customer and reservation writes. A PostgreSQL exclusion constraint is the
final guard against any overlapping use of one table. The API returns `201`
with the assigned table or `409` when no table is free.

### Newsletter request

1. React validates the basic email shape for quick feedback.
2. Flask validates and normalizes the email again because clients are not
   trusted.
3. Flask inserts the customer or updates the existing customer.
4. `newsletter_signup` becomes `true`.
5. Flask returns `201` for a new customer or `200` for an existing signup.

The current requirement is storage only. Do not add an email worker until the
product must send messages.

## 8. Data model and invariants

### `customers`

| Field | Rule |
| --- | --- |
| `id` | Database-generated primary key. |
| `name` | Optional in SQL because a newsletter visitor may provide only email. Reservations must require it in Flask. |
| `email` | Required and unique without case differences. |
| `phone` | Optional. |
| `newsletter_signup` | Required boolean, default `false`. |
| `created_at` | Database timestamp. |

### `reservations`

| Field | Rule |
| --- | --- |
| `id` | Database-generated primary key. |
| `customer_id` | Required reference to `customers.id`. |
| `time_slot` | Required start timestamp with time zone. |
| `end_time` | Required end timestamp, exactly two hours after the start. |
| `guest_count` | Required whole number from 1 through 12. |
| `table_number` | Must be from 1 through 30. |
| `created_at` | Database timestamp. |

Important database guarantees:

- One customer identity per case-insensitive email.
- No reservation without a customer.
- No table number outside the 30-table range.
- No overlapping time range for the same table.
- Every stored visit lasts exactly two hours.

The `btree_gist` extension supports a PostgreSQL exclusion constraint. It
compares the table number and the half-open time range `[start, end)`. This
means one booking may begin exactly when the previous booking ends, but it may
not overlap any part of that visit.

## 9. Network and trust boundaries

The `frontend` network contains `web`, `api`, and optional `adminer`. The
`backend` network contains `api`, `postgres`, and optional `adminer`. Flask and
Adminer join both networks for different reasons: Flask serves the API, while
Adminer lets Caddy reach the database viewer without publishing Adminer's port.

This layout limits accidental access:

- The web container cannot open a direct PostgreSQL connection.
- PostgreSQL is not reachable from the host in demo mode.
- Adminer is not reachable directly from the host in demo mode. Caddy proxies
  `/adminer/` only when the optional service is running.
- The browser uses same-origin `/api` requests, so production does not need a
  broad CORS policy. Caddy ends the HTTPS connection and uses HTTP only inside
  the private Docker network when it forwards a request to Flask.
- In demo mode, Caddy rejects request bodies above 32 KB on API paths. This is
  enough for the small JSON forms in the current scope. The Vite development
  proxy does not apply this Caddy rule.

Passwords belong in `.env` for local work. A shared or public deployment must
use a managed secret store, a real domain, and a publicly trusted certificate.

Changing `BIND_ADDRESS` affects every port published by the active mode. Do not
set it to `0.0.0.0` while the database or Adminer is enabled unless that access
is intentional and protected.

## 10. Configuration contract

| Variable | Meaning | Default example |
| --- | --- | --- |
| `BIND_ADDRESS` | Host address for published ports. | `127.0.0.1` |
| `WEB_DEV_PORT` | Vite host port. | `5173` |
| `WEB_PORT` | Caddy HTTP redirect host port. | `8080` |
| `WEB_HTTPS_PORT` | Caddy HTTPS host and container port. | `9443` |
| `API_PORT` | Direct Flask development port. | `8000` |
| `POSTGRES_PORT` | Direct PostgreSQL development port. | `5432` |
| `ADMINER_PORT` | Direct Adminer port in development debugging mode. | `8091` |
| `POSTGRES_*` | Database identity, password, storage, and image settings. | See `.env.example`. |
| `RESTAURANT_TIMEZONE` | Zone used to interpret restaurant slots. | `America/New_York` |
| `RESERVATION_SLOT_MINUTES` | Fixed start-time interval; the API currently requires 30. | `30` |

If `WEB_HTTPS_PORT` changes, pass the same port in `DEMO_BASE_URL` when running
`make demo-smoke`.

Compose passes the database values to Flask as standard `PG*` connection
fields. Keeping the password separate means characters such as `@` do not
break a database URL. `DATABASE_URL` remains supported for non-Compose use.
`RESTAURANT_TIMEZONE` and `RESERVATION_SLOT_MINUTES` also affect the current
Python logic. `APP_ENV` is passed to the API for runtime context but has no
current behavior switch. The two-hour duration, 30-table count, 1–12 guest
limit, and 90-day window are small code constants in `backend/app.py`.

## 11. Common failure cases

| Symptom | Likely cause | First check |
| --- | --- | --- |
| Web waits for API | PostgreSQL or Flask readiness failed. | `docker compose ps` |
| `/api/readyz` returns `503` | Missing database URL or failed connection. | `docker compose logs api postgres` |
| Form shows “just became unavailable” | Another request took the last valid table. | Choose another start time and submit again. |
| Host port cannot bind | Another local stack uses the port. | Change the matching value in `.env`. |
| New SQL does not appear | The named volume already existed. | Add a migration; do not expect `init.sql` to rerun. |
| React code does not update | Development override is not active. | Use `docker compose up`, not `-f compose.yaml`. |
| A new frontend package is missing | The development modules volume is stale. | Rebuild, then recreate only that development volume if needed. |
| API route returns `404` | Flask has no route for that `/api/*` path and method. | Check the Flask route and request method. |
| `/adminer/` returns `502` | The optional Adminer profile is not running. | Start `make demo-tools`. |
| Browser warns about the demo certificate | Caddy's local root is not trusted by that browser. | Run `make demo-ca`, trust the copied root, and restart the browser. |
| A previously trusted demo warns again | The Caddy data volume was removed and a new local CA was created. | Remove the old root, then copy and trust the new one. |

## 12. Safe change recipes

### Add an API route

1. Add the route under `/api` in `backend/app.py` or a small Flask blueprint when
   the file becomes hard to scan.
2. Validate all client data in Flask.
3. Use a transaction for related writes.
4. Add one focused test for the main success path and one important failure.
5. No Vite or Caddy change is needed because both already proxy `/api/*`.

### Add a React page

1. Create the page component under `frontend/src`.
2. Add client routing only when the second real page exists.
3. Keep API calls on relative `/api` paths.
4. Check keyboard access, small screens, and clear form errors.

### Change the database schema

`database/init.sql` is safe only for a new volume. Before real or graded data
must survive schema changes, add Alembic or another migration tool. Each change
should have an upgrade step and a rollback decision.

### Add a dependency

1. First check whether React, Flask, PostgreSQL, CSS, or the standard library
   already solves the problem.
2. Pin the direct dependency.
3. Update the matching lock or requirements file.
4. Rebuild the affected image and run the smoke check.

## 13. Verification checklist

Use these checks before handing work to another developer:

Create `.env` from `.env.example` first if it does not exist.

```bash
# Run this copy once. Do not overwrite an .env file that you already changed.
cp .env.example .env

docker compose config --quiet
docker compose -f compose.yaml --profile tools config --quiet
npm --prefix frontend run check
docker compose run --rm --no-deps api python -m unittest -v test_app
docker compose run --rm -e RUN_POSTGRES_INTEGRATION=1 \
  api python -m unittest -v test_app.CafeFaussePostgresIntegrationTests
docker compose -f compose.yaml build web api

docker compose up -d --build --wait
curl -fsS http://127.0.0.1:5173/api/readyz
docker compose down

docker compose -f compose.yaml --profile tools up -d --build --wait
make demo-tools-smoke
docker compose -f compose.yaml --profile tools down
```

Also open all five pages at mobile and desktop sizes. Test form errors, an
accepted reservation, a full start time, a repeated newsletter signup, keyboard
lightbox controls, and the resulting database rows.

## 14. Open architecture decisions

The approved defaults settle duration, slot boundaries, party limit, timezone,
table count, and booking window. These product decisions remain open:

- Table sizes and whether a large party needs more than one table.
- Whether one customer may hold more than one reservation at the same time.
- Cancellation and update behavior.
- Customer data retention and newsletter unsubscribe behavior.
- Public hosting provider, domain, publicly trusted certificate, backups, and
  recovery targets.
- Whether a later version needs an authenticated manager screen.

Record each decision before its code depends on it.

## 15. Comment style used in this repository

Comments explain why a boundary, safety check, or non-obvious setting exists.
They do not repeat what the next line already says.

Good comment:

```python
# Keep connection details in server logs instead of exposing them to users.
```

Unhelpful comment:

```python
# Get the database URL.
database_url = os.environ.get("DATABASE_URL")
```

When behavior changes, update the nearest useful comment and this workbook in
the same change.

## 16. Developer review questions

Use these questions after reading the code:

1. Why does Flask join both Docker networks?
2. Why does readiness query PostgreSQL while liveness does not?
3. Which constraint stops two reservations from using the same table during overlapping times?
4. Why does `init.sql` not replace a migration system?
5. Which services are reachable from the host in each mode?
6. Where should reservation availability rules live, and which final guarantee
   still belongs in PostgreSQL?

If the answers are clear, the main system boundaries are understood.
