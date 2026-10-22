const express = require("express");

const Appointment = require("../models/Appointment");
const DentalRecord = require("../models/DentalRecord");
const Feedback = require("../models/Feedback");
const Inventory = require("../models/Inventory");
const ClinicSettings = require("../models/ClinicSettings");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Promotion = require("../models/Promotion");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const {
  buildAppointmentForecast,
  buildPromotionRecommendations,
  buildServiceDemandForecasts,
  generateForecastInsight,
} = require("../services/analyticsPredictionService");
const { buildServiceComparison, generateServiceComparisonInsight, getServiceComparisonWindow } = require("../services/serviceComparisonService");
const { addDays, clinicDateKey, clinicDayStart, clinicDayEnd, parseDateKey, storedAppointmentDayRange } = require("../utils/clinicDate");
const { getAnalyticsDateRange, getKpiComparisonRange } = require("../utils/analyticsDateRange");

const router = express.Router();

const OFFICIAL_SERVICES = [
  "Dental Radiographs",
  "Oral Surgery",
  "Veneers",
  "Tooth Sealant",
  "Fluoride Treatment",
  "Braces / Orthodontic Treatment",
  "Tooth Extraction",
  "Dental Restoration",
  "Crowns / Caps",
  "Fixed Partial Dentures (FPD)",
  "Dentures",
  "Oral Prophylaxis / Cleaning",
  "Root Canal Therapy (RCT)",
  "Oral Check-up",
];

const SERVICE_ALIASES = {
  "braces": "Braces / Orthodontic Treatment",
  "orthodontic braces": "Braces / Orthodontic Treatment",
  "orthodontic treatment": "Braces / Orthodontic Treatment",
  "cleaning": "Oral Prophylaxis / Cleaning",
  "oral prophylaxis": "Oral Prophylaxis / Cleaning",
  "prophylaxis": "Oral Prophylaxis / Cleaning",
  "root canal": "Root Canal Therapy (RCT)",
  "root canal therapy": "Root Canal Therapy (RCT)",
  "rct": "Root Canal Therapy (RCT)",
  "check-up": "Oral Check-up",
  "checkup": "Oral Check-up",
  "oral checkup": "Oral Check-up",
  "oral check-up": "Oral Check-up",
  "extraction": "Tooth Extraction",
  "tooth filling": "Dental Restoration",
  "composite filling": "Dental Restoration",
  "restoration": "Dental Restoration",
  "crowns": "Crowns / Caps",
  "caps": "Crowns / Caps",
  "fpd": "Fixed Partial Dentures (FPD)",
  "fixed partial dentures": "Fixed Partial Dentures (FPD)",
};

const PREVENTIVE_SERVICES = new Set([
  "Dental Radiographs",
  "Tooth Sealant",
  "Fluoride Treatment",
  "Oral Prophylaxis / Cleaning",
  "Oral Check-up",
]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const normalizeService = (value) => {
  const rawValue = String(value || "Unspecified").trim();
  const lowerValue = rawValue.toLowerCase();
  const officialMatch = OFFICIAL_SERVICES.find((service) => service.toLowerCase() === lowerValue);
  return officialMatch || SERVICE_ALIASES[lowerValue] || rawValue;
};

const fullName = (value) => [value?.firstName, value?.lastName].filter(Boolean).join(" ").trim();

const getMonthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return clinicDateKey(date).slice(0, 7);
};

const getMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey).split("-");
  const monthIndex = Number(month) - 1;
  return Number.isFinite(monthIndex) && MONTHS[monthIndex] ? `${MONTHS[monthIndex]} ${year}` : monthKey;
};

const getDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return clinicDateKey(date);
};

const getWeekKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const key = clinicDateKey(date);
  const day = parseDateKey(key).getUTCDay();
  return addDays(key, day === 0 ? -6 : 1 - day);
};

const getHourKey = (timeValue) => {
  const match = String(timeValue || "").trim().match(/^(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return "Unspecified";

  let hour = Number(match[1]);
  const meridiem = match[2]?.toUpperCase();
  if (Number.isNaN(hour) || (meridiem && (hour < 1 || hour > 12)) || (!meridiem && (hour < 0 || hour > 23))) {
    return "Unspecified";
  }

  if (meridiem) {
    hour %= 12;
    if (meridiem === "PM") hour += 12;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
};

const getAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const ageGroup = (age) => {
  if (age === null) return "Unknown";
  if (age <= 12) return "0-12";
  if (age <= 19) return "13-19";
  if (age <= 35) return "20-35";
  if (age <= 50) return "36-50";
  if (age <= 64) return "51-64";
  return "65+";
};

const increment = (map, key, amount = 1) => {
  map.set(key, (map.get(key) || 0) + amount);
};

const isNoShowAppointment = (appointment) => appointment.status === "no_show" || /no[-\s]?show/i.test(appointment.notes || "");

// Follow-up visits are created with the "follow_up" status (and keep that entry in their timeline once they
// progress). Only the reason text is used as a fallback; service names such as "Oral Check-up" must not match.
const isFollowUpAppointment = (appointment) => appointment.status === "follow_up"
  || (Array.isArray(appointment.timeline) && appointment.timeline.some((entry) => entry?.status === "follow_up"))
  || /\bfollow[-\s]?up\b/i.test(appointment.reason || "");

const humanizeLabel = (value) => String(value || "Unknown")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (character) => character.toUpperCase());

const SCHEDULED_STATUSES = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "rescheduled"]);

const getAppointmentRevenueEstimate = (appointment) => {
  if (appointment.status !== "completed") return 0;

  const revenue = Number(appointment.estimatedRevenueAmount);
  if (Number.isFinite(revenue) && revenue >= 0) return revenue;

  const finalPrice = Number(appointment.finalPrice);
  if (Number.isFinite(finalPrice) && finalPrice >= 0) return finalPrice;

  const snapshot = Number(appointment.servicePriceSnapshot);
  return Number.isFinite(snapshot) && snapshot >= 0 ? snapshot : 0;
};

