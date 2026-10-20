const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addDays,
  buildAppointmentForecast,
  buildPromotionRecommendations,
  buildServiceDemandForecasts,
  clinicDateKey,
  clinicDayStart,
  generateForecastInsight,
  parseDateKey,
} = require("../services/analyticsPredictionService");

test("clinic date helpers preserve Manila appointment dates and reject invalid dates", () => {
  assert.equal(clinicDateKey(new Date("2026-07-14T16:00:00.000Z")), "2026-07-15");
  assert.equal(clinicDayStart("2026-07-15").toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(parseDateKey("2026-02-30"), null);
});

test("forecast uses comparable weekdays, booked appointments, and clinic working days", () => {
  const today = "2026-09-22";
  const targetDate = "2026-09-23";
  const appointments = [];
  for (let week = 1; week <= 8; week += 1) {
    const date = addDays(targetDate, -7 * week);
    appointments.push({ appointmentDate: clinicDayStart(date), status: "completed" });
    appointments.push({ appointmentDate: clinicDayStart(date), status: "completed" });
    appointments.push({ appointmentDate: clinicDayStart(date), status: "cancelled" });
  }
  appointments.push({ appointmentDate: clinicDayStart(targetDate), status: "confirmed" });

  const result = buildAppointmentForecast({ targetDate, appointments, today });
  assert.equal(result.selected.booked, 1);
  assert.ok(result.selected.forecast >= 1);
  assert.ok(result.selected.low >= result.selected.booked);
  assert.equal(result.historyAppointments, 16);
  assert.equal(result.days[4].weekday, "Sunday");
  assert.equal(result.days[4].forecast, null);
});

test("forecast reports insufficient history instead of inventing a number", () => {
  const result = buildAppointmentForecast({
    targetDate: "2026-09-23",
    today: "2026-09-22",
    appointments: [{ appointmentDate: clinicDayStart("2026-09-23"), status: "pending" }],
  });
  assert.equal(result.selected.booked, 1);
  assert.equal(result.selected.forecast, null);
});

test("promotion recommendations target declining services and skip busy or covered services", () => {
  const today = "2026-09-22";
  const targetDate = "2026-09-23";
  const appointments = [];
  for (let week = 1; week <= 12; week += 1) {
    const date = addDays(targetDate, -7 * week);
    const cleaningCount = week <= 4 ? 1 : 3;
    const extractionCount = week <= 4 ? 3 : 1;
    for (let index = 0; index < cleaningCount; index += 1) appointments.push({ appointmentDate: clinicDayStart(date), status: "completed", service: "Dental Cleaning" });
    for (let index = 0; index < extractionCount; index += 1) appointments.push({ appointmentDate: clinicDayStart(date), status: "completed", service: "Tooth Extraction" });
  }

  const serviceForecasts = buildServiceDemandForecasts({
    targetDate,
    today,
    appointments,
    services: ["Dental Cleaning", "Tooth Extraction"],
  });
  assert.equal(serviceForecasts.find((item) => item.service === "Dental Cleaning").demandLevel, "low");
  assert.equal(serviceForecasts.find((item) => item.service === "Tooth Extraction").demandLevel, "high");

  const recommendations = buildPromotionRecommendations({ serviceForecasts });
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].service, "Dental Cleaning");
  assert.equal(recommendations[0].discountType, "percentage");
  assert.ok(recommendations[0].startDate >= targetDate);

  assert.deepEqual(buildPromotionRecommendations({
    serviceForecasts,
    blockedServices: new Set(["Dental Cleaning"]),
  }), []);
});

test("AI request receives aggregate data and returns validated text", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const forecast = buildAppointmentForecast({
    targetDate: "2026-09-23",
    today: "2026-09-22",
    appointments: Array.from({ length: 8 }, (_, index) => ({
      appointmentDate: clinicDayStart(addDays("2026-09-23", -(index + 1) * 7)),
      status: "completed",
    })),
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = JSON.parse(body.messages[1].content);
    assert.equal(data.date, "2026-09-23");
    assert.equal(data.existingBookings, 0);
    assert.ok(!body.messages[1].content.includes("patientName"));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insight: "Demand may be steady.", action: "Review the schedule.", recommendations: [] }) } }] }) };
  };
  try {
    const result = await generateForecastInsight(forecast);
    assert.deepEqual(result, {
      status: "ready",
      insight: "Demand may be steady.",
      action: "Review the schedule.",
      recommendations: [],
      recommendationSource: "ai",
    });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test("AI can refine recommendation wording without changing protected draft fields", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const forecast = buildAppointmentForecast({
    targetDate: "2026-09-23",
    today: "2026-09-22",
    appointments: Array.from({ length: 8 }, (_, index) => ({
      appointmentDate: clinicDayStart(addDays("2026-09-23", -(index + 1) * 7)),
      status: "completed",
    })),
  });
  const candidate = {
    service: "Dental Cleaning",
    suggestedPromotion: "10% Off Dental Cleaning",
    discountType: "percentage",
    discountValue: 10,
    recommendedOffer: "10% discount",
    startDate: "2026-09-23",
    endDate: "2026-09-24",
    reason: "Demand is low.",
    predictedImpact: "May increase bookings.",
    confidenceLevel: "Medium",
    promoCode: "CLEAN20260923",
  };
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({
      insight: "Demand may be lower.",
      action: "Review the proposed offer.",
      recommendations: [{
        service: "Dental Cleaning",
        suggestedPromotion: "Dental Cleaning Weekday Offer",
        reason: "Cleaning demand is below its recent baseline.",
        predictedImpact: "May encourage bookings on quieter dates.",
        discountValue: 90,
        startDate: "2099-01-01",
      }],
    }) } }] }),
  });

  try {
    const result = await generateForecastInsight(forecast, "", [candidate]);
    assert.equal(result.recommendations[0].suggestedPromotion, "Dental Cleaning Weekday Offer");
    assert.equal(result.recommendations[0].discountValue, 10);
    assert.equal(result.recommendations[0].startDate, "2026-09-23");
    assert.equal(result.recommendations[0].promoCode, "CLEAN20260923");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
