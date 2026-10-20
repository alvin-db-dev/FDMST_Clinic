const { addDays, clinicDateKey, clinicDayStart, parseDateKey } = require("../utils/clinicDate");
const HISTORY_DAYS = 84;
// Past visits that actually occupied the schedule. Past "pending" requests are excluded: requests that are
// never confirmed are auto-declined, so they did not take a slot.
const HISTORY_STATUSES = new Set(["confirmed", "follow_up", "checked_in", "in_consultation", "completed", "no_show"]);
// Statuses that count as "already scheduled" for a target day. Completed, in-progress and no-show visits are
// included so that choosing today reflects everything already on today's schedule.
const BOOKED_STATUSES = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "no_show"]);
// Recent weeks describe the clinic's current rhythm better than older ones: a visit 4 weeks ago counts half as
// much as one this week.
const RECENCY_HALF_LIFE_DAYS = 28;
// Minimum number of past visits with a known booking date before the booking-pace adjustment is trusted.
const MIN_PACE_SAMPLES = 10;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_WORKING_DAYS = WEEKDAYS.filter((day) => day !== "Sunday");

const round = (value, precision = 1) => {
  const multiplier = 10 ** precision;
  return Math.round((Number(value) || 0) * multiplier) / multiplier;
};

const weekdayFor = (key) => WEEKDAYS[parseDateKey(key).getUTCDay()];
const daysBetween = (fromKey, toKey) => Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);

const weightedStats = (rows) => {
  const totalWeight = rows.reduce((total, row) => total + row.weight, 0);
  if (!totalWeight) return { mean: 0, deviation: 0 };
  const mean = rows.reduce((total, row) => total + row.weight * row.count, 0) / totalWeight;
  const variance = rows.reduce((total, row) => total + row.weight * (row.count - mean) ** 2, 0) / totalWeight;
  return { mean, deviation: Math.sqrt(variance) };
};

const buildAppointmentForecast = ({ targetDate, appointments, workingDays = DEFAULT_WORKING_DAYS, today = clinicDateKey() }) => {
  const working = new Set(Array.isArray(workingDays) ? workingDays : DEFAULT_WORKING_DAYS);
  const windowStart = addDays(today, -HISTORY_DAYS);
  const counts = new Map();
  const scheduled = new Map();
  const bookingLeadDays = [];
  let earliestRecord = null;

  for (const appointment of appointments) {
    const key = clinicDateKey(appointment.appointmentDate);
    if (key >= windowStart && key < today) {
      if (!earliestRecord || key < earliestRecord) earliestRecord = key;
      if (HISTORY_STATUSES.has(appointment.status)) {
        counts.set(key, (counts.get(key) || 0) + 1);
        const bookedAt = appointment.requestSubmittedAt || appointment.createdAt;
        if (bookedAt && !Number.isNaN(new Date(bookedAt).getTime())) {
          bookingLeadDays.push(Math.max(0, daysBetween(clinicDateKey(bookedAt), key)));
        }
      }
    }
    if (key >= targetDate && key <= addDays(targetDate, 6) && BOOKED_STATUSES.has(appointment.status)) {
      scheduled.set(key, (scheduled.get(key) || 0) + 1);
    }
  }

  // History starts at the first recorded appointment in the window, so days before the clinic began using the
  // system are not counted as zero-appointment days.
  const historyStart = earliestRecord || windowStart;
  const historyLength = Math.max(daysBetween(historyStart, today), 0);
  const history = Array.from({ length: historyLength }, (_, index) => {
    const date = addDays(historyStart, index);
    const age = daysBetween(date, today);
    return { date, weekday: weekdayFor(date), count: counts.get(date) || 0, weight: 0.5 ** (age / RECENCY_HALF_LIFE_DAYS) };
  }).filter((day) => working.has(day.weekday));
  const historyAppointments = history.reduce((total, day) => total + day.count, 0);
  const hasPaceData = bookingLeadDays.length >= MIN_PACE_SAMPLES;

  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(targetDate, offset);
    const weekday = weekdayFor(date);
    const booked = scheduled.get(date) || 0;
    const comparable = history.filter((day) => day.weekday === weekday);
    const isWorkingDay = working.has(weekday);
    if (!isWorkingDay || historyAppointments < 5 || comparable.length < 4) {
      return { date, weekday, booked, forecast: null, low: null, high: null, isWorkingDay, comparableDays: comparable.length, method: null };
    }

    // Same-weekday history only: weekday volume differs sharply in dental clinics (e.g. busy Mondays, quiet
    // Saturdays), so blending in the all-days average would bias every forecast toward the middle. At least
    // four comparable weekdays are required above, which keeps this estimate stable.
    const sameWeekday = weightedStats(comparable);
    const baseline = sameWeekday.mean;
    const leadNow = daysBetween(today, date);
    let forecast;
    let spread;
    let method;

    if (hasPaceData && leadNow > 0) {
      // Booking pace: of past visits, the share already booked this many days ahead. The rest of a typical
      // day's volume is still expected to arrive, so the forecast is what is booked plus that remaining share.
      const bookedByNowShare = bookingLeadDays.filter((lead) => lead >= leadNow).length / bookingLeadDays.length;
      const stillToCome = 1 - bookedByNowShare;
      forecast = Math.round(booked + stillToCome * baseline);
      spread = stillToCome > 0 ? Math.max(1, Math.round(sameWeekday.deviation * stillToCome)) : 0;
      method = "booking_pace";
    } else {
      forecast = Math.max(booked, Math.round(baseline));
      spread = Math.max(1, Math.round(sameWeekday.deviation));
      method = "weekday_history";
    }

    forecast = Math.max(booked, forecast);
    return {
      date,
      weekday,
      booked,
      forecast,
      low: Math.max(booked, forecast - spread),
      high: Math.max(booked, forecast + spread),
      isWorkingDay,
      comparableDays: comparable.length,
      method,
    };
  });

  return {
    selected: days[0],
    days,
    historyDays: history.length,
    historyAppointments,
    historyStart,
    historyEnd: addDays(today, -1),
    bookingPaceSamples: bookingLeadDays.length,
  };
};

