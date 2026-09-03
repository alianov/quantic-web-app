import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import app as cafe


NOW = datetime(2026, 8, 28, 12, 0, tzinfo=cafe.RESTAURANT_TIMEZONE)


def reservation_payload(**changes):
    payload = {
        "date": "2026-08-31",
        "email": "guest@example.com",
        "guest_count": 2,
        "name": "Ada Lovelace",
        "phone": "+1 (202) 555-0199",
        "time": "17:30",
    }
    payload.update(changes)
    return payload


class FakeCursor:
    """Return one prepared row set for each SQL statement."""

    def __init__(self, results):
        self.results = iter(results)
        self.current = []
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters=None):
        self.calls.append((query, parameters))
        self.current = next(self.results, [])

    def fetchone(self):
        return self.current[0] if self.current else None

    def fetchall(self):
        return self.current


class FakeConnection:
    def __init__(self, results):
        self.fake_cursor = FakeCursor(results)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return self.fake_cursor

    def execute(self, query, parameters=None):
        self.fake_cursor.execute(query, parameters)
        return self.fake_cursor


class CafeFausseApiTests(unittest.TestCase):
    def setUp(self):
        cafe.app.config.update(TESTING=True)
        self.client = cafe.app.test_client()
        self.database = patch.dict(
            os.environ, {"DATABASE_URL": "postgresql://test"}, clear=False
        )
        self.database.start()

    def tearDown(self):
        self.database.stop()

    def test_opening_hours_leave_room_for_two_hour_booking(self):
        sunday = cafe.reservation_slots(date(2026, 8, 30))
        monday = cafe.reservation_slots(date(2026, 8, 31))

        self.assertEqual(
            [slot.strftime("%H:%M") for slot in sunday],
            ["17:00", "17:30", "18:00", "18:30", "19:00"],
        )
        self.assertEqual(monday[-1].strftime("%H:%M"), "21:00")

    def test_readiness_rejects_an_old_database_schema(self):
        connection = FakeConnection([[(False,)]])
        with patch.object(cafe.psycopg, "connect", return_value=connection):
            response = self.client.get("/api/readyz")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["status"], "not_ready")
        self.assertIn("local_time", connection.fake_cursor.calls[0][0])
        self.assertIn(
            "is_generated = 'ALWAYS'", connection.fake_cursor.calls[0][0]
        )
        self.assertIn("reservations_no_table_overlap", connection.fake_cursor.calls[0][0])

    def test_reservation_validation_normalizes_customer_data(self):
        booking = cafe.parse_reservation(
            reservation_payload(
                email=" Guest@Example.COM ",
                guest_count=4,
                name="  Ada Lovelace ",
                time="21:00",
            ),
            now=NOW,
        )

        self.assertEqual(booking["name"], "Ada Lovelace")
        self.assertEqual(booking["email"], "guest@example.com")
        self.assertEqual(booking["end_time"].strftime("%H:%M"), "23:00")
        self.assertEqual(booking["phone"], "+1 (202) 555-0199")
        self.assertEqual(booking["guest_count"], 4)

    def test_reservation_validation_accepts_exact_boundaries(self):
        cafe.check_booking_date(NOW.date(), NOW)
        cafe.check_booking_date(
            NOW.date() + timedelta(days=cafe.BOOKING_WINDOW_DAYS), NOW
        )

        email_254 = f"{'a' * 242}@example.com"
        phone_25 = f"{'1' * 15}{'-' * 10}"
        self.assertEqual(cafe.normalize_email(email_254), email_254)
        self.assertEqual(cafe.normalize_phone("1" * 7), "1" * 7)
        self.assertEqual(cafe.normalize_phone(phone_25), phone_25)

        for name in ("A", "A" * 100):
            for guest_count in (1, cafe.MAX_GUESTS):
                with self.subTest(name_length=len(name), guest_count=guest_count):
                    booking = cafe.parse_reservation(
                        reservation_payload(name=name, guest_count=guest_count), now=NOW
                    )
                    self.assertEqual(booking["name"], name)
                    self.assertEqual(booking["guest_count"], guest_count)

    def test_reservation_validation_rejects_bad_types_and_outside_boundaries(self):
        invalid_changes = (
            {"date": None},
            {"email": "not-an-email"},
            {"email": f"{'a' * 243}@example.com"},
            {"phone": "1" * 6},
            {"phone": "1" * 16},
            {"phone": f"{'1' * 15}{'-' * 11}"},
            {"phone": "1234567x"},
            {"name": None},
            {"name": " "},
            {"name": "A" * 101},
            {"guest_count": True},
            {"guest_count": 0},
            {"guest_count": 13},
            {"guest_count": 2.0},
            {"time": None},
            {"time": "17:15"},
        )

        for changes in invalid_changes:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                cafe.parse_reservation(reservation_payload(**changes), now=NOW)

        with self.assertRaises(ValueError):
            cafe.check_booking_date(NOW.date() - timedelta(days=1), NOW)
        with self.assertRaises(ValueError):
            cafe.check_booking_date(
                NOW.date() + timedelta(days=cafe.BOOKING_WINDOW_DAYS + 1), NOW
            )
        with self.assertRaisesRegex(ValueError, "future"):
            cafe.parse_reservation(
                reservation_payload(date="2026-08-28", time="17:00"),
                now=NOW.replace(hour=17),
            )

    def test_reservation_rejects_start_that_runs_past_sunday_close(self):
        with self.assertRaisesRegex(ValueError, "opening hours"):
            cafe.parse_reservation(
                reservation_payload(date="2026-08-30", time="19:30"),
                now=NOW,
            )

    def test_newsletter_normalizes_email_and_returns_201(self):
        connection = FakeConnection([[(7,)]])
        with patch.object(cafe.psycopg, "connect", return_value=connection):
            response = self.client.post(
                "/api/newsletter", json={"email": " Guest@Example.COM "}
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["email"], "guest@example.com")
        self.assertEqual(
            connection.fake_cursor.calls[0][1], ("guest@example.com",)
        )

    def test_newsletter_is_idempotent(self):
        connection = FakeConnection([[], [(7,)]])
        with patch.object(cafe.psycopg, "connect", return_value=connection):
            response = self.client.post(
                "/api/newsletter", json={"email": "guest@example.com"}
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("message", response.get_json())

    def test_availability_returns_every_valid_slot_and_counts(self):
        monday_slots = cafe.reservation_slots(date(2026, 8, 31))
        rows = [(slot, 30 - index) for index, slot in enumerate(monday_slots)]
        connection = FakeConnection([rows])
        with (
            patch.object(cafe, "current_time", return_value=NOW),
            patch.object(cafe.psycopg, "connect", return_value=connection),
        ):
            response = self.client.get("/api/availability?date=2026-08-31")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            payload,
            {
                "date": "2026-08-31",
                "duration_minutes": 120,
                "slots": [
                    {
                        "available_tables": 30 - index,
                        "time": slot.strftime("%H:%M"),
                    }
                    for index, slot in enumerate(monday_slots)
                ],
                "timezone": "America/New_York",
            },
        )
        self.assertIn("tstzrange", connection.fake_cursor.calls[0][0])
        self.assertEqual(
            connection.fake_cursor.calls[0][1],
            (30, timedelta(hours=2), monday_slots),
        )

    def test_reservation_returns_confirmation(self):
        connection = FakeConnection([[], [(12,)], [(4,)], [(99,)]])
        with (
            patch.object(cafe, "current_time", return_value=NOW),
            patch.object(cafe.psycopg, "connect", return_value=connection),
        ):
            response = self.client.post(
                "/api/reservations",
                json=reservation_payload(),
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            payload,
            {
                "message": "Your reservation is confirmed.",
                "reservation": {
                    "date": "2026-08-31",
                    "end_time": "19:30",
                    "guest_count": 2,
                    "id": 99,
                    "table_number": 12,
                    "time": "17:30",
                    "timezone": "America/New_York",
                },
            },
        )
        self.assertEqual(len(connection.fake_cursor.calls), 4)
        self.assertEqual(
            connection.fake_cursor.calls[0],
            (
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                ("cafe-fausse:2026-08-31",),
            ),
        )
        self.assertEqual(connection.fake_cursor.calls[1][1][0], 30)
        self.assertEqual(
            connection.fake_cursor.calls[2][1],
            ("Ada Lovelace", "guest@example.com", "+1 (202) 555-0199"),
        )
        self.assertEqual(connection.fake_cursor.calls[3][1][0], 4)

    def test_full_time_returns_clear_conflict(self):
        connection = FakeConnection([[], []])
        with (
            patch.object(cafe, "current_time", return_value=NOW),
            patch.object(cafe.psycopg, "connect", return_value=connection),
        ):
            response = self.client.post(
                "/api/reservations",
                json=reservation_payload(),
            )

        self.assertEqual(response.status_code, 409)
        self.assertIn("error", response.get_json())

    def test_invalid_guest_count_returns_400_without_database_call(self):
        with patch.object(cafe.psycopg, "connect") as connect:
            response = self.client.post(
                "/api/reservations",
                json=reservation_payload(guest_count=13),
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())
        connect.assert_not_called()


