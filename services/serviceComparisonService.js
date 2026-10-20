const { addDays, clinicDateKey, parseDateKey, requestedDateKey } = require("../utils/clinicDate");

const BOOKED_STATUSES = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "no_show"]);
const dateKey = (date) => date.toISOString().slice(0, 10);
const nextPeriodStart = (date, period) => {
  const next = new Date(date);
  if (period === "month") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return dateKey(next);
};
const previousPeriod = (value, period) => {
  const start = parseDateKey(period === "month" ? `${value}-01` : `${value}-01-01`);
  if (period === "month") start.setUTCMonth(start.getUTCMonth() - 1);
  else start.setUTCFullYear(start.getUTCFullYear() - 1);
  return dateKey(start).slice(0, value.length);
};

const getServiceComparisonWindow = ({ period, value, compareValue, today = clinicDateKey() }) => {
  const length = period === "month" ? 7 : 4;
  const pattern = period === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : period === "year" ? /^\d{4}$/ : null;
  if (!pattern || !pattern.test(value || "")) return null;
  const previousValue = compareValue === undefined ? previousPeriod(value, period) : compareValue;
  const latest = today.slice(0, length);
  if (!pattern.test(previousValue || "") || Number(value.slice(0, 4)) < 2000
    || Number(previousValue.slice(0, 4)) < 2000 || value > latest || previousValue > latest
    || value === previousValue) return null;

  const currentStart = period === "month" ? `${value}-01` : `${value}-01-01`;
  const previousStart = period === "month" ? `${previousValue}-01` : `${previousValue}-01-01`;
  const currentKeyEnd = nextPeriodStart(parseDateKey(currentStart), period);
  const previousKeyEnd = nextPeriodStart(parseDateKey(previousStart), period);
  const isPartial = value === latest || previousValue === latest;
  let currentEnd = currentKeyEnd;
  let previousEnd = previousKeyEnd;
  if (isPartial) {
    const comparableEnd = (start, end) => {
      const [year, month] = start.split("-").map(Number);
      const targetMonth = period === "month" ? month : Number(today.slice(5, 7));
      const maximumDay = new Date(Date.UTC(year, targetMonth, 0)).getUTCDate();
      const day = Math.min(Number(today.slice(8, 10)), maximumDay);
      const matchedEnd = addDays(`${year}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`, 1);
      return matchedEnd < end ? matchedEnd : end;
    };
    currentEnd = comparableEnd(currentStart, currentKeyEnd);
    previousEnd = comparableEnd(previousStart, previousKeyEnd);
  }
  return { period, value, previousValue, currentStart, currentEnd, previousStart, previousEnd, isPartial };
};

const focusFor = (current, previous) => {
  if (!current && !previous) return "No bookings in either period; consider featuring this service.";
  if (!current) return "No bookings in the selected period; review visibility and consider an offer.";
  if (!previous) return "New bookings in the selected period; keep this service visible.";
  if (current < previous) return "Fewer bookings in the selected period; review access and consider a targeted promotion.";
  if (current > previous) return "More bookings in the selected period; keep appointments and service information easy to find.";
  return "Bookings are steady; keep this service visible.";
};

const buildComparisonRecommendations = (rows, totalCurrent, totalPrevious) => {
  if (!totalCurrent && !totalPrevious) return [];
  const recommendations = [];
  const add = (row, reason, improvement) => {
    if (row && !recommendations.some((item) => item.service === row.service)) {
      recommendations.push({ service: row.service, reason, improvement });
    }
  };
  if (totalCurrent) {
    const leader = rows[0];
    add(leader, `${leader.service} leads the selected period with ${leader.current} booking${leader.current === 1 ? "" : "s"} (compared with ${leader.previous}).`,
      leader.current < leader.previous
        ? "Keep capacity available for this popular service, and review why it had fewer bookings in the selected period."
        : "Review appointment capacity for this popular service and keep its booking details easy to find.");
  }
  const declining = rows.filter((row) => row.previous > row.current && !recommendations.some((item) => item.service === row.service))
    .sort((a, b) => (b.previous - b.current) - (a.previous - a.current) || b.previous - a.previous)[0];
  if (declining) add(declining, `${declining.service} has ${declining.current} bookings in the selected period versus ${declining.previous} in the compared period.`,
    "Review scheduling and service visibility; consider a targeted promotion if there is available capacity.");
  const growing = rows.filter((row) => row.current > row.previous && !recommendations.some((item) => item.service === row.service))
    .sort((a, b) => (b.current - b.previous) - (a.current - a.previous) || b.current - a.current)[0];
  if (growing) add(growing, `${growing.service} has ${growing.current} bookings in the selected period versus ${growing.previous} in the compared period.`,
    "Review this service's strong demand and preserve convenient appointment slots.");
  if (!recommendations.length && totalPrevious) {
    const priorLeader = [...rows].sort((a, b) => b.previous - a.previous)[0];
    add(priorLeader, `${priorLeader.service} had ${priorLeader.previous} bookings in the comparison period.`,
      "Review why this service has fewer bookings and make its availability clear to patients.");
  }
  return recommendations;
};

