const test = require("node:test");
const assert = require("node:assert/strict");

const { buildServiceComparison, generateServiceComparisonInsight, getServiceComparisonWindow } = require("../services/serviceComparisonService");

const appointment = (day, service, status = "completed") => ({ appointmentDate: new Date(`${day}T00:00:00`), service, status });

test("month comparison crosses the year boundary and aligns elapsed days", () => {
  const window = getServiceComparisonWindow({ period: "month", value: "2026-01", today: "2026-01-16" });
  assert.deepEqual({
    previousValue: window.previousValue,
    previousStart: window.previousStart,
    previousEnd: window.previousEnd,
    currentStart: window.currentStart,
    currentEnd: window.currentEnd,
  }, {
    previousValue: "2025-12",
    previousStart: "2025-12-01",
    previousEnd: "2025-12-17",
    currentStart: "2026-01-01",
    currentEnd: "2026-01-17",
  });
  assert.equal(getServiceComparisonWindow({ period: "month", value: "2026-02", today: "2026-01-16" }), null);
});

test("year comparison uses matching year-to-date windows and clamps leap day", () => {
  const window = getServiceComparisonWindow({ period: "year", value: "2024", today: "2024-02-29" });
  assert.equal(window.currentEnd, "2024-03-01");
  assert.equal(window.previousStart, "2023-01-01");
  assert.equal(window.previousEnd, "2023-03-01");
  assert.equal(window.previousValue, "2023");
  const fullYear = getServiceComparisonWindow({ period: "year", value: "2025", today: "2026-10-16" });
  assert.equal(fullYear.currentEnd, "2026-01-01");
  assert.equal(fullYear.previousEnd, "2025-01-01");
  assert.equal(fullYear.isPartial, false);
});

test("admin can compare any two distinct months or years, including the current period on either side", () => {
  const months = getServiceComparisonWindow({
    period: "month", value: "2024-02", compareValue: "2026-10", today: "2026-10-16",
  });
  assert.equal(months.currentStart, "2024-02-01");
  assert.equal(months.currentEnd, "2024-02-17");
  assert.equal(months.previousStart, "2026-10-01");
  assert.equal(months.previousEnd, "2026-10-17");
  assert.equal(months.previousValue, "2026-10");
  assert.equal(months.isPartial, true);

  const years = getServiceComparisonWindow({
    period: "year", value: "2025", compareValue: "2022", today: "2026-10-16",
  });
  assert.equal(years.currentEnd, "2026-01-01");
  assert.equal(years.previousEnd, "2023-01-01");
  assert.equal(years.isPartial, false);
  assert.equal(getServiceComparisonWindow({ period: "month", value: "2026-10", compareValue: "2026-10", today: "2026-10-16" }), null);
  assert.equal(getServiceComparisonWindow({ period: "year", value: "2026", compareValue: "2027", today: "2026-10-16" }), null);
});

test("comparison counts booked services, excludes cancelled visits, and ranks every service", () => {
  const window = getServiceComparisonWindow({ period: "month", value: "2026-10", today: "2026-10-16" });
  const result = buildServiceComparison({
    window,
    services: ["Cleaning", "Extraction", "Braces"],
    appointments: [
      appointment("2026-10-01", "Cleaning", "pending"),
      appointment("2026-10-03", "Cleaning", "confirmed"),
      appointment("2026-10-04", "Extraction", "completed"),
      appointment("2026-10-05", "Cleaning", "cancelled"),
      appointment("2026-10-17", "Cleaning", "completed"),
      appointment("2026-09-01", "Cleaning", "completed"),
      appointment("2026-09-07", "Extraction", "no_show"),
      appointment("2026-09-18", "Extraction", "completed"),
    ],
  });

  assert.deepEqual(result.leaders, ["Cleaning"]);
  assert.equal(result.totalCurrent, 3);
  assert.equal(result.totalPrevious, 2);
  assert.deepEqual(result.rows.map(({ service, current, previous }) => ({ service, current, previous })), [
    { service: "Cleaning", current: 2, previous: 1 },
    { service: "Extraction", current: 1, previous: 1 },
    { service: "Braces", current: 0, previous: 0 },
  ]);
  assert.equal(result.rows[0].changePercent, 100);
  assert.equal(result.rows[2].changePercent, null);
  assert.deepEqual(result.previousLeaders, ["Cleaning", "Extraction"]);
  assert.equal(result.recommendations[0].service, "Cleaning");
  assert.match(result.recommendations[0].reason, /2 bookings/);
});

test("AI receives only aggregate comparison data and cannot introduce unsupported services", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const comparison = buildServiceComparison({
    window: getServiceComparisonWindow({ period: "month", value: "2026-08", compareValue: "2026-05", today: "2026-10-16" }),
    services: ["Cleaning", "Extraction"],
    appointments: [
      appointment("2026-08-03", "Cleaning"),
      appointment("2026-08-05", "Cleaning"),
      appointment("2026-05-03", "Extraction"),
    ],
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const supplied = JSON.parse(body.messages[1].content);
    assert.deepEqual(supplied.mostBookedSelected, ["Cleaning"]);
    assert.deepEqual(supplied.mostBookedComparison, ["Extraction"]);
    assert.ok(!body.messages[1].content.includes("patientName"));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      insight: "Cleaning leads the selected period.",
      action: "Review available cleaning slots.",
      recommendations: [
        { service: "Cleaning", improvement: "Keep cleaning slots visible." },
        { service: "Unknown", improvement: "Invent an offer." },
      ],
    }) } }] }) };
  };
  try {
    const ai = await generateServiceComparisonInsight(comparison);
    assert.equal(ai.status, "ready");
    assert.equal(ai.recommendations[0].improvement, "Keep cleaning slots visible.");
    assert.ok(ai.recommendations.every((item) => item.service !== "Unknown"));
    assert.match(ai.recommendations[0].reason, /2 bookings/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