@unittest.skipUnless(
    os.environ.get("RUN_POSTGRES_INTEGRATION") == "1",
    "set RUN_POSTGRES_INTEGRATION=1 to run the PostgreSQL capacity test",
)
class CafeFaussePostgresIntegrationTests(unittest.TestCase):
    def setUp(self):
        if not cafe.database_is_configured():
            self.fail("PostgreSQL connection settings are required")

        cafe.app.config.update(TESTING=True)
        self.email_prefix = f"qa-concurrency-{uuid4().hex}-"
        self.email_pattern = f"{self.email_prefix}%@example.test"
        self.start_time = self.find_empty_start_time()
        self.addCleanup(self.remove_test_bookings)

    def find_empty_start_time(self):
        now = cafe.current_time()
        with cafe.connect_database() as connection:
            with connection.cursor() as cursor:
                # Use the existing demo database without assuming it is empty.
                for offset in range(1, cafe.BOOKING_WINDOW_DAYS + 1):
                    selected_date = now.date() + timedelta(days=offset)
                    for start_time in cafe.reservation_slots(selected_date):
                        cursor.execute(
                            """
                            SELECT COUNT(*)
                            FROM reservations
                            WHERE tstzrange(time_slot, end_time, '[)')
                                  && tstzrange(%s, %s, '[)')
                            """,
                            (start_time, start_time + cafe.RESERVATION_DURATION),
                        )
                        if cursor.fetchone()[0] == 0:
                            return start_time
        self.fail("No empty reservation start was available for the capacity test")

    def remove_test_bookings(self):
        with cafe.connect_database() as connection:
            with connection.cursor() as cursor:
                # Keep manual bookings and delete only records created by this test.
                cursor.execute(
                    """
                    DELETE FROM reservations AS reservation
                    USING customers AS customer
                    WHERE reservation.customer_id = customer.id
                      AND customer.email LIKE %s
                    """,
                    (self.email_pattern,),
                )
                cursor.execute(
                    """
                    DELETE FROM customers
                    WHERE email LIKE %s
                      AND NOT EXISTS (
                          SELECT 1
                          FROM reservations
                          WHERE reservations.customer_id = customers.id
                      )
                    """,
                    (self.email_pattern,),
                )

    def create_booking(self, index):
        with cafe.app.test_client() as client:
            response = client.post(
                "/api/reservations",
                json={
                    "date": self.start_time.date().isoformat(),
                    "email": f"{self.email_prefix}{index:02d}@example.test",
                    "guest_count": 2,
                    "name": f"QA concurrency {index:02d}",
                    "time": self.start_time.strftime("%H:%M"),
                },
            )
            return response.status_code, response.get_json()

    def test_thirty_concurrent_bookings_fill_capacity_and_reject_overflow(self):
        with ThreadPoolExecutor(max_workers=30) as executor:
            results = list(executor.map(self.create_booking, range(1, 31)))

        self.assertEqual([status for status, _payload in results], [201] * 30)
        reservations = [payload["reservation"] for _status, payload in results]
        self.assertEqual(
            {reservation["table_number"] for reservation in reservations},
            set(range(1, 31)),
        )
        self.assertEqual(
            sum(
                isinstance(reservation["id"], int) and reservation["id"] > 0
                for reservation in reservations
            ),
            30,
        )

        overflow_status, overflow_payload = self.create_booking(31)
        self.assertEqual(overflow_status, 409)
        self.assertIn("error", overflow_payload)

        with cafe.app.test_client() as client:
            availability = client.get(
                f"/api/availability?date={self.start_time.date().isoformat()}"
            )
        self.assertEqual(availability.status_code, 200)
        matching_slot = next(
            slot
            for slot in availability.get_json()["slots"]
            if slot["time"] == self.start_time.strftime("%H:%M")
        )
        self.assertEqual(matching_slot["available_tables"], 0)

        with cafe.connect_database() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*),
                       COUNT(DISTINCT reservation.table_number),
                       BOOL_AND(
                           reservation.local_time = reservation.time_slot
                               AT TIME ZONE 'America/New_York'
                       )
                FROM reservations AS reservation
                JOIN customers AS customer ON customer.id = reservation.customer_id
                WHERE customer.email LIKE %s
                """,
                (self.email_pattern,),
            ).fetchone()
        self.assertEqual(row, (30, 30, True))


if __name__ == "__main__":
    unittest.main()
