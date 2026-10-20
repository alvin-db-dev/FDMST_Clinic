const test = require("node:test");
const assert = require("node:assert/strict");

const { addDays, buildAppointmentForecast, clinicDayStart } = require("../services/analyticsPredictionService");

const visit = (date, status = "completed", bookedDaysBefore) => ({
  appointmentDate: clinicDayStart(date),
  status,
  ...(bookedDaysBefore === undefined ? {} : { createdAt: clinicDayStart(addDays(date, -bookedDaysBefore)) }),
});

// Four visits on each of the last N Wednesdays before the target date.
const weeklyWednesdays = (targetDate, weeks, perDay = 4, bookedDaysBefore) => {
  const rows = [];
  for (let week = 1; week <= weeks; week += 1) {
    const date = addDays(targetDate, -7 * week);
    for (let index = 0; index < perDay; index += 1) rows.push(visit(date, "completed", bookedDaysBefore?.[index]));
  }
  return rows;
};

test("history starts at the first recorded appointment instead of padding with empty days", () => {
  const today = "2026-10-13";
  const targetDate = "2026-10-14";
  const result = buildAppointmentForecast({ targetDate, today, appointments: weeklyWednesdays(targetDate, 5) });

  assert.equal(result.historyStart, addDays(targetDate, -35));
  assert.equal(result.selected.comparableDays, 5);
  assert.equal(result.selected.forecast, 4, "a clinic that saw 4 visits every Wednesday should forecast 4, not a diluted average");
});

test("past pending requests are not counted as visits", () => {
  const today = "2026-10-13";
  const targetDate = "2026-10-14";
  const appointments = weeklyWednesdays(targetDate, 6, 2);
  for (let week = 1; week <= 6; week += 1) {
    appointments.push(visit(addDays(targetDate, -7 * week), "pending"));
    appointments.push(visit(addDays(targetDate, -7 * week), "declined"));
  }

  const result = buildAppointmentForecast({ targetDate, today, appointments });
  assert.equal(result.historyAppointments, 12);
  assert.equal(result.selected.forecast, 2);
});

test("choosing today counts completed, in-progress, and no-show visits as already scheduled", () => {
  const today = "2026-10-14";
  const appointments = [
    ...weeklyWednesdays(today, 6),
    visit(today, "completed"),
    visit(today, "checked_in"),
    visit(today, "no_show"),
    visit(today, "confirmed"),
    visit(today, "cancelled"),
  ];

  const result = buildAppointmentForecast({ targetDate: today, today, appointments });
  assert.equal(result.selected.booked, 4);
  assert.equal(result.selected.method, "weekday_history");
});

test("booking pace adds the share of a typical day that is usually booked later", () => {
  const today = "2026-10-12";
  const targetDate = "2026-10-14";
  // Each past Wednesday: 2 visits booked 7 days ahead, 2 booked the day before.
  const appointments = weeklyWednesdays(targetDate, 6, 4, [7, 7, 1, 1]);
  appointments.push(visit(targetDate, "confirmed"), visit(targetDate, "confirmed"));

  const result = buildAppointmentForecast({ targetDate, today, appointments });
  assert.equal(result.selected.method, "booking_pace");
  assert.equal(result.selected.booked, 2);
  // Two days out, half of a normal day is already booked; the other half (2 of 4) is still to come.
  assert.equal(result.selected.forecast, 4);
});

test("booking pace raises the forecast when a day is filling faster than usual", () => {
  const today = "2026-10-12";
  const targetDate = "2026-10-14";
  const appointments = weeklyWednesdays(targetDate, 6, 4, [7, 7, 1, 1]);
  for (let index = 0; index < 5; index += 1) appointments.push(visit(targetDate, "confirmed"));

  const result = buildAppointmentForecast({ targetDate, today, appointments });
  assert.equal(result.selected.forecast, 7, "5 already booked plus the ~2 that usually arrive later");
  assert.ok(result.selected.low >= 5);
});

test("recent weeks outweigh older weeks", () => {
  const today = "2026-10-13";
  const targetDate = "2026-10-14";
  const appointments = [];
  for (let week = 1; week <= 12; week += 1) {
    const perDay = week <= 4 ? 6 : 2;
    for (let index = 0; index < perDay; index += 1) appointments.push(visit(addDays(targetDate, -7 * week)));
  }

  const result = buildAppointmentForecast({ targetDate, today, appointments });
  // A plain average of the 12 Wednesdays would be about 3.3; recent weeks at 6 should pull it clearly higher.
  assert.ok(result.selected.forecast >= 4, `expected recency to lift the forecast, got ${result.selected.forecast}`);
});
