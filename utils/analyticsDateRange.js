const { addDays, clinicDateKey, clinicDayEnd, clinicDayStart, parseDateKey } = require("./clinicDate");

const shiftMonth = (monthStartKey, months) => {
  const date = parseDateKey(monthStartKey);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const getAnalyticsDateRange = (query = {}) => {
  if (!query.startDate && !query.endDate) return null;
  const startDate = query.startDate || query.endDate;
  const endDate = query.endDate || query.startDate;
  if (typeof startDate !== "string" || typeof endDate !== "string" || !parseDateKey(startDate) || !parseDateKey(endDate) || endDate < startDate) {
    return { error: "Choose a valid date range with the start date before the end date." };
  }
  return { startDate, endDate, currentStart: clinicDayStart(startDate), currentEnd: clinicDayEnd(endDate) };
};

const getKpiComparisonRange = (dateRange, today = clinicDateKey()) => {
  if (dateRange) {
    const { startDate, endDate, currentStart, currentEnd } = dateRange;
    const periodLengthMs = currentEnd.getTime() - currentStart.getTime() + 1;
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodLengthMs + 1);
    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      focusStart: clinicDayStart(endDate),
      focusEnd: clinicDayEnd(endDate),
      previousFocusStart: clinicDayStart(addDays(startDate, -1)),
      previousFocusEnd: clinicDayEnd(addDays(startDate, -1)),
    };
  }

  const currentMonth = `${today.slice(0, 7)}-01`;
  const previousMonth = shiftMonth(currentMonth, -1);
  const nextMonth = shiftMonth(currentMonth, 1);
  const previousMonthLastDay = Number(addDays(currentMonth, -1).slice(-2));
  const previousFocusDate = `${previousMonth.slice(0, 7)}-${String(Math.min(Number(today.slice(-2)), previousMonthLastDay)).padStart(2, "0")}`;
  return {
    currentStart: clinicDayStart(currentMonth),
    currentEnd: clinicDayEnd(addDays(nextMonth, -1)),
    previousStart: clinicDayStart(previousMonth),
    previousEnd: clinicDayEnd(addDays(currentMonth, -1)),
    focusStart: clinicDayStart(today),
    focusEnd: clinicDayEnd(today),
    previousFocusStart: clinicDayStart(previousFocusDate),
    previousFocusEnd: clinicDayEnd(previousFocusDate),
  };
};

module.exports = { getAnalyticsDateRange, getKpiComparisonRange };