const getConfidenceLevel = (forecast) => {
  const comparableDays = forecast.days
    .filter((day) => day.isWorkingDay)
    .map((day) => day.comparableDays);
  const minimumComparableDays = comparableDays.length ? Math.min(...comparableDays) : 0;
  if (forecast.historyAppointments >= 24 && minimumComparableDays >= 8) return "High";
  if (forecast.historyAppointments >= 10 && minimumComparableDays >= 4) return "Medium";
  return "Low";
};

const getTargetPeriod = (days, fallbackStart) => {
  const forecastDays = days.filter((day) => day.isWorkingDay && day.forecast !== null);
  if (!forecastDays.length) return { startDate: fallbackStart, endDate: fallbackStart };

  const dailyAverage = forecastDays.reduce((total, day) => total + day.forecast, 0) / forecastDays.length;
  const lowThreshold = Math.max(1, Math.floor(dailyAverage * 0.8));
  const lowDays = forecastDays.filter((day) => day.forecast <= lowThreshold);
  const candidates = lowDays.length ? lowDays : [...forecastDays].sort((a, b) => a.forecast - b.forecast).slice(0, 1);
  const runs = [];

  candidates.sort((a, b) => a.date.localeCompare(b.date)).forEach((day) => {
    const current = runs.at(-1);
    if (current && addDays(current.at(-1).date, 1) === day.date) current.push(day);
    else runs.push([day]);
  });
  const best = runs.sort((a, b) => b.length - a.length || a[0].date.localeCompare(b[0].date))[0];
  return { startDate: best[0].date, endDate: best.at(-1).date };
};

