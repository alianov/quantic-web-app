import logging
import os
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import psycopg
from flask import Flask, jsonify, request


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

TABLE_COUNT = 30
MAX_GUESTS = 12
BOOKING_WINDOW_DAYS = 90
RESERVATION_DURATION = timedelta(hours=2)
SLOT_MINUTES = int(os.environ.get("RESERVATION_SLOT_MINUTES", "30"))
TIMEZONE_NAME = os.environ.get("RESTAURANT_TIMEZONE", "America/New_York")
RESTAURANT_TIMEZONE = ZoneInfo(TIMEZONE_NAME)

if SLOT_MINUTES != 30:
    raise RuntimeError("RESERVATION_SLOT_MINUTES must be 30")

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_PATTERN = re.compile(r"^[0-9+().\-\s]+$")


def error_response(message, status):
    return jsonify(error=message), status


def database_url():
    return os.environ.get("DATABASE_URL")


def database_is_configured():
    return bool(database_url()) or all(
        os.environ.get(name) for name in ("PGHOST", "PGDATABASE", "PGUSER")
    )


def connect_database():
    url = database_url()
    if url:
        return psycopg.connect(url, connect_timeout=2)
    # libpq reads PGHOST, PGDATABASE, PGUSER, and PGPASSWORD without URL parsing.
    return psycopg.connect(connect_timeout=2)


def current_time():
    return datetime.now(RESTAURANT_TIMEZONE)


def opening_and_closing(selected_date):
    opening = datetime.combine(selected_date, time(17), RESTAURANT_TIMEZONE)
    closing_hour = 21 if selected_date.weekday() == 6 else 23
    closing = datetime.combine(
        selected_date, time(closing_hour), RESTAURANT_TIMEZONE
    )
    return opening, closing


def reservation_slots(selected_date):
    opening, closing = opening_and_closing(selected_date)
    latest_start = closing - RESERVATION_DURATION
    slots = []
    slot = opening
    while slot <= latest_start:
        slots.append(slot)
        slot += timedelta(minutes=SLOT_MINUTES)
    return slots


def parse_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Enter a valid date in YYYY-MM-DD format.")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Enter a valid date in YYYY-MM-DD format.") from exc


def check_booking_date(selected_date, now):
    if selected_date < now.date():
        raise ValueError("Reservations must be in the future.")
    if selected_date > now.date() + timedelta(days=BOOKING_WINDOW_DAYS):
        raise ValueError("Reservations can be made up to 90 days ahead.")


def normalize_email(value):
    if not isinstance(value, str):
        raise ValueError("Enter a valid email address.")
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Enter a valid email address.")
    return email


