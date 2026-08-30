# Café Fausse demo guide

This guide gives a clear 5–10 minute path for the recorded course demo. It
covers every item named in the project rubric.

## Before recording

1. Start the production-like stack with the database viewer:

   ```bash
   make demo-tools
   ```

2. Wait until the services are ready:

   ```bash
   docker compose -f compose.yaml --profile tools ps
   ```

3. Open these pages:

   - Application: `http://127.0.0.1:8080`
   - Adminer: `http://127.0.0.1:8091`

4. In Adminer, select PostgreSQL and use:

   - Server: `postgres`
   - Username, password, and database: values from `.env`

5. Choose a future date and test email that you can show in the recording.
   Do not show a real password or private customer data.
6. Prepare your camera and government ID. Follow the course identity rules at
   the start of the recording, and avoid showing unrelated personal details.

## Suggested recording order

### 0:00–0:45 — Goal and stack

- Appear on camera and complete the required government-ID check.
- State that Café Fausse is a responsive five-page restaurant application.
- Name React, Flask, PostgreSQL, Docker Compose, Gunicorn, and Caddy.
- Explain that the browser calls same-origin `/api` routes and cannot connect
  directly to PostgreSQL.

### 0:45–1:45 — Home and navigation

- Show the Home page, address, hours, phone number, review, and main calls to
  action.
- Open and use the navigation.
- Briefly resize the window to show the mobile menu and responsive layout.

### 1:45–2:30 — Menu

- Open Menu from the navigation.
- Show starters, main courses, desserts, beverages, descriptions, and prices.
- Point out the Grid layout and the booking call to action.

### 2:30–4:30 — Reservation workflow

- Open Reservations.
- Choose a date and show that the app loads live start times and free-table
  counts.
- Mention the approved rules: 30-minute starts, two-hour visits, 1–12 guests,
  30 tables, Washington, DC time, and a 90-day window.
- Submit one invalid example, such as 13 guests, and show the friendly error.
- Submit a valid reservation and show the assigned table number.
- Explain that PostgreSQL prevents overlapping use of the same table and the
  API returns a conflict if all tables are busy.

### 4:30–5:15 — Newsletter and database state

- Enter a test email in the newsletter form and show its success message.
- Switch to Adminer.
- Show the matching row in `customers`, including `newsletter_signup`.
- Show the new row in `reservations`, including start, end, guest count, and
  table number.

You may use these read-only queries instead of browsing the full tables:

```sql
SELECT id, name, email, phone, newsletter_signup
FROM customers
ORDER BY created_at DESC;

SELECT id, customer_id, time_slot, end_time, guest_count, table_number
FROM reservations
ORDER BY created_at DESC;
```

### 5:15–6:15 — About and Gallery

- Open About Us and show the founders, 2010 history, mission, and local
  ingredient values.
- Open Gallery and show the restaurant, food, kitchen, and event images.
- Open the lightbox. Use next, previous, and Escape to show keyboard access.
- Point out the awards and both review quotes.

### 6:15–7:30 — Decisions and quality checks

- Show `ARCHITECTURE_WORKBOOK.md` and explain the frontend/backend/database
  boundaries.
- Show the separate Docker networks, health-gated startup, and optional Adminer
  profile.
- Mention the 10 Flask tests, frontend rule check, production build, and
  30-request concurrency test.
- Explain the deliberate limits: newsletter storage only, no product admin
  dashboard, and local HTTP for the course demo.

## Submission checklist

- Put all source files, `README.md`, `ARCHITECTURE_WORKBOOK.md`, and
  `ai-tooling.md` in the GitHub repository.
- If the repository is private, add the `quantic-grader` GitHub account as a
  collaborator.
- Record a clear 5–10 minute video using the flow above.
- Upload the recording to Google Drive and give the grader view access.
- Create the required submission PDF with the video link and GitHub repository
  link or links.
- Open both links in a private browser window before submitting.
- Do not include `.env`, passwords, or private data in GitHub or the recording.

## After recording

Stop the containers without deleting the database:

```bash
docker compose -f compose.yaml --profile tools down
```

Do not add `--volumes` unless you intentionally want to delete the local demo
data.
