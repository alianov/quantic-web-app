import os
import unittest
from datetime import date, datetime
from unittest.mock import patch

import app as cafe


NOW = datetime(2026, 8, 28, 12, 0, tzinfo=cafe.RESTAURANT_TIMEZONE)


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
        self.assertIn("reservations_no_table_overlap", connection.fake_cursor.calls[0][0])

    def test_reservation_validation_normalizes_customer_data(self):
        booking = cafe.parse_reservation(
            {
                "date": "2026-08-31",
                "email": " Guest@Example.COM ",
                "guest_count": 4,
                "name": "  Ada Lovelace ",
                "phone": "+1 (202) 555-0199",
                "time": "21:00",
            },
            now=NOW,
        )

        self.assertEqual(booking["name"], "Ada Lovelace")
        self.assertEqual(booking["email"], "guest@example.com")
        self.assertEqual(booking["end_time"].strftime("%H:%M"), "23:00")

    def test_reservation_rejects_start_that_runs_past_sunday_close(self):
        with self.assertRaisesRegex(ValueError, "opening hours"):
            cafe.parse_reservation(
                {
                    "date": "2026-08-30",
                    "email": "guest@example.com",
                    "guest_count": 2,
                    "name": "Ada Lovelace",
                    "time": "19:30",
                },
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
        self.assertEqual(payload["slots"][0], {"available_tables": 30, "time": "17:00"})
        self.assertEqual(payload["slots"][-1]["time"], "21:00")
        self.assertIn("tstzrange", connection.fake_cursor.calls[0][0])

    def test_reservation_returns_confirmation(self):
        connection = FakeConnection([[], [(12,)], [(4,)], [(99,)]])
        with (
            patch.object(cafe, "current_time", return_value=NOW),
            patch.object(cafe.psycopg, "connect", return_value=connection),
        ):
            response = self.client.post(
                "/api/reservations",
                json={
                    "date": "2026-08-31",
                    "email": "guest@example.com",
                    "guest_count": 2,
                    "name": "Ada Lovelace",
                    "time": "17:30",
                },
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(payload["reservation"]["table_number"], 12)
        self.assertEqual(payload["reservation"]["end_time"], "19:30")
        self.assertIn("message", payload)
        self.assertIn("pg_advisory_xact_lock", connection.fake_cursor.calls[0][0])

    def test_full_time_returns_clear_conflict(self):
        connection = FakeConnection([[], []])
        with (
            patch.object(cafe, "current_time", return_value=NOW),
            patch.object(cafe.psycopg, "connect", return_value=connection),
        ):
            response = self.client.post(
                "/api/reservations",
                json={
                    "date": "2026-08-31",
                    "email": "guest@example.com",
                    "guest_count": 2,
                    "name": "Ada Lovelace",
                    "time": "17:30",
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertIn("error", response.get_json())

    def test_invalid_guest_count_returns_400_without_database_call(self):
        with patch.object(cafe.psycopg, "connect") as connect:
            response = self.client.post(
                "/api/reservations",
                json={
                    "date": "2026-08-31",
                    "email": "guest@example.com",
                    "guest_count": 13,
                    "name": "Ada Lovelace",
                    "time": "17:30",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