const buildServiceComparison = ({ appointments, services, window }) => {
  const counts = new Map((services || []).filter(Boolean).map((service) => [service, { current: 0, previous: 0 }]));
  for (const appointment of appointments || []) {
    if (!BOOKED_STATUSES.has(appointment.status)) continue;
    const service = String(appointment.service || "").trim();
    const day = requestedDateKey(appointment.appointmentDate);
    if (!service || !day) continue;
    const bucket = day >= window.currentStart && day < window.currentEnd ? "current"
      : day >= window.previousStart && day < window.previousEnd ? "previous" : null;
    if (!bucket) continue;
    if (!counts.has(service)) counts.set(service, { current: 0, previous: 0 });
    counts.get(service)[bucket] += 1;
  }
  const rows = [...counts].map(([service, { current, previous }]) => ({
    service, current, previous, change: current - previous,
    changePercent: previous ? Math.round(((current - previous) / previous) * 100) : null,
    focus: focusFor(current, previous),
  })).sort((left, right) => right.current - left.current || right.previous - left.previous || left.service.localeCompare(right.service));
  const totalCurrent = rows.reduce((sum, row) => sum + row.current, 0);
  const totalPrevious = rows.reduce((sum, row) => sum + row.previous, 0);
  const leaders = totalCurrent ? rows.filter((row) => row.current === rows[0].current).map((row) => row.service) : [];
  const previousHighest = Math.max(0, ...rows.map((row) => row.previous));
  const previousLeaders = previousHighest ? rows.filter((row) => row.previous === previousHighest).map((row) => row.service) : [];
  return { window, totalCurrent, totalPrevious, leaders, previousLeaders, rows,
    recommendations: buildComparisonRecommendations(rows, totalCurrent, totalPrevious) };
};

const generateServiceComparisonInsight = async (comparison) => {
  const fallback = { recommendations: comparison.recommendations };
  if (!comparison.totalCurrent && !comparison.totalPrevious) return { status: "insufficient_data", ...fallback };
  if (!process.env.OPENROUTER_API_KEY) return { status: "not_configured", ...fallback };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 650,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "service_booking_comparison_insight",
            strict: true,
            schema: {
              type: "object",
              properties: {
                insight: { type: "string" }, action: { type: "string" },
                recommendations: {
                  type: "array", maxItems: 3,
                  items: { type: "object", properties: { service: { type: "string" }, improvement: { type: "string" } },
                    required: ["service", "improvement"], additionalProperties: false },
                },
              },
              required: ["insight", "action", "recommendations"], additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: "Summarize aggregate dental clinic service bookings for two selected periods. Identify the most booked service and explain practical improvements grounded only in the supplied counts. The selected period may be older than the compared period, so do not imply chronological growth or decline unless the dates support it. Refine only the supplied recommendation candidates; preserve their exact service names. Never invent bookings, causes, patients, revenue, medical claims, or certainty. Treat the comparison as historical bookings, not a forecast. Keep advice concise and cautious." },
          { role: "user", content: JSON.stringify({ window: comparison.window, selectedBookings: comparison.totalCurrent, comparisonBookings: comparison.totalPrevious, mostBookedSelected: comparison.leaders, mostBookedComparison: comparison.previousLeaders, services: comparison.rows.map(({ service, current, previous }) => ({ service, selected: current, comparison: previous })), recommendationCandidates: comparison.recommendations }) },
        ],
      }),
    });
    if (!response.ok) return { status: "unavailable", ...fallback };
    const result = await response.json();
    const content = JSON.parse(result.choices?.[0]?.message?.content || "null");
    if (typeof content?.insight !== "string" || typeof content?.action !== "string" || !Array.isArray(content.recommendations)) {
      return { status: "unavailable", ...fallback };
    }
    const generatedByService = new Map(content.recommendations
      .filter((item) => typeof item?.service === "string" && typeof item?.improvement === "string")
      .map((item) => [item.service, item.improvement]));
    return {
      status: "ready", insight: content.insight.slice(0, 300), action: content.action.slice(0, 200),
      recommendations: comparison.recommendations.map((item) => ({
        ...item, improvement: String(generatedByService.get(item.service) || item.improvement).slice(0, 240),
      })),
    };
  } catch {
    return { status: "unavailable", ...fallback };
  }
};

module.exports = { buildServiceComparison, generateServiceComparisonInsight, getServiceComparisonWindow };
