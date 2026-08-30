import assert from "node:assert/strict";

import {
  getTimeOptions,
  lastBookableDate,
  validateReservationSlot,
} from "../src/reservationLogic.js";

assert.equal(getTimeOptions("2026-08-30").at(-1).value, "19:00");
assert.equal(getTimeOptions("2026-08-31").at(-1).value, "21:00");
assert.equal(
  validateReservationSlot("2026-08-31", "16:30", new Date("2026-08-28T12:00:00Z")),
  "Choose a seating time within our opening hours.",
);
assert.equal(validateReservationSlot("2026-08-31", "17:00", new Date("2026-08-28T12:00:00Z")), "");
assert.equal(lastBookableDate(new Date("2026-08-28T12:00:00Z")), "2026-11-26");

console.log("Reservation time rules pass.");