def normalize_phone(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Enter a valid phone number.")
    phone = value.strip()
    if not phone:
        return None
    digit_count = sum(character.isdigit() for character in phone)
    if (
        len(phone) > 25
        or not PHONE_PATTERN.fullmatch(phone)
        or not 7 <= digit_count <= 15
    ):
        raise ValueError("Enter a valid phone number.")
    return phone


def parse_reservation(payload, now=None):
    if not isinstance(payload, dict):
        raise ValueError("Send the reservation as a JSON object.")

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
        raise ValueError("Enter a customer name between 1 and 100 characters.")

    email = normalize_email(payload.get("email"))
    phone = normalize_phone(payload.get("phone"))

    guest_count = payload.get("guest_count")
    if (
        isinstance(guest_count, bool)
        or not isinstance(guest_count, int)
        or not 1 <= guest_count <= MAX_GUESTS
    ):
        raise ValueError("Guest count must be a whole number from 1 to 12.")

    selected_date = parse_date(payload.get("date"))
    selected_time = payload.get("time")
    if not isinstance(selected_time, str) or not re.fullmatch(
        r"(?:[01]\d|2[0-3]):[0-5]\d", selected_time
    ):
        raise ValueError("Enter a valid time in HH:MM format.")

    now = now or current_time()
    check_booking_date(selected_date, now)
    start_time = datetime.combine(
        selected_date, time.fromisoformat(selected_time), RESTAURANT_TIMEZONE
    )
    if start_time not in reservation_slots(selected_date):
        raise ValueError("Choose a 30-minute start that fits within opening hours.")
    if start_time <= now:
        raise ValueError("Reservations must be in the future.")

    return {
        "name": name.strip(),
        "email": email,
        "phone": phone,
        "guest_count": guest_count,
        "start_time": start_time,
        "end_time": start_time + RESERVATION_DURATION,
    }


# Liveness proves that Flask can answer. It does not depend on PostgreSQL.
@app.get("/api/healthz")
def health():
    return jsonify(service="api", status="ok")


# Readiness gates startup, so it checks the dependency needed by real requests.
@app.get("/api/readyz")
def readiness():
    if not database_is_configured():
        return jsonify(status="not_ready"), 503

    try:
        # Finish before Docker's three-second health-check timeout.
        with connect_database() as connection:
            schema_ready = connection.execute(
                """
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'customers'
                          AND column_name = 'newsletter_signup'
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'reservations'
                          AND column_name = 'end_time'
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'reservations'
                          AND column_name = 'local_time'
                          AND data_type = 'timestamp without time zone'
                          AND is_generated = 'ALWAYS'
                          AND is_nullable = 'NO'
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'reservations_no_table_overlap'
                          AND conrelid = to_regclass('public.reservations')
                    )
                """
            ).fetchone()[0]
    except psycopg.Error:
        # Keep connection details in server logs instead of exposing them to users.
        app.logger.warning("Database readiness check failed", exc_info=True)
        return jsonify(status="not_ready"), 503

    if not schema_ready:
        app.logger.warning("Database schema is not ready")
        return jsonify(status="not_ready"), 503

    return jsonify(database="ok", service="api", status="ready")


@app.post("/api/newsletter")
def newsletter_signup():
    payload = request.get_json(silent=True)
    try:
        email = normalize_email(payload.get("email") if isinstance(payload, dict) else None)
    except ValueError as exc:
        return error_response(str(exc), 400)

    if not database_is_configured():
        return error_response("The database is temporarily unavailable.", 503)

    try:
        with connect_database() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO customers (email, newsletter_signup)
                    VALUES (%s, TRUE)
                    ON CONFLICT ((LOWER(email))) DO NOTHING
                    RETURNING id
                    """,
                    (email,),
                )
                created = cursor.fetchone() is not None
                if not created:
                    cursor.execute(
                        """
                        UPDATE customers
                        SET newsletter_signup = TRUE
                        WHERE LOWER(email) = %s
                        RETURNING id
                        """,
                        (email,),
                    )
    except psycopg.Error:
        app.logger.warning("Newsletter signup failed", exc_info=True)
        return error_response("We could not save your signup. Please try again.", 503)

    message = "You are subscribed to the newsletter."
    return jsonify(email=email, message=message), 201 if created else 200


@app.get("/api/availability")
def availability():
    try:
        selected_date = parse_date(request.args.get("date"))
        now = current_time()
        check_booking_date(selected_date, now)
    except ValueError as exc:
        return error_response(str(exc), 400)

    slots = [slot for slot in reservation_slots(selected_date) if slot > now]
    if not slots:
        return jsonify(
            date=selected_date.isoformat(),
            duration_minutes=120,
            slots=[],
            timezone=TIMEZONE_NAME,
        )

    if not database_is_configured():
        return error_response("The database is temporarily unavailable.", 503)

    try:
        with connect_database() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT requested.start_time,
                           (
                               SELECT COUNT(*)::INTEGER
                               FROM generate_series(1, %s) AS candidate(table_number)
                               WHERE NOT EXISTS (
                                   SELECT 1
                                   FROM reservations AS reservation
                                   WHERE reservation.table_number = candidate.table_number
                                     AND tstzrange(
                                             reservation.time_slot,
                                             reservation.end_time,
                                             '[)'
                                         ) && tstzrange(
                                             requested.start_time,
                                             requested.start_time + %s,
                                             '[)'
                                         )
                               )
                           ) AS available_tables
                    FROM unnest(%s::timestamptz[]) AS requested(start_time)
                    ORDER BY requested.start_time
                    """,
                    (TABLE_COUNT, RESERVATION_DURATION, slots),
                )
                counts = {start: count for start, count in cursor.fetchall()}
    except psycopg.Error:
        app.logger.warning("Availability check failed", exc_info=True)
        return error_response("We could not check availability. Please try again.", 503)

    return jsonify(
        date=selected_date.isoformat(),
        duration_minutes=120,
        slots=[
            {
                "available_tables": counts.get(slot, 0),
                "time": slot.strftime("%H:%M"),
            }
            for slot in slots
        ],
        timezone=TIMEZONE_NAME,
    )


