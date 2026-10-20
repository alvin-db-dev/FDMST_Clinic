const CLINIC_TIME_ZONE = "Asia/Manila";

const clinicDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const parseDateKey = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key ? date : null;
};

const addDays = (key, days) => {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const clinicDayStart = (key) => new Date(`${key}T00:00:00+08:00`);
const clinicDayEnd = (key) => new Date(clinicDayStart(addDays(key, 1)).getTime() - 1);

// Appointment dates are stored at the server's local midnight for the selected calendar date.
// Build matching database bounds from the clinic's date key, regardless of the server clock's date.
const storedAppointmentDayRange = (key) => {
  const date = parseDateKey(key);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return {
    start: new Date(year, month, day),
    end: new Date(year, month, day + 1),
  };
};

// Minutes since midnight on the clinic's wall clock, independent of the server's own time zone.
const clinicMinutesOfDay = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (Number(byType.hour) % 24) * 60 + Number(byType.minute);
};

// The calendar date a booking was requested for. Appointment dates are parsed from "YYYY-MM-DD" into a
// server-local midnight, so reading the local components returns exactly the date the patient picked.
const requestedDateKey = (date) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

// True when a slot on `dateKey` starting at `slotMinutes` is already in the past on the clinic's clock.
const isPastClinicSlot = (dateKey, slotMinutes, now = new Date()) => {
  const todayKey = clinicDateKey(now);
  if (dateKey < todayKey) return true;
  if (dateKey > todayKey) return false;
  return slotMinutes <= clinicMinutesOfDay(now);
};

module.exports = {
  addDays,
  clinicDateKey,
  clinicDayStart,
  clinicDayEnd,
  clinicMinutesOfDay,
  storedAppointmentDayRange,
  isPastClinicSlot,
  parseDateKey,
  requestedDateKey,
};
