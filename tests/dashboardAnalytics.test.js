const test = require("node:test");
const assert = require("node:assert/strict");

const { analyticsBuilders } = require("../routes/dashboard");
const { getAnalyticsDateRange } = require("../utils/analyticsDateRange");

const {
  buildAppointmentAnalytics,
  buildPatientAnalytics,
  buildServiceAnalytics,
  buildTreatmentAnalytics,
  calculateChange,
  isFollowUpAppointment,
} = analyticsBuilders;

const at = (dateKey, time = "10:00 AM") => new Date(`${dateKey}T${time === "10:00 AM" ? "02:00:00" : "05:00:00"}.000Z`);
const appointment = (overrides = {}) => ({
  patient: null,
  patientName: "Pat Example",
  email: "pat@example.com",
  service: "Oral Check-up",
  status: "completed",
  appointmentDate: at("2026-09-20"),
  appointmentTime: "10:00 AM",
  reason: "",
  timeline: [],
  ...overrides,
});

test("percentage change reports a 'new' status instead of inflating a zero baseline", () => {
  assert.deepEqual(calculateChange(3, 0), { value: 100, status: "new", current: 3, previous: 0 });
  assert.deepEqual(calculateChange(3, 2), { value: 50, status: "increase", current: 3, previous: 2 });
  assert.deepEqual(calculateChange(1, 2), { value: -50, status: "decrease", current: 1, previous: 2 });
  assert.equal(calculateChange(0, 0).status, "neutral");
});

test("service growth compares bounded 30-day windows ending on the selected date and reports percentages", () => {
  const dateRange = getAnalyticsDateRange({ startDate: "2026-08-01", endDate: "2026-10-10" });
  const appointments = [
    appointment({ appointmentDate: at("2026-09-20") }),
    appointment({ appointmentDate: at("2026-10-05") }),
    appointment({ appointmentDate: at("2026-10-09") }),
    appointment({ appointmentDate: at("2026-08-20") }),
    appointment({ service: "Tooth Extraction", appointmentDate: at("2026-08-25") }),
    appointment({ service: "Tooth Extraction", appointmentDate: at("2026-09-01") }),
    appointment({ service: "Veneers", appointmentDate: at("2026-10-20"), status: "confirmed" }),
  ];

  const result = buildServiceAnalytics(appointments, dateRange);

  assert.deepEqual(result.growthWindow, {
    currentStart: "2026-09-11",
    currentEnd: "2026-10-10",
    previousStart: "2026-08-12",
    previousEnd: "2026-09-10",
  });
  assert.deepEqual(result.fastestGrowing.map(({ label, value, status, current, previous }) => ({ label, value, status, current, previous })), [
    { label: "Oral Check-up", value: 200, status: "increase", current: 3, previous: 1 },
  ]);
  assert.deepEqual(result.fastestDeclining.map(({ label, value, status }) => ({ label, value, status })), [
    { label: "Tooth Extraction", value: -100, status: "decrease" },
  ]);
  assert.equal(result.monthLabels.length, 12);
  assert.equal(result.monthLabels.at(-1), "Oct 2026");
  assert.deepEqual(result.serviceTrendMatrix.map((row) => row.label), ["Oral Check-up", "Tooth Extraction", "Veneers"]);
  assert.deepEqual(result.serviceTrendMatrix[0].values.slice(-3), [1, 1, 2]);
  assert.ok(result.serviceTrendMatrix.every((row) => row.values.length === 12));
  assert.equal(result.distribution.find((item) => item.label === "Veneers").value, 1);
});

test("peak hours are listed in clock order and status labels are readable", () => {
  const appointments = [
    appointment({ appointmentTime: "1:00 PM", status: "no_show" }),
    appointment({ appointmentTime: "9:00 AM" }),
    appointment({ appointmentTime: "9:30 AM" }),
    appointment({ appointmentTime: "", status: "in_consultation" }),
  ];

  const result = buildAppointmentAnalytics(appointments, null);

  assert.deepEqual(result.peakHours, [
    { label: "9:00 AM", value: 2 },
    { label: "1:00 PM", value: 1 },
    { label: "Unspecified", value: 1 },
  ]);
  assert.deepEqual(result.statusDistribution.map((item) => item.label).sort(), ["Completed", "In Consultation", "No Show"]);
});

test("follow-up detection relies on the follow-up status, not the word 'check' in a service name", () => {
  assert.equal(isFollowUpAppointment(appointment({ service: "Oral Check-up" })), false);
  assert.equal(isFollowUpAppointment(appointment({ status: "follow_up" })), true);
  assert.equal(isFollowUpAppointment(appointment({ status: "completed", timeline: [{ status: "follow_up" }] })), true);
  assert.equal(isFollowUpAppointment(appointment({ reason: "Follow-up visit" })), true);
});

test("treatment analytics use completed appointments and due follow-ups only", () => {
  const future = new Date(Date.now() + 7 * 86400000);
  const appointments = [
    appointment({ service: "Oral Check-up", status: "completed" }),
    appointment({ service: "Tooth Extraction", status: "completed" }),
    appointment({ service: "Tooth Extraction", status: "cancelled" }),
    appointment({ service: "Dentures", status: "completed", timeline: [{ status: "follow_up" }] }),
    appointment({ service: "Dentures", status: "no_show", timeline: [{ status: "follow_up" }] }),
    appointment({ service: "Dentures", status: "follow_up", appointmentDate: future }),
  ];
  const records = [
    { recordType: "treatment_record", procedure: "Tooth Extraction" },
    { recordType: "treatment_record", servicePerformed: "cleaning" },
    { recordType: "clinical_note", procedure: "Should not count" },
  ];

  const result = buildTreatmentAnalytics(records, appointments);

  assert.deepEqual(result.preventiveVsCorrective, [
    { label: "Preventive", value: 1 },
    { label: "Corrective", value: 2 },
  ]);
  assert.deepEqual(result.followUpTotals, { total: 3, due: 2, completed: 1, upcoming: 1 });
  assert.equal(result.followUpCompliance, 50);
  assert.deepEqual(result.mostCommonProcedures, [
    { label: "Oral Prophylaxis / Cleaning", value: 1 },
    { label: "Tooth Extraction", value: 1 },
  ]);
});

test("new vs returning patients consider appointment history before the selected period", () => {
  const dateRange = getAnalyticsDateRange({ startDate: "2026-09-01", endDate: "2026-09-30" });
  const appointments = [
    appointment({ patient: "p1", patientName: "Returning Rita", appointmentDate: at("2026-09-10") }),
    appointment({ patient: "p2", patientName: "New Nico", appointmentDate: at("2026-09-12") }),
    appointment({ patient: "p2", patientName: "New Nico", appointmentDate: at("2026-09-20") }),
  ];
  const patientHistory = new Map([
    ["patient:p1", { count: 4, firstDate: at("2025-03-01") }],
    ["patient:p2", { count: 2, firstDate: at("2026-09-12") }],
  ]);

  const result = buildPatientAnalytics([], appointments, dateRange, patientHistory);

  assert.deepEqual(result.newVsReturning, [
    { label: "New", value: 1 },
    { label: "Returning", value: 1 },
  ]);
  assert.deepEqual(result.frequentPatients, [
    { label: "New Nico", value: 2 },
    { label: "Returning Rita", value: 1 },
  ]);

  const unfiltered = buildPatientAnalytics([], appointments, null, patientHistory);
  assert.deepEqual(unfiltered.newVsReturning, [
    { label: "New", value: 0 },
    { label: "Returning", value: 2 },
  ]);
});