const buildPromotionAnalytics = (appointments = []) => {
  const redeemedAppointments = appointments.filter((appointment) => appointment.promoCode);
  const byPromotionMap = new Map();
  const revenueGenerated = redeemedAppointments
    .filter((appointment) => appointment.status === "completed")
    .reduce((total, appointment) => total + getAppointmentRevenueEstimate(appointment), 0);
  const discountAmountGiven = redeemedAppointments
    .reduce((total, appointment) => total + (Number(appointment.discountAmount) || 0), 0);

  redeemedAppointments.forEach((appointment) => {
    const label = appointment.promoTitle || appointment.promoCode || "Promotion";
    const current = byPromotionMap.get(label) || {
      label,
      promoCode: appointment.promoCode,
      redemptions: 0,
      revenue: 0,
      discountAmount: 0,
    };

    current.redemptions += 1;
    current.discountAmount += Number(appointment.discountAmount) || 0;
    if (appointment.status === "completed") {
      current.revenue += getAppointmentRevenueEstimate(appointment);
    }
    byPromotionMap.set(label, current);
  });

  const byPromotion = [...byPromotionMap.values()].sort((a, b) => b.redemptions - a.redemptions || a.label.localeCompare(b.label));

  return {
    totalRedemptions: redeemedAppointments.length,
    mostRedeemedPromotion: byPromotion[0] || null,
    revenueGenerated,
    discountAmountGiven,
    redemptionRate: appointments.length ? Math.round((redeemedAppointments.length / appointments.length) * 1000) / 10 : 0,
    byPromotion,
  };
};

const asSeries = (map, { limit, labels } = {}) => {
  const rows = labels
    ? labels.map((label) => ({ label, value: map.get(label) || 0 }))
    : [...map.entries()].map(([label, value]) => ({ label, value }));

  const sortedRows = labels ? rows : rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return typeof limit === "number" ? sortedRows.slice(0, limit) : sortedRows;
};

