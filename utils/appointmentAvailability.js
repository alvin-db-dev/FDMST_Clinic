const Appointment = require("../models/Appointment");
const ClinicSettings = require("../models/ClinicSettings");
const User = require("../models/User");
const { addDays: addDateKeyDays, clinicDateKey, isPastClinicSlot, requestedDateKey } = require("./clinicDate");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ADVANCE_BOOKING_DAYS = 14;
const BLOCKING_APPOINTMENT_STATUSES = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "rescheduled"];
const DEFAULT_APPOINTMENT_SETTINGS = {
  openingTime: "09:00",
  closingTime: "17:00",
  appointmentDuration: 30,
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  maxAppointmentsPerDay: 20,
  bufferTime: 10,
  allowWeekendAppointments: true,
  allowOnlineBooking: true,
};

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

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

const parseAppointmentDate = (value) => {
  if (!value) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
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

const formatTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
};

const getCurrentSettings = async () => {
  const settings = await ClinicSettings.findOne({}).sort({ updatedAt: -1 }).lean();
  return {
    ...settings,
    appointmentSettings: {
      ...DEFAULT_APPOINTMENT_SETTINGS,
      ...(settings?.appointmentSettings || {}),
    },
  };
};

const generateTimeSlots = (appointmentSettings) => {
  const opening = toMinutes(appointmentSettings.openingTime);
  const closing = toMinutes(appointmentSettings.closingTime);
  const duration = Math.max(Number(appointmentSettings.appointmentDuration) || 30, 5);
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0);
  const step = duration + buffer;
  const slots = new Set();

  if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing <= opening || step <= 0) {
    return slots;
  }

  for (let current = opening; current + duration <= closing && slots.size < 96; current += step) {
    slots.add(current);
  }

  return slots;
};

const getServiceDuration = (service, appointmentSettings) =>
  Math.max(Number(service?.duration) || Number(appointmentSettings.appointmentDuration) || DEFAULT_APPOINTMENT_SETTINGS.appointmentDuration, 5);

const getSlotEndMinutes = (startMinutes, duration, buffer = 0) =>
  startMinutes + Math.max(Number(duration) || 0, 0) + Math.max(Number(buffer) || 0, 0);

const appointmentBlocksSlot = (appointment, slotStart, slotEnd, fallbackDuration, buffer) => {
  const appointmentStart = toMinutes(appointment.appointmentTime);
  const appointmentDuration = Math.max(Number(appointment.serviceDurationSnapshot) || fallbackDuration, 5);
  const appointmentEnd = getSlotEndMinutes(appointmentStart, appointmentDuration, buffer);
  return slotStart < appointmentEnd && slotEnd > appointmentStart;
};

const isSlotAvailable = ({ slotStart, parsedDate, existingBookings, serviceDuration, buffer, closing }) => {
  const slotEnd = getSlotEndMinutes(slotStart, serviceDuration, buffer);
  if (slotEnd > closing) return false;

  // Uses the clinic's clock (Asia/Manila), not the server's, so past slots are rejected wherever the server runs.
  if (isPastClinicSlot(requestedDateKey(parsedDate), slotStart)) return false;

  return !existingBookings.some((appointment) =>
    appointmentBlocksSlot(appointment, slotStart, slotEnd, serviceDuration, buffer)
  );
};

const findAvailableSlot = ({ requestedTime, parsedDate, availableSlots, existingBookings, serviceDuration, buffer, closing }) => {
  const sortedSlots = [...availableSlots].sort((left, right) => left - right);
  const slotIsOpen = (slotStart) => isSlotAvailable({
    slotStart,
    parsedDate,
    existingBookings,
    serviceDuration,
    buffer,
    closing,
  });

  return sortedSlots.find((slotStart) => slotStart > requestedTime && slotIsOpen(slotStart))
    ?? sortedSlots.find(slotIsOpen)
    ?? null;
};

const resolveAlternativeSlot = ({ requestedTimeMinutes, parsedDate, availableSlots, existingBookings, serviceDuration, buffer, closing }) => {
  const alternateTime = findAvailableSlot({
    requestedTime: requestedTimeMinutes,
    parsedDate,
    availableSlots,
    existingBookings,
    serviceDuration,
    buffer,
    closing,
  });

  if (alternateTime === null) {
    throw createAvailabilityError("No available appointment times remain for this date. Please choose another date.", "appointmentTime", 409);
  }

  return alternateTime;
};

const isAllowedAppointmentDate = (date, appointmentSettings) => {
  const dayName = DAY_NAMES[date.getDay()];
  const isWeekend = dayName === "Saturday" || dayName === "Sunday";
  const workingDays = appointmentSettings.workingDays?.length
    ? appointmentSettings.workingDays
    : DEFAULT_APPOINTMENT_SETTINGS.workingDays;

  if (isWeekend && appointmentSettings.allowWeekendAppointments === false) {
    return false;
  }

  return workingDays.includes(dayName);
};

const getDentistPersonalSchedule = async (dentistName) => {
  if (!dentistName) return null;
  const normalized = String(dentistName).trim().toLowerCase();
  if (!normalized || normalized === "any available dentist") return null;

  const admin = await User.findOne({ role: "admin", status: "active" }).select("firstName lastName workPreferences").lean();
  if (fullName(admin).toLowerCase() !== normalized) return null;
  const schedule = admin?.workPreferences?.schedule;

  if (!schedule?.workingDays?.length || !schedule.startTime || !schedule.endTime) return null;

  return {
    workingDays: schedule.workingDays,
    openingTime: schedule.startTime,
    closingTime: schedule.endTime,
  };
};

