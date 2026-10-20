const test = require("node:test");
const assert = require("node:assert/strict");

const { clinicDateKey, clinicMinutesOfDay, isPastClinicSlot, requestedDateKey, storedAppointmentDayRange } = require("../utils/clinicDate");

// 10:30 AM in Manila is 02:30 UTC. A server running on UTC would read the clock as 2:30 AM.
const manilaMorning = new Date("2026-10-15T02:30:00.000Z");
// 6:00 AM in Manila on Oct 15 is still Oct 14 on a UTC server.
const manilaEarlyMorning = new Date("2026-10-14T22:00:00.000Z");

test("clinic clock reads Manila time regardless of the server's time zone", () => {
  assert.equal(clinicDateKey(manilaMorning), "2026-10-15");
  assert.equal(clinicMinutesOfDay(manilaMorning), 10 * 60 + 30);
  assert.equal(clinicDateKey(manilaEarlyMorning), "2026-10-15");
  assert.equal(clinicMinutesOfDay(manilaEarlyMorning), 6 * 60);
});

test("slots earlier today on the clinic clock are past, later ones are bookable", () => {
  assert.equal(isPastClinicSlot("2026-10-15", 9 * 60, manilaMorning), true, "9:00 AM already passed at 10:30 AM");
  assert.equal(isPastClinicSlot("2026-10-15", 10 * 60 + 30, manilaMorning), true, "a slot starting right now counts as passed");
  assert.equal(isPastClinicSlot("2026-10-15", 11 * 60, manilaMorning), false);
});

test("dates before today on the clinic clock are past even when the server still thinks it is yesterday", () => {
  assert.equal(isPastClinicSlot("2026-10-14", 16 * 60, manilaEarlyMorning), true);
  assert.equal(isPastClinicSlot("2026-10-15", 9 * 60, manilaEarlyMorning), false);
  assert.equal(isPastClinicSlot("2026-10-16", 9 * 60, manilaMorning), false);
});

test("the requested calendar date survives the server-local parse used by the booking routes", () => {
  // parseAppointmentDate builds new Date(year, month - 1, day) from "YYYY-MM-DD".
  assert.equal(requestedDateKey(new Date(2026, 9, 15)), "2026-10-15");
  assert.equal(requestedDateKey(new Date(2026, 0, 1)), "2026-01-01");
  assert.equal(requestedDateKey("not a date"), null);
});

test("today's appointment range follows the clinic date even when the server clock is on yesterday", () => {
  const clinicToday = clinicDateKey(manilaEarlyMorning);
  const { start, end } = storedAppointmentDayRange(clinicToday);
  const bookedToday = new Date(2026, 9, 15);
  const bookedYesterday = new Date(2026, 9, 14);
  const bookedTomorrow = new Date(2026, 9, 16);

  assert.equal(clinicToday, "2026-10-15");
  assert.equal(requestedDateKey(start), clinicToday);
  assert.equal(requestedDateKey(end), "2026-10-16");
  assert.equal(bookedToday >= start && bookedToday < end, true);
  assert.equal(bookedYesterday >= start && bookedYesterday < end, false);
  assert.equal(bookedTomorrow >= start && bookedTomorrow < end, false);
});