const lastMonthKeys = (count = 12, referenceDate = clinicDateKey()) => {
  const currentMonth = `${referenceDate.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, index) => {
    const value = parseDateKey(currentMonth);
    value.setUTCMonth(value.getUTCMonth() - (count - index - 1));
    return value.toISOString().slice(0, 7);
  });
};

const calculateChange = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  if (!previousValue && !currentValue) {
    return {
      value: 0,
      status: "neutral",
      current: currentValue,
      previous: previousValue,
    };
  }

  if (!previousValue) {
    // Nothing in the previous period: a percentage is undefined, so report it as "new" activity.
    return {
      value: 100,
      status: "new",
      current: currentValue,
      previous: previousValue,
    };
  }

  const value = Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));

  return {
    value,
    status: value > 0 ? "increase" : value < 0 ? "decrease" : "neutral",
    current: currentValue,
    previous: previousValue,
  };
};

const getAnalyticsFilters = (query = {}, dateRange = null) => {
  const appointmentQuery = {};

  if (dateRange) {
    appointmentQuery.appointmentDate = { $gte: dateRange.currentStart, $lte: dateRange.currentEnd };
  }

  if (query.dentist) appointmentQuery.dentistName = query.dentist;
  if (query.service) appointmentQuery.service = query.service;
  if (query.status) appointmentQuery.status = query.status;

  return appointmentQuery;
};

const getAnalyticsBaseFilters = (query = {}) => {
  const baseQuery = {};
  if (query.dentist) baseQuery.dentistName = query.dentist;
  if (query.service) baseQuery.service = query.service;
  if (query.status) baseQuery.status = query.status;
  return baseQuery;
};

const appointmentPatientKey = (appointment) => appointment.patient
  ? `patient:${appointment.patient}`
  : `legacy:${String(appointment.email || "").trim().toLowerCase()}:${String(appointment.patientName || "").trim().toLowerCase()}`;

const buildKpiStats = (appointments, monthlyAppointments, comparisonRange) => {
  const now = new Date();
  const getCounts = (items, { focusStart = comparisonRange.focusStart, focusEnd = comparisonRange.focusEnd, upcomingReference = now } = {}) => ({
    totalAppointments: items.length,
    currentPatients: new Set(items.map(appointmentPatientKey)).size,
    todaysAppointments: items.filter((item) => {
      const date = new Date(item.appointmentDate);
      return date >= focusStart && date <= focusEnd && !["cancelled", "declined"].includes(item.status);
    }).length,
    upcomingAppointments: items.filter((item) => (
      new Date(item.appointmentDate) > upcomingReference && ["pending", "confirmed", "follow_up"].includes(item.status)
    )).length,
    completedAppointments: items.filter((item) => item.status === "completed").length,
    pendingAppointments: items.filter((item) => item.status === "pending").length,
    cancelledAppointments: items.filter((item) => item.status === "cancelled").length,
    noShowAppointments: items.filter(isNoShowAppointment).length,
  });

  const currentPeriodAppointments = monthlyAppointments.filter((item) => {
    const date = new Date(item.appointmentDate || item.createdAt);
    return date >= comparisonRange.currentStart && date <= comparisonRange.currentEnd;
  });
  const previousPeriodAppointments = monthlyAppointments.filter((item) => {
    const date = new Date(item.appointmentDate || item.createdAt);
    return date >= comparisonRange.previousStart && date <= comparisonRange.previousEnd;
  });
  const currentCounts = getCounts(currentPeriodAppointments);
  const previousCounts = getCounts(previousPeriodAppointments, {
    focusStart: comparisonRange.previousFocusStart,
    focusEnd: comparisonRange.previousFocusEnd,
    upcomingReference: comparisonRange.previousEnd,
  });
  const totalCounts = getCounts(appointments);

  return {
    ...totalCounts,
    monthlyChange: Object.fromEntries(
      Object.keys(totalCounts).map((key) => [key, calculateChange(currentCounts[key], previousCounts[key])]),
    ),
  };
};

const countPatientsRegisteredInRange = (patients = [], start, end) => patients.filter((patient) => {
  const createdAt = new Date(patient.createdAt);
  return !Number.isNaN(createdAt.getTime()) && createdAt >= start && createdAt <= end;
}).length;

const buildServiceAnalytics = (appointments, dateRange = null) => {
  const serviceCounts = new Map(OFFICIAL_SERVICES.map((service) => [service, 0]));
  const monthlyCounts = new Map();
  const serviceMonthCounts = new Map();
  // Growth compares the 30 days ending on the selected end date (or today) with the 30 days before that.
  // Both windows are bounded so future bookings never inflate the "current" side.
  const growthEnd = dateRange?.endDate || clinicDateKey();
  const growthCurrentStart = addDays(growthEnd, -29);
  const growthPreviousStart = addDays(growthEnd, -59);
  const currentCounts = new Map();
  const previousCounts = new Map();

  appointments.forEach((appointment) => {
    const service = normalizeService(appointment.service);
    const monthKey = getMonthKey(appointment.appointmentDate || appointment.createdAt);
    const dateKey = getDateKey(appointment.appointmentDate || appointment.createdAt);
    increment(serviceCounts, service);
    increment(monthlyCounts, monthKey);
    serviceMonthCounts.set(`${service}__${monthKey}`, (serviceMonthCounts.get(`${service}__${monthKey}`) || 0) + 1);

    if (dateKey !== "Unknown") {
      if (dateKey >= growthCurrentStart && dateKey <= growthEnd) increment(currentCounts, service);
      else if (dateKey >= growthPreviousStart && dateKey < growthCurrentStart) increment(previousCounts, service);
    }
  });

  const growthRows = [...serviceCounts.keys()]
    .map((service) => {
      const current = currentCounts.get(service) || 0;
      const previous = previousCounts.get(service) || 0;
      const change = calculateChange(current, previous);
      return { label: service, value: change.value, status: change.status, current, previous };
    })
    .filter((item) => item.current + item.previous > 0);

  const monthKeys = lastMonthKeys(12, dateRange?.endDate);
  const monthLabels = monthKeys.map(getMonthLabel);

  return {
    officialServices: OFFICIAL_SERVICES,
    distribution: asSeries(serviceCounts),
    mostRequested: asSeries(serviceCounts, { limit: 8 }),
    monthLabels,
    monthlyTrend: monthKeys.map((key, index) => ({ label: monthLabels[index], value: monthlyCounts.get(key) || 0 })),
    serviceTrendMatrix: asSeries(serviceCounts, { limit: 6 })
      .filter((service) => service.value > 0)
      .map((service) => ({
        label: service.label,
        values: monthKeys.map((key) => serviceMonthCounts.get(`${service.label}__${key}`) || 0),
      })),
    growthWindow: { currentStart: growthCurrentStart, currentEnd: growthEnd, previousStart: growthPreviousStart, previousEnd: addDays(growthCurrentStart, -1) },
    fastestGrowing: growthRows.filter((item) => item.status === "increase" || item.status === "new").sort((a, b) => b.value - a.value || b.current - a.current).slice(0, 5),
    fastestDeclining: growthRows.filter((item) => item.status === "decrease").sort((a, b) => a.value - b.value || b.previous - a.previous).slice(0, 5),
  };
};

const buildAppointmentAnalytics = (appointments, dateRange = null) => {
  const statusCounts = new Map();
  const monthlyCounts = new Map();
  const weeklyCounts = new Map();
  const dailyCounts = new Map();
  const hourCounts = new Map();
  const weekdayCounts = new Map(WEEKDAYS.map((day) => [day, 0]));
  const completed = appointments.filter((appointment) => appointment.status === "completed").length;
  const cancelled = appointments.filter((appointment) => appointment.status === "cancelled").length;
  const noShow = appointments.filter(isNoShowAppointment).length;

  appointments.forEach((appointment) => {
    const date = new Date(appointment.appointmentDate || appointment.createdAt);
    increment(statusCounts, humanizeLabel(appointment.status || "unknown"));
    increment(monthlyCounts, getMonthKey(appointment.appointmentDate || appointment.createdAt));
    increment(weeklyCounts, getWeekKey(appointment.appointmentDate || appointment.createdAt));
    increment(dailyCounts, getDateKey(appointment.appointmentDate || appointment.createdAt));
    increment(hourCounts, getHourKey(appointment.appointmentTime));
    if (!Number.isNaN(date.getTime())) increment(weekdayCounts, WEEKDAYS[parseDateKey(clinicDateKey(date)).getUTCDay()]);
  });

  const monthKeys = lastMonthKeys(12, dateRange?.endDate);
  const trendEnd = dateRange?.endDate || clinicDateKey();
  const trendStart = dateRange?.startDate && dateRange.startDate > addDays(trendEnd, -29)
    ? dateRange.startDate
    : addDays(trendEnd, -29);
  const trendDays = Math.round((parseDateKey(trendEnd) - parseDateKey(trendStart)) / 86400000) + 1;
  const dailyTrend = Array.from({ length: trendDays }, (_, index) => {
    const label = addDays(trendStart, index);
    return { label, value: dailyCounts.get(label) || 0 };
  });
  const weeklyTrend = [...weeklyCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([label, value]) => ({ label: `Week of ${label}`, value }));
  // Hours are listed in clock order (not by volume) so the chart reads as a day; unparseable times go last.
  const peakHours = [...hourCounts.entries()]
    .map(([label, value]) => ({ label, value, minutes: label === "Unspecified" ? Number.MAX_SAFE_INTEGER : toMinutes(label) }))
    .sort((a, b) => a.minutes - b.minutes)
    .map(({ label, value }) => ({ label, value }));

  return {
    statusDistribution: asSeries(statusCounts),
    dailyTrend,
    weeklyTrend,
    monthlyTrend: monthKeys.map((key) => ({ label: getMonthLabel(key), value: monthlyCounts.get(key) || 0 })),
    peakHours,
    busiestDays: asSeries(weekdayCounts, { labels: WEEKDAYS }),
    completionRate: appointments.length ? Math.round((completed / appointments.length) * 100) : 0,
    cancellationRate: appointments.length ? Math.round((cancelled / appointments.length) * 100) : 0,
    noShowRate: appointments.length ? Math.round((noShow / appointments.length) * 100) : 0,
  };
};

const buildPatientAnalytics = (patients, appointments, dateRange = null, patientHistory = new Map()) => {
  const ageCounts = new Map(["0-12", "13-19", "20-35", "36-50", "51-64", "65+", "Unknown"].map((label) => [label, 0]));
  const genderCounts = new Map();
  const registrationCounts = new Map();
  const appointmentCounts = new Map();
  const appointmentNames = new Map();
  const followUpCounts = new Map();
  const appointmentPatientKeys = new Set(appointments.map(appointmentPatientKey));
  const demographicPatients = dateRange
    ? patients.filter((patient) => appointmentPatientKeys.has(`patient:${patient._id}`)
      || appointmentPatientKeys.has(appointmentPatientKey({ email: patient.email, patientName: fullName(patient) })))
    : patients;

  demographicPatients.forEach((patient) => {
    increment(ageCounts, ageGroup(getAge(patient.dateOfBirth)));
    increment(genderCounts, patient.gender ? humanizeLabel(patient.gender) : "Not specified");
  });
  patients.forEach((patient) => {
    if (!dateRange || (patient.createdAt >= dateRange.currentStart && patient.createdAt <= dateRange.currentEnd)) {
      increment(registrationCounts, getMonthKey(patient.createdAt));
    }
  });

  appointments.forEach((appointment) => {
    const key = appointmentPatientKey(appointment);
    increment(appointmentCounts, key);
    if (!appointmentNames.has(key) && appointment.patientName) appointmentNames.set(key, appointment.patientName);
    if (isFollowUpAppointment(appointment)) increment(followUpCounts, key);
  });

  // A patient is "returning" when they had an appointment before the selected period (or, without a date
  // filter, more than one appointment overall). This uses the full appointment history, so a long-time
  // patient with a single visit inside a filtered range is not miscounted as new.
  let returningPatients = 0;
  appointmentCounts.forEach((countInRange, key) => {
    const history = patientHistory.get(key);
    const isReturning = dateRange
      ? Boolean(history?.firstDate && new Date(history.firstDate) < dateRange.currentStart)
      : (history?.count ?? countInRange) > 1;
    if (isReturning) returningPatients += 1;
  });
  const newPatients = Math.max(appointmentCounts.size - returningPatients, 0);
  const monthKeys = lastMonthKeys(12, dateRange?.endDate);

  return {
    newVsReturning: [
      { label: "New", value: newPatients },
      { label: "Returning", value: returningPatients },
    ],
    activePatients: demographicPatients.filter((patient) => patient.status === "active").length,
    ageDistribution: asSeries(ageCounts, { labels: ["0-12", "13-19", "20-35", "36-50", "51-64", "65+", "Unknown"] }),
    genderDistribution: asSeries(genderCounts),
    followUps: [...followUpCounts.values()].reduce((total, count) => total + count, 0),
    frequentPatients: [...appointmentCounts.entries()]
      .sort((a, b) => b[1] - a[1] || String(appointmentNames.get(a[0]) || "").localeCompare(String(appointmentNames.get(b[0]) || "")))
      .slice(0, 8)
      .map(([key, value]) => {
        const patientId = key.startsWith("patient:") ? key.slice("patient:".length) : "";
        const patient = patientId ? patients.find((item) => String(item._id) === patientId) : null;
        return { label: fullName(patient) || appointmentNames.get(key) || "Unknown patient", value };
      }),
    registrationTrend: monthKeys.map((key) => ({ label: getMonthLabel(key), value: registrationCounts.get(key) || 0 })),
  };
};

const buildTreatmentAnalytics = (records, appointments) => {
  const procedureCounts = new Map();
  let preventive = 0;
  let corrective = 0;

  // Only treatment records describe a performed procedure; private clinical notes are excluded.
  records
    .filter((record) => (record.recordType || "treatment_record") === "treatment_record")
    .forEach((record) => {
      const procedure = String(record.procedure || record.servicePerformed || record.treatment || record.diagnosis || "").trim();
      increment(procedureCounts, procedure ? normalizeService(procedure) : "Unspecified");
    });

  // Care type is based on treatments that were actually delivered (completed appointments).
  const completedList = appointments.filter((item) => item.status === "completed");
  completedList.forEach((appointment) => {
    const service = normalizeService(appointment.service);
    if (PREVENTIVE_SERVICES.has(service)) preventive += 1;
    else corrective += 1;
  });

  const completedAppointments = completedList.length;
  const cancelledAppointments = appointments.filter((item) => item.status === "cancelled").length;
  const now = new Date();
  // Follow-ups still scheduled in the future cannot have been complied with yet, so they are excluded
  // from the compliance denominator.
  const followUps = appointments.filter(isFollowUpAppointment);
  const dueFollowUps = followUps.filter((item) => !(SCHEDULED_STATUSES.has(item.status) && new Date(item.appointmentDate) > now));
  const completedFollowUps = dueFollowUps.filter((item) => item.status === "completed").length;

  return {
    mostCommonProcedures: asSeries(procedureCounts, { limit: 8 }),
    completionRate: appointments.length ? Math.round((completedAppointments / appointments.length) * 100) : 0,
    followUpCompliance: dueFollowUps.length ? Math.round((completedFollowUps / dueFollowUps.length) * 100) : 0,
    followUpTotals: { total: followUps.length, due: dueFollowUps.length, completed: completedFollowUps, upcoming: followUps.length - dueFollowUps.length },
    preventiveVsCorrective: [
      { label: "Preventive", value: preventive },
      { label: "Corrective", value: corrective },
    ],
    completedVsCancelled: [
      { label: "Completed", value: completedAppointments },
      { label: "Cancelled", value: cancelledAppointments },
    ],
  };
};

const buildAdminAnalytics = (patients, users, appointments, auditLogs, feedback) => {
  const accountCounts = new Map();
  const auditCounts = new Map();
  const activeStaff = users.filter((user) => user.role === "staff" && user.status === "active").length;
  const cancelled = appointments.filter((item) => item.status === "cancelled").length;
  const noShow = appointments.filter(isNoShowAppointment).length;
  const pendingAppointments = appointments.filter((item) => item.status === "pending");
  const approvedAppointments = appointments.filter((item) => ["confirmed", "completed"].includes(item.status));
  const estimatedApprovalHours = approvedAppointments.length && pendingAppointments.length
    ? 24
    : approvedAppointments.length
      ? 12
      : 0;

  users.forEach((user) => increment(accountCounts, getMonthKey(user.createdAt)));
  auditLogs.forEach((log) => increment(auditCounts, log.action || "unknown"));

  const monthKeys = lastMonthKeys();
  const averageFeedback = feedback.length
    ? Number((feedback.reduce((total, item) => total + Number(item.rating || 0), 0) / feedback.length).toFixed(1))
    : 0;

  return {
    accountGrowth: monthKeys.map((key) => ({ label: getMonthLabel(key), value: accountCounts.get(key) || 0 })),
    registrationTrend: buildPatientAnalytics(patients, appointments).registrationTrend,
    activeStaff,
    approvalTimeHours: estimatedApprovalHours,
    cancellationNoShowRate: appointments.length ? Math.round(((cancelled + noShow) / appointments.length) * 100) : 0,
    feedbackScore: averageFeedback,
    auditSummary: asSeries(auditCounts, { limit: 8 }),
  };
};

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const toMinutes = (value) => {
  const normalized = String(value || "").trim();
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2]);
    const period = meridiemMatch[3].toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const [hours = 0, minutes = 0] = normalized.split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
};

const getScheduledDateTime = (appointment) => {
  const value = new Date(appointment.appointmentDate);
  if (Number.isNaN(value.getTime())) return new Date(0);

  const minutes = toMinutes(appointment.appointmentTime);
  value.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return value;
};

const sanitizeAppointment = (appointment) => ({
  id: appointment._id,
  appointmentId: `APT-${String(appointment._id).slice(-6).toUpperCase()}`,
  patientName: appointment.patientName,
  contactNumber: appointment.contactNumber,
  email: appointment.email,
  service: appointment.service,
  appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.appointmentTime,
  dentistName: appointment.dentistName,
  reason: appointment.reason,
  notes: appointment.notes,
  status: appointment.status,
  createdAt: appointment.createdAt,
  timeline: appointment.timeline || [],
});

const sanitizePatient = (patient) => ({
  id: patient._id,
  patientId: patient.patientId,
  patientName: `${patient.firstName} ${patient.lastName}`.trim(),
  email: patient.email,
  contactNumber: patient.contactNumber,
  registrationStatus: patient.registrationStatus,
  status: patient.status,
  createdAt: patient.createdAt,
});

router.get(
  "/admin",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const clinicToday = clinicDateKey(now);
    const { start: todayStart, end: tomorrowStart } = storedAppointmentDayRange(clinicToday);
    const activityStart = clinicDayStart(clinicToday);
    const activityEnd = clinicDayEnd(clinicToday);

    const [
      totalPatients,
      totalDentists,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      upcomingAppointments,
      todaysSchedule,
      upcomingList,
      recentPatients,
      staffActivity,
      recentActivity,
      inactivePatients,
      pendingStaffRequests,
      mySchedule,
    ] = await Promise.all([
      Patient.countDocuments({}),
      User.countDocuments({ role: "admin", status: "active" }),
      Appointment.countDocuments({}),
      Appointment.countDocuments({ status: "completed" }),
      Appointment.countDocuments({ status: "cancelled" }),
      Appointment.countDocuments({
        $or: [
          { status: "no_show" },
          { notes: { $regex: /no[-\s]?show/i } },
        ],
      }),
      Appointment.countDocuments({
        appointmentDate: { $gte: todayStart },
        status: { $in: ["pending", "confirmed"] },
      }),
      Appointment.find({})
        .where("appointmentDate").gte(todayStart).lt(tomorrowStart)
        .where("status").ne("declined")
        .sort({ appointmentTime: 1, appointmentDate: 1 })
        .lean(),
      Appointment.find({
        appointmentDate: { $gte: tomorrowStart },
        status: { $in: ["pending", "confirmed", "checked_in", "in_consultation"] },
      })
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(5)
        .lean(),
      Patient.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      AuditLog.find({ action: { $regex: /^staff_/ } })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      AuditLog.find({
        createdAt: { $gte: activityStart, $lte: activityEnd },
        action: {
          $regex: /Appointment|Treatment Record|Patient|Staff|Login/i,
        },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Patient.countDocuments({ status: "inactive" }),
      User.countDocuments({ role: "staff", status: "inactive" }),
      Appointment.find({
        appointmentDate: { $gte: todayStart, $lt: tomorrowStart },
        dentistName: fullName(req.user),
        status: { $ne: "declined" },
      })
        .sort({ appointmentTime: 1 })
        .limit(8)
        .lean(),
    ]);
    const statusCounts = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "cancelled", "no_show", "rescheduled"].reduce((counts, status) => ({
      ...counts,
      [status]: todaysSchedule.filter((appointment) => appointment.status === status).length,
    }), {});
    const activeDentistsToday = new Set(todaysSchedule.map((appointment) => String(appointment.dentistName || "").trim()).filter(Boolean)).size;

    res.json({
      stats: {
        totalAppointments,
        todaysAppointments: todaysSchedule.length,
        upcomingAppointments,
        completedAppointments,
        pendingAppointments: statusCounts.pending,
        cancelledAppointments,
        noShowAppointments,
        totalPatients,
        totalDentists,
        activeDentistsToday,
        statusCounts,
      },
      todaysSchedule: todaysSchedule.map(sanitizeAppointment),
      upcomingAppointments: upcomingList.map(sanitizeAppointment),
      recentPatients: recentPatients.map(sanitizePatient),
      staffActivity,
      recentActivity,
      pendingActions: {
        pendingAppointments: statusCounts.pending,
        pendingStaffRequests,
        inactivePatients,
      },
      mySchedule: mySchedule.map(sanitizeAppointment),
    });
  }),
);

router.get(
  "/admin/analytics/service-comparison",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const window = getServiceComparisonWindow({
      period: req.query.period,
      value: req.query.value,
      compareValue: req.query.compareValue,
    });
    if (!window) return res.status(400).json({ message: "Choose two different current or past months or years." });

    const currentStart = storedAppointmentDayRange(window.currentStart).start;
    const previousEnd = storedAppointmentDayRange(window.previousEnd).start;
    const previousStart = storedAppointmentDayRange(window.previousStart).start;
    const currentEnd = storedAppointmentDayRange(window.currentEnd).start;
    const [appointments, clinicSettings] = await Promise.all([
      Appointment.find({ $or: [
        { appointmentDate: { $gte: currentStart, $lt: currentEnd } },
        { appointmentDate: { $gte: previousStart, $lt: previousEnd } },
      ] })
        .select("appointmentDate service status")
        .lean(),
      ClinicSettings.findOne({}).select("services").lean(),
    ]);
    const services = [
      ...OFFICIAL_SERVICES,
      ...(clinicSettings?.services || []).map((item) => item.serviceName),
    ].filter(Boolean).map(normalizeService);
    const comparison = buildServiceComparison({
      appointments: appointments.map((appointment) => ({
        ...appointment,
        service: appointment.service ? normalizeService(appointment.service) : "",
      })),
      services: [...new Set(services)],
      window,
    });
    const ai = await generateServiceComparisonInsight(comparison);
    res.json({
      ...comparison,
      recommendations: ai.recommendations,
      ai: { status: ai.status, insight: ai.insight, action: ai.action },
    });
  }),
);

router.get(
  "/admin/analytics/prediction",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const targetDate = String(req.query.date || "");
    const today = clinicDateKey();
    if (!parseDateKey(targetDate) || targetDate < today || targetDate > addDays(today, 30)) {
      return res.status(400).json({ message: "Choose a date within the next 30 days." });
    }

    const serviceFilter = String(req.query.service || "").trim();
    if (serviceFilter.length > 120) return res.status(400).json({ message: "Invalid service filter." });
    const service = serviceFilter ? normalizeService(serviceFilter) : "";
    const targetEndDate = addDays(targetDate, 6);

    const [appointments, clinicSettings, overlappingPromotions] = await Promise.all([
      Appointment.find({
        appointmentDate: { $gte: clinicDayStart(addDays(today, -84)), $lt: clinicDayStart(addDays(targetEndDate, 1)) },
      }).select("appointmentDate status service createdAt requestSubmittedAt").lean(),
      ClinicSettings.findOne({}).select("appointmentSettings.workingDays services").lean(),
      Promotion.find({
        status: "active",
        $and: [
          { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lt: clinicDayStart(addDays(targetEndDate, 1)) } }] },
          { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: clinicDayStart(targetDate) } }] },
        ],
      }).select("applicableServices serviceType").lean(),
    ]);
    const normalizedAppointments = appointments.map((appointment) => ({
      ...appointment,
      service: normalizeService(appointment.service),
    }));
    const activeConfiguredServices = (clinicSettings?.services || [])
      .filter((configuredService) => configuredService.status !== "inactive")
      .map((configuredService) => normalizeService(configuredService.serviceName))
      .filter(Boolean);
    const services = service
      ? [service]
      : activeConfiguredServices.length ? [...new Set(activeConfiguredServices)] : OFFICIAL_SERVICES;
    const workingDays = clinicSettings?.appointmentSettings?.workingDays;
    const forecastAppointments = service
      ? normalizedAppointments.filter((appointment) => appointment.service === service)
      : normalizedAppointments;
    const forecast = buildAppointmentForecast({
      targetDate,
      appointments: forecastAppointments,
      workingDays,
      today,
    });
    const serviceForecasts = buildServiceDemandForecasts({
      targetDate,
      appointments: normalizedAppointments,
      services,
      workingDays,
      today,
    });
    const blockedServices = new Set();
    let allServicesBlocked = false;
    overlappingPromotions.forEach((promotion) => {
      const promotionServices = promotion.applicableServices?.length
        ? promotion.applicableServices
        : [promotion.serviceType || "All Services"];
      promotionServices.forEach((promotionService) => {
        if (String(promotionService).trim().toLowerCase() === "all services") allServicesBlocked = true;
        else blockedServices.add(normalizeService(promotionService));
      });
    });
    const recommendationCandidates = buildPromotionRecommendations({
      serviceForecasts,
      blockedServices,
      allServicesBlocked,
    });
    const ai = await generateForecastInsight(forecast, service, recommendationCandidates);
    return res.json({
      ...forecast,
      service,
      ai: {
        status: ai.status,
        insight: ai.insight,
        action: ai.action,
      },
      recommendations: ai.recommendations,
      recommendationSource: ai.recommendationSource,
      serviceForecasts,
      excludedPromotionServices: allServicesBlocked ? ["All Services"] : [...blockedServices],
    });
  }),
);

router.get(
  "/admin/analytics",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const dateRange = getAnalyticsDateRange(req.query);
    if (dateRange?.error) return res.status(400).json({ message: dateRange.error });
    const appointmentQuery = getAnalyticsFilters(req.query, dateRange);
    const monthlyBaseQuery = getAnalyticsBaseFilters(req.query);
    const kpiComparisonRange = getKpiComparisonRange(dateRange);

    const [
      totalStaff,
      totalDentists,
      inventoryAlerts,
      totalTreatments,
      recentAppointments,
      staffActivity,
      appointments,
      monthlyAppointments,
      patients,
      dentalRecords,
      users,
      auditLogs,
      feedback,
      dentistOptions,
      serviceOptions,
      statusOptions,
      patientHistoryRows,
    ] = await Promise.all([
      User.countDocuments({ role: "staff", status: "active" }),
      User.countDocuments({ role: "admin", status: "active" }),
      Inventory.countDocuments({ status: { $in: ["low_stock", "out_of_stock"] } }),
      DentalRecord.countDocuments({}),
      Appointment.find({})
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(10)
        .lean(),
      AuditLog.find({ action: { $regex: /^staff_/ } }).sort({ createdAt: -1 }).limit(6).lean(),
      Appointment.find(appointmentQuery)
        .select("patient patientName email service servicePriceSnapshot serviceDurationSnapshot promotion promoCode promoTitle promoDiscountType promoDiscountValue originalPrice discountAmount finalPrice estimatedRevenueAmount appointmentDate appointmentTime dentistName reason notes status createdAt completedAt completedByEmail noShowAt noShowByEmail statusUpdatedAt statusUpdatedByEmail timeline.status")
        .lean(),
      Appointment.find({
        ...monthlyBaseQuery,
        appointmentDate: { $gte: kpiComparisonRange.previousStart, $lte: kpiComparisonRange.currentEnd },
      })
        .select("appointmentDate status notes createdAt patient email patientName")
        .lean(),
      Patient.find({})
        .select("firstName lastName email dateOfBirth gender registrationStatus status createdAt")
        .lean(),
      DentalRecord.find(dateRange ? { visitDate: { $gte: dateRange.currentStart, $lte: dateRange.currentEnd } } : {})
        .select("patient appointment patientName recordType visitDate diagnosis treatment servicePerformed procedure dentistName createdAt")
        .lean(),
      User.find({})
        .select("firstName lastName email role status accountStatus createdAt")
        .lean(),
      AuditLog.find({}).select("action entityType performedByEmail createdAt").lean(),
      Feedback.find({}).select("rating category status createdAt").lean(),
      Appointment.distinct("dentistName", { dentistName: { $nin: [null, ""] } }),
      Appointment.distinct("service", { service: { $nin: [null, ""] } }),
      Appointment.distinct("status"),
      // Full per-patient appointment history (ignores the date filter) so "new vs returning" is based on
      // whether a patient visited before the selected period, not only on appointments inside it.
      Appointment.find({})
        .select("patient email patientName appointmentDate")
        .lean(),
    ]);
    const patientHistory = new Map();
    patientHistoryRows.forEach((row) => {
      const key = appointmentPatientKey(row);
      const current = patientHistory.get(key) || { count: 0, firstDate: null };
      const date = new Date(row.appointmentDate);
      current.count += 1;
      if (!Number.isNaN(date.getTime()) && (!current.firstDate || date < current.firstDate)) current.firstDate = date;
      patientHistory.set(key, current);
    });

    const kpiStats = buildKpiStats(appointments, monthlyAppointments, kpiComparisonRange);
    const newPatients = countPatientsRegisteredInRange(patients, kpiComparisonRange.currentStart, kpiComparisonRange.currentEnd);
    const previousNewPatients = countPatientsRegisteredInRange(patients, kpiComparisonRange.previousStart, kpiComparisonRange.previousEnd);
    const completedAppointments = kpiStats.completedAppointments;
    const completedRevenueAppointments = appointments.filter((appointment) => appointment.status === "completed");
    const estimatedRevenue = completedRevenueAppointments.reduce((total, appointment) => total + getAppointmentRevenueEstimate(appointment), 0);
    const appointmentAnalytics = buildAppointmentAnalytics(appointments, dateRange);
    const serviceAnalytics = buildServiceAnalytics(appointments, dateRange);
    const patientAnalytics = buildPatientAnalytics(patients, appointments, dateRange, patientHistory);
    const treatmentAnalytics = buildTreatmentAnalytics(dentalRecords, appointments);
    const adminAnalytics = buildAdminAnalytics(patients, users, appointments, auditLogs, feedback);
    const promotionAnalytics = buildPromotionAnalytics(appointments);

    res.json({
      stats: {
        totalPatients: patients.length,
        totalStaff,
        totalDentists,
        totalServices: OFFICIAL_SERVICES.length,
        newPatients,
        totalAppointments: kpiStats.totalAppointments,
        currentPatients: kpiStats.currentPatients,
        completedAppointments,
        pendingAppointments: kpiStats.pendingAppointments,
        cancelledAppointments: kpiStats.cancelledAppointments,
        noShowAppointments: kpiStats.noShowAppointments,
        todaysAppointments: kpiStats.todaysAppointments,
        inventoryAlerts,
        totalTreatments,
        upcomingAppointments: kpiStats.upcomingAppointments,
        estimatedRevenue,
        monthlyChange: {
          ...kpiStats.monthlyChange,
          newPatients: calculateChange(newPatients, previousNewPatients),
        },
      },
      filters: {
        dentists: dentistOptions.filter(Boolean).sort(),
        services: [...new Set([...OFFICIAL_SERVICES, ...serviceOptions.filter(Boolean)])],
        statuses: statusOptions.filter(Boolean).sort(),
      },
      analytics: {
        services: serviceAnalytics,
        patients: patientAnalytics,
        appointments: appointmentAnalytics,
        treatments: treatmentAnalytics,
        revenue: {
          available: false,
          note: "No payment module exists yet. Revenue is estimated from completed appointments.",
          estimatedRevenue,
          byService: asSeries(completedRevenueAppointments.reduce((map, appointment) => {
            increment(map, normalizeService(appointment.service), getAppointmentRevenueEstimate(appointment));
            return map;
          }, new Map())),
          byMonth: appointmentAnalytics.monthlyTrend.map((item) => ({
            label: item.label,
            value: completedRevenueAppointments
              .filter((appointment) => getMonthLabel(getMonthKey(appointment.appointmentDate || appointment.createdAt)) === item.label)
              .reduce((total, appointment) => total + getAppointmentRevenueEstimate(appointment), 0),
          })),
          byPaymentMethod: [],
        },
        promotions: promotionAnalytics,
        admin: adminAnalytics,
        reports: {
          periods: ["daily", "weekly", "monthly", "quarterly", "yearly"],
          exports: ["pdf", "excel", "csv"],
        },
      },
      appointments: recentAppointments.map(sanitizeAppointment),
      staffActivity,
    });
  }),
);

router.get(
  "/staff",
  authenticate,
  authorize("staff"),
  asyncHandler(async (req, res) => {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const appointmentScope = {};

    const [todaysAppointments, upcomingAppointments, recentPatients, recentActivity] = await Promise.all([
      Appointment.find({
        ...appointmentScope,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: "declined" },
      })
        .sort({ appointmentTime: 1 })
        .lean(),
      Appointment.find({
        ...appointmentScope,
        appointmentDate: { $gt: todayEnd },
        status: { $in: ["pending", "confirmed"] },
      })
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(5),
      Patient.find({ createdAt: { $lte: now } })
        .sort({ createdAt: -1 })
        .limit(8),
      AuditLog.find({
        createdAt: { $gte: todayStart, $lte: todayEnd },
        action: { $regex: /Appointment confirmed|Appointment checked_in|Appointment in_consultation|Appointment completed|Appointment rescheduled|Appointment cancelled|Treatment Record/i },
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const statusCounts = ["pending", "confirmed", "checked_in", "in_consultation", "completed", "cancelled", "no_show"].reduce((counts, status) => ({
      ...counts,
      [status]: todaysAppointments.filter((appointment) => appointment.status === status).length,
    }), {});
    const activeQueueStatuses = new Set(["pending", "confirmed", "checked_in", "in_consultation", "completed", "cancelled", "no_show"]);
    const todaysQueue = todaysAppointments.filter((appointment) => activeQueueStatuses.has(appointment.status));
    const nextAppointment = todaysAppointments
      .filter((appointment) => ["pending", "confirmed", "checked_in", "in_consultation"].includes(appointment.status))
      .filter((appointment) => toMinutes(appointment.appointmentTime) >= currentMinutes || ["checked_in", "in_consultation"].includes(appointment.status))
      .sort((left, right) => toMinutes(left.appointmentTime) - toMinutes(right.appointmentTime))[0] || null;
    const waitingAppointments = todaysAppointments.filter((appointment) => appointment.status === "checked_in");
    const waitingMinutes = waitingAppointments.map((appointment) => {
      const timeline = appointment.timeline || [];
      const checkInEvent = [...timeline].reverse().find((item) => item.status === "checked_in");
      const checkInAt = new Date(checkInEvent?.recordedAt || appointment.statusUpdatedAt || appointment.updatedAt || now);
      return Number.isNaN(checkInAt.getTime()) ? 0 : Math.max(Math.round((now - checkInAt) / 60000), 0);
    });
    const averageWaitingTime = waitingMinutes.length ? Math.round(waitingMinutes.reduce((total, minutes) => total + minutes, 0) / waitingMinutes.length) : 0;

    const stats = {
      todaysAppointments: todaysAppointments.length,
      checkedInPatients: statusCounts.checked_in,
      patientsInConsultation: statusCounts.in_consultation,
      completedToday: statusCounts.completed,
      cancelledToday: statusCounts.cancelled,
      statusCounts,
      waitingPatients: waitingAppointments.length,
      averageWaitingTime,
    };

    res.json({
      stats,
      todaysQueue: todaysQueue.map(sanitizeAppointment),
      todaysAppointments: todaysAppointments.map(sanitizeAppointment),
      upcomingAppointments: upcomingAppointments.map(sanitizeAppointment),
      nextAppointment: nextAppointment ? sanitizeAppointment(nextAppointment) : null,
      recentPatients: recentPatients.map(sanitizePatient),
      recentActivity,
    });
  }),
);

module.exports = router;
// Exposed for unit tests so the pure analytics calculations can be verified without a database.
module.exports.analyticsBuilders = {
  appointmentPatientKey,
  buildAppointmentAnalytics,
  buildKpiStats,
  buildPatientAnalytics,
  buildServiceAnalytics,
  buildTreatmentAnalytics,
  calculateChange,
  isFollowUpAppointment,
};