const buildServiceDemandForecasts = ({
  targetDate,
  appointments,
  services,
  workingDays = DEFAULT_WORKING_DAYS,
  today = clinicDateKey(),
}) => {
  const uniqueServices = [...new Set((services || []).map((service) => String(service || "").trim()).filter(Boolean))];
  const recentStart = addDays(today, -28);
  const previousStart = addDays(today, -84);

  return uniqueServices.map((service) => {
    const serviceAppointments = appointments.filter((appointment) => appointment.service === service);
    const forecast = buildAppointmentForecast({ targetDate, appointments: serviceAppointments, workingDays, today });
    const historical = serviceAppointments.filter((appointment) => {
      const date = clinicDateKey(appointment.appointmentDate);
      return date >= previousStart && date < today && HISTORY_STATUSES.has(appointment.status);
    });
    const recentCount = historical.filter((appointment) => clinicDateKey(appointment.appointmentDate) >= recentStart).length;
    const previousCount = historical.length - recentCount;
    const recentWeeklyAverage = recentCount / 4;
    const previousWeeklyAverage = previousCount / 8;
    const predictedAppointments = forecast.days.reduce((total, day) => total + (day.forecast ?? 0), 0);
    const bookedAppointments = forecast.days.reduce((total, day) => total + day.booked, 0);
    const historicalWeeklyAverage = forecast.historyDays
      ? forecast.historyAppointments / (forecast.historyDays / Math.max(new Set(workingDays).size, 1))
      : 0;
    const trendPercent = previousWeeklyAverage > 0
      ? round(((recentWeeklyAverage - previousWeeklyAverage) / previousWeeklyAverage) * 100)
      : 0;
    const isDeclining = previousCount >= 4 && recentWeeklyAverage <= previousWeeklyAverage * 0.8;
    const isConsistentlyLow = forecast.historyAppointments >= 5 && historicalWeeklyAverage < 1.5;
    const alreadyBusy = (historicalWeeklyAverage > 0 && predictedAppointments > historicalWeeklyAverage * 1.15)
      || (previousCount >= 4 && recentWeeklyAverage >= previousWeeklyAverage * 1.2);
    const demandLevel = forecast.selected.forecast === null
      ? "insufficient"
      : alreadyBusy ? "high" : isDeclining || isConsistentlyLow ? "low" : "moderate";

    return {
      service,
      demandLevel,
      predictedAppointments,
      bookedAppointments,
      historicalAppointments: forecast.historyAppointments,
      historicalWeeklyAverage: round(historicalWeeklyAverage),
      recentWeeklyAverage: round(recentWeeklyAverage),
      previousWeeklyAverage: round(previousWeeklyAverage),
      trendPercent,
      confidenceLevel: getConfidenceLevel(forecast),
      targetPeriod: getTargetPeriod(forecast.days, targetDate),
      days: forecast.days,
    };
  });
};

const promotionTitleFor = (service, discountValue) => {
  const normalized = service.toLowerCase();
  if (normalized.includes("orthodont") || normalized.includes("braces")) return `${discountValue}% Off Initial Orthodontic Visit`;
  if (normalized.includes("prophylaxis") || normalized.includes("cleaning")) return `${discountValue}% Off Dental Cleaning`;
  if (normalized.includes("check-up") || normalized.includes("checkup")) return `${discountValue}% Off Oral Check-up`;
  return `${discountValue}% Off ${service}`;
};

const buildPromotionRecommendations = ({ serviceForecasts, blockedServices = new Set(), allServicesBlocked = false }) => serviceForecasts
  .filter((item) => item.demandLevel === "low" && item.historicalAppointments >= 5)
  .filter((item) => !allServicesBlocked && !blockedServices.has(item.service))
  .sort((a, b) => a.trendPercent - b.trendPercent || a.predictedAppointments - b.predictedAppointments)
  .slice(0, 3)
  .map((item) => {
    const discountValue = item.trendPercent <= -40 ? 15 : 10;
    const suggestedPromotion = promotionTitleFor(item.service, discountValue);
    const trendReason = item.trendPercent < 0
      ? `Recent weekly bookings are ${Math.abs(item.trendPercent)}% below the preceding eight-week average.`
      : `This service averages only ${item.historicalWeeklyAverage} appointment${item.historicalWeeklyAverage === 1 ? "" : "s"} per week.`;
    const codeBase = item.service.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "PROMO";

    return {
      service: item.service,
      forecast: `Low demand: ${item.predictedAppointments} appointment${item.predictedAppointments === 1 ? "" : "s"} expected for the forecast week.`,
      suggestedPromotion,
      discountType: "percentage",
      discountValue,
      recommendedOffer: `${discountValue}% discount`,
      startDate: item.targetPeriod.startDate,
      endDate: item.targetPeriod.endDate,
      reason: `${trendReason} The selected dates have the lowest predicted demand in the forecast window.`,
      predictedImpact: "May encourage additional bookings during the predicted low-demand period.",
      confidenceLevel: item.confidenceLevel,
      promoCode: `${codeBase}${item.targetPeriod.startDate.replaceAll("-", "")}`.slice(0, 18),
    };
  });

