const test = require("node:test");
const assert = require("node:assert/strict");

const { getAnalyticsDateRange, getKpiComparisonRange } = require("../utils/analyticsDateRange");

test("a single selected date covers only that full clinic day", () => {
  const range = getAnalyticsDateRange({ startDate: "2026-09-22" });
  assert.equal(range.startDate, "2026-09-22");
  assert.equal(range.endDate, "2026-09-22");
  assert.equal(range.currentStart.toISOString(), "2026-09-21T16:00:00.000Z");
  assert.equal(range.currentEnd.toISOString(), "2026-09-22T15:59:59.999Z");

  const comparison = getKpiComparisonRange(range);
  assert.equal(comparison.focusStart.toISOString(), range.currentStart.toISOString());
  assert.equal(comparison.previousFocusStart.toISOString(), "2026-09-20T16:00:00.000Z");
});

test("an end-only filter selects one day and a range uses its end day for the date KPI", () => {
  const single = getAnalyticsDateRange({ endDate: "2026-09-22" });
  assert.equal(single.startDate, single.endDate);

  const range = getAnalyticsDateRange({ startDate: "2026-09-20", endDate: "2026-09-22" });
  const comparison = getKpiComparisonRange(range);
  assert.equal(comparison.focusStart.toISOString(), "2026-09-21T16:00:00.000Z");
  assert.equal(comparison.previousStart.toISOString(), "2026-09-16T16:00:00.000Z");
  assert.equal(comparison.previousEnd.toISOString(), "2026-09-19T15:59:59.999Z");
});

test("invalid or reversed dates are rejected", () => {
  assert.match(getAnalyticsDateRange({ startDate: "2026-02-30" }).error, /valid date range/);
  assert.match(getAnalyticsDateRange({ startDate: "2026-09-23", endDate: "2026-09-22" }).error, /valid date range/);
  assert.equal(getAnalyticsDateRange({}), null);
});

test("default KPI comparison uses the clinic month and clamps short previous months", () => {
  const comparison = getKpiComparisonRange(null, "2026-03-31");
  assert.equal(comparison.currentStart.toISOString(), "2026-02-28T16:00:00.000Z");
  assert.equal(comparison.previousFocusStart.toISOString(), "2026-02-27T16:00:00.000Z");
});