@app.post("/api/reservations")
def create_reservation():
    try:
        booking = parse_reservation(request.get_json(silent=True))
    except ValueError as exc:
        return error_response(str(exc), 400)

    if not database_is_configured():
        return error_response("The database is temporarily unavailable.", 503)

    try:
        with connect_database() as connection:
            with connection.cursor() as cursor:
                # One short lock per local date makes table choice safe under concurrency.
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                    (f"cafe-fausse:{booking['start_time'].date().isoformat()}",),
                )
                cursor.execute(
                    """
                    SELECT candidate.table_number
                    FROM generate_series(1, %s) AS candidate(table_number)
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM reservations AS reservation
                        WHERE reservation.table_number = candidate.table_number
                          AND tstzrange(
                                  reservation.time_slot,
                                  reservation.end_time,
                                  '[)'
                              ) && tstzrange(%s, %s, '[)')
                    )
                    ORDER BY random()
                    LIMIT 1
                    """,
                    (TABLE_COUNT, booking["start_time"], booking["end_time"]),
                )
                table = cursor.fetchone()
                if table is None:
                    return error_response(
                        "That time is fully booked. Please choose another time.", 409
                    )

                cursor.execute(
                    """
                    INSERT INTO customers (name, email, phone)
                    VALUES (%s, %s, %s)
                    ON CONFLICT ((LOWER(email))) DO UPDATE
                    SET name = EXCLUDED.name,
                        email = EXCLUDED.email,
                        phone = COALESCE(EXCLUDED.phone, customers.phone)
                    RETURNING id
                    """,
                    (booking["name"], booking["email"], booking["phone"]),
                )
                customer_id = cursor.fetchone()[0]
                cursor.execute(
                    """
                    INSERT INTO reservations (
                        customer_id,
                        time_slot,
                        end_time,
                        guest_count,
                        table_number
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        customer_id,
                        booking["start_time"],
                        booking["end_time"],
                        booking["guest_count"],
                        table[0],
                    ),
                )
                reservation_id = cursor.fetchone()[0]
    except psycopg.IntegrityError:
        # The exclusion constraint is the final guard if another writer races us.
        app.logger.info("Reservation conflicted with an existing booking")
        return error_response(
            "That time just became unavailable. Please choose another time.", 409
        )
    except psycopg.Error:
        app.logger.warning("Reservation creation failed", exc_info=True)
        return error_response("We could not save the reservation. Please try again.", 503)

    return (
        jsonify(
            message="Your reservation is confirmed.",
            reservation={
                "date": booking["start_time"].date().isoformat(),
                "end_time": booking["end_time"].strftime("%H:%M"),
                "guest_count": booking["guest_count"],
                "id": reservation_id,
                "table_number": table[0],
                "time": booking["start_time"].strftime("%H:%M"),
                "timezone": TIMEZONE_NAME,
            },
        ),
        201,
    )


@app.errorhandler(413)
def request_too_large(_error):
    return error_response("The request is too large.", 413)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run(host="0.0.0.0", port=8000)
