export const RESTAURANT_TIME_ZONE = "America/New_York";

function restaurantDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function todayAtRestaurant(now = new Date()) {
  const { year, month, day } = restaurantDateTime(now);
  return `${year}-${month}-${day}`;
}

export function lastBookableDate(now = new Date()) {
  const lastDate = new Date(`${todayAtRestaurant(now)}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + 90);
  return lastDate.toISOString().slice(0, 10);
}

export function getTimeOptions(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const close = day === 0 ? 21 * 60 : 23 * 60;
  const options = [];

  // Each booking lasts two hours, so the last seating finishes before closing.
  for (let minutes = 17 * 60; minutes <= close - 120; minutes += 30) {
    const hours = Math.floor(minutes / 60);
    const value = `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`2000-01-01T${value}:00Z`));

    options.push({ value, label });
  }

  return options;
}

export function validateReservationSlot(date, time, now = new Date()) {
  if (!date || !time) return "Choose a date and time for your visit.";
  if (!getTimeOptions(date).some((option) => option.value === time)) {
    return "Choose a seating time within our opening hours.";
  }

  const current = restaurantDateTime(now);
  const currentSlot = `${current.year}-${current.month}-${current.day}T${current.hour}:${current.minute}`;

  if (`${date}T${time}` <= currentSlot) {
    return "Choose a future date and time.";
  }

  return "";
}