const mergeAiRecommendations = (candidates, generated = []) => {
  const generatedByService = new Map(generated.map((item) => [item.service, item]));
  return candidates.map((candidate) => {
    const ai = generatedByService.get(candidate.service);
    if (!ai) return candidate;
    return {
      ...candidate,
      suggestedPromotion: String(ai.suggestedPromotion || candidate.suggestedPromotion).slice(0, 120),
      reason: String(ai.reason || candidate.reason).slice(0, 320),
      predictedImpact: String(ai.predictedImpact || candidate.predictedImpact).slice(0, 240),
    };
  });
};

const generateForecastInsight = async (forecast, service = "", recommendationCandidates = []) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return { status: "not_configured", recommendations: recommendationCandidates, recommendationSource: "forecast_rules" };
  }
  if (forecast.selected.forecast === null && !recommendationCandidates.length) {
    return { status: "insufficient_data", recommendations: [], recommendationSource: "forecast_rules" };
  }

  const selected = forecast.selected;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 900,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "appointment_forecast_insight",
            strict: true,
            schema: {
              type: "object",
              properties: {
                insight: { type: "string" },
                action: { type: "string" },
                recommendations: {
                  type: "array",
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      service: { type: "string" },
                      suggestedPromotion: { type: "string" },
                      reason: { type: "string" },
                      predictedImpact: { type: "string" },
                    },
                    required: ["service", "suggestedPromotion", "reason", "predictedImpact"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insight", "action", "recommendations"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: "You summarize aggregate dental clinic appointment forecasts and refine only the supplied promotion candidates. Never add services, dates, discount values, medical claims, patients, revenue claims, or certainty. For each candidate, preserve its exact service and offer value, then write a concise promotion title, data-grounded reason, and cautious predicted impact. Return no recommendation for a service not supplied." },
          { role: "user", content: JSON.stringify({ date: selected.date, weekday: selected.weekday, service: service || "All services", existingBookings: selected.booked, forecast: selected.forecast, estimatedRange: [selected.low, selected.high], comparableWeekdays: selected.comparableDays, historyDays: forecast.historyDays, historyAppointments: forecast.historyAppointments, promotionCandidates: recommendationCandidates }) },
        ],
      }),
    });
    if (!response.ok) {
      return { status: "unavailable", recommendations: recommendationCandidates, recommendationSource: "forecast_rules" };
    }
    const result = await response.json();
    const content = JSON.parse(result.choices?.[0]?.message?.content || "null");
    if (typeof content?.insight !== "string" || typeof content?.action !== "string" || !Array.isArray(content.recommendations)) {
      return { status: "unavailable", recommendations: recommendationCandidates, recommendationSource: "forecast_rules" };
    }
    return {
      status: "ready",
      insight: content.insight.slice(0, 300),
      action: content.action.slice(0, 200),
      recommendations: mergeAiRecommendations(recommendationCandidates, content.recommendations),
      recommendationSource: "ai",
    };
  } catch {
    return { status: "unavailable", recommendations: recommendationCandidates, recommendationSource: "forecast_rules" };
  }
};

module.exports = {
  addDays,
  buildAppointmentForecast,
  buildPromotionRecommendations,
  buildServiceDemandForecasts,
  clinicDateKey,
  clinicDayStart,
  generateForecastInsight,
  parseDateKey,
};