const createAvailabilityError = (message, field = "appointmentTime", status = 400) => {
  const error = new Error(message);
  error.status = status;
  error.errors = { [field]: message };
  return error;
};

const validateAppointmentSlot = async ({
  appointmentDate,
  appointmentTime,
  serviceName,
  dentistName,
  enforceOnlineBooking = true,
  autoSelectAlternative = false,
  excludeAppointmentId = null,
}) => {
  const parsedDate = parseAppointmentDate(appointmentDate);
  const settings = await getCurrentSettings();

  if (!parsedDate) {
    throw createAvailabilityError("Preferred date is invalid.", "appointmentDate");
  }

  const selectedDateKey = requestedDateKey(parsedDate);
  const todayKey = clinicDateKey();
  if (selectedDateKey < todayKey) {
    throw createAvailabilityError("Selected date is unavailable. Please choose a future date.", "appointmentDate");
  }

  if (selectedDateKey > addDateKeyDays(todayKey, ADVANCE_BOOKING_DAYS)) {
    throw createAvailabilityError("Online booking is available up to 2 weeks in advance. Please choose an earlier date.", "appointmentDate");
  }

  if (enforceOnlineBooking && settings.appointmentSettings.allowOnlineBooking === false) {
    throw createAvailabilityError("Online booking is currently unavailable. Please contact the clinic to schedule an appointment.", "appointmentDate", 403);
  }

  const personalSchedule = await getDentistPersonalSchedule(dentistName);
  const appointmentSettings = {
    ...settings.appointmentSettings,
    ...(personalSchedule || {}),
  };

  if (!isAllowedAppointmentDate(parsedDate, appointmentSettings)) {
    throw createAvailabilityError("The selected date is outside the clinic appointment schedule.", "appointmentDate");
  }

  const selectedServiceName = String(serviceName || "").trim();
  const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
  const selectedService = activeServices.find((item) => item.serviceName === selectedServiceName);

  if (!selectedService) {
    throw createAvailabilityError("The selected service is no longer available for new appointments.", "service");
  }

  const requestedTimeMinutes = toMinutes(appointmentTime);
  const serviceDuration = getServiceDuration(selectedService, appointmentSettings);
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0);
  const closing = toMinutes(appointmentSettings.closingTime);
  const opening = toMinutes(appointmentSettings.openingTime);
  const availableSlots = generateTimeSlots(appointmentSettings);
  const selectedSlotEnd = getSlotEndMinutes(requestedTimeMinutes, serviceDuration, buffer);
  let shouldResolveAlternative = false;

  if (!availableSlots.has(requestedTimeMinutes) || selectedSlotEnd > closing) {
    if (!autoSelectAlternative || requestedTimeMinutes >= closing) {
      throw createAvailabilityError("The selected time is outside the clinic appointment schedule.");
    }
    shouldResolveAlternative = true;
  }

  if (isPastClinicSlot(selectedDateKey, requestedTimeMinutes)) {
    if (!autoSelectAlternative) {
      throw createAvailabilityError("This time slot has already passed. Please select another available time.");
    }
    shouldResolveAlternative = true;
  }

  const dayRange = {
    $gte: startOfDay(parsedDate),
    $lte: endOfDay(parsedDate),
  };

  const appointmentsForDay = await Appointment.countDocuments({
    appointmentDate: dayRange,
    status: { $in: BLOCKING_APPOINTMENT_STATUSES },
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
  });

  if (appointmentsForDay >= Number(appointmentSettings.maxAppointmentsPerDay || 20)) {
    throw createAvailabilityError("The clinic has reached the maximum number of appointments for this date.", "appointmentDate", 409);
  }

  const existingBookings = await Appointment.find({
    appointmentDate: dayRange,
    status: { $in: BLOCKING_APPOINTMENT_STATUSES },
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
  })
    .select("appointmentTime dentistName status serviceDurationSnapshot")
    .lean();
  const existingBooking = existingBookings.find((appointment) =>
    appointmentBlocksSlot(appointment, requestedTimeMinutes, selectedSlotEnd, serviceDuration, buffer)
  );

  let resolvedTimeMinutes = requestedTimeMinutes;
  let autoAdjusted = false;

  if (shouldResolveAlternative) {
    resolvedTimeMinutes = resolveAlternativeSlot({
      requestedTimeMinutes: Math.max(requestedTimeMinutes, opening - 1),
      parsedDate,
      availableSlots,
      existingBookings,
      serviceDuration,
      buffer,
      closing,
    });
    autoAdjusted = true;
  } else if (existingBooking) {
    if (!autoSelectAlternative) {
      throw createAvailabilityError("This time slot is already booked. Please choose another available time.", "appointmentTime", 409);
    }

    resolvedTimeMinutes = resolveAlternativeSlot({
      requestedTimeMinutes,
      parsedDate,
      availableSlots,
      existingBookings,
      serviceDuration,
      buffer,
      closing,
    });
    autoAdjusted = true;
  }

  return {
    parsedDate,
    selectedService,
    appointmentSettings,
    serviceDuration,
    appointmentTime: formatTime(resolvedTimeMinutes),
    requestedAppointmentTime: formatTime(requestedTimeMinutes),
    autoAdjusted,
  };
};

module.exports = {
  validateAppointmentSlot,
};
