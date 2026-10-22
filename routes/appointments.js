const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const ClinicSettings = require("../models/ClinicSettings");
const DentalRecord = require("../models/DentalRecord");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Promotion = require("../models/Promotion");
const User = require("../models/User");
const { sendMail } = require("../services/mailService");
const asyncHandler = require("../utils/asyncHandler");
const { validateAppointmentSlot } = require("../utils/appointmentAvailability");
const { calculatePromotionForServices, promotionAppliesToService } = require("../utils/appointmentPromotion");
const { addDays: addDateKeyDays, clinicDateKey, isPastClinicSlot, requestedDateKey, storedAppointmentDayRange } = require("../utils/clinicDate");
const { authenticate, authorize } = require("../middleware/auth");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
const ADVANCE_BOOKING_DAYS = 14;
const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "rescheduled"];
const BLOCKING_APPOINTMENT_STATUSES = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "rescheduled"];
const DUPLICATE_ACTIVE_STATUSES = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation"];
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

const uniqueContactEmails = (...emails) => [...new Set(
  emails
    .flat()
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean),
)];

const normalizeServiceNames = (values) => [...new Set(
  (Array.isArray(values) ? values : [values])
    .map((name) => String(name || "").trim())
    .filter(Boolean),
)].sort((left, right) => left.localeCompare(right));

const sendPatientContactMail = async ({ patient, fallbackEmail, subject, message, html }) => {
  const recipients = uniqueContactEmails(patient?.email, patient?.guardianEmail, fallbackEmail);
  if (!recipients.length) return;

  await Promise.allSettled(recipients.map((to) => sendMail({
    to,
    subject,
    message,
    html,
  })));
};

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const parseAppointmentDate = (value) => {
  if (!value) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const addDays = (date, days) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
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

const formatTime = (minutes, timeFormat = "12") => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (timeFormat === "24") {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
};

const getScheduledDateTime = (appointment) => {
  const date = new Date(appointment.appointmentDate);
  if (Number.isNaN(date.getTime())) return new Date(0);

  const minutes = toMinutes(appointment.appointmentTime);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const compareAppointmentsBySchedule = (left, right) => {
  const leftTime = getScheduledDateTime(left).getTime();
  const rightTime = getScheduledDateTime(right).getTime();
  return leftTime - rightTime;
};

const compareAppointmentsByScheduleDesc = (left, right) =>
  compareAppointmentsBySchedule(right, left);

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
const formatClinicDentistName = (value) => {
  const name = String(value || "").trim();
  if (!name) return "Flores Dizon";
  if (/^flores[-\s]+dizon\s+admin$/i.test(name)) return "Flores Dizon";
  return name.replace(/-/g, " ").trim() || "Flores Dizon";
};
const getClinicDentist = async () => User.findOne({ role: "admin", status: "active" })
  .sort({ createdAt: 1 })
  .select("firstName lastName email role profilePhoto specialization workPreferences")
  .lean();
const getClinicDentistName = async () => {
  const admin = await getClinicDentist();
  return formatClinicDentistName(fullName(admin));
};

const verifyPatientAfterCompletedAppointment = async (appointment, user) => {
  const filters = [];

  if (appointment.patient && mongoose.Types.ObjectId.isValid(String(appointment.patient))) {
    filters.push({ _id: appointment.patient });
  }

  if (appointment.email) {
    filters.push({ email: String(appointment.email).trim().toLowerCase() });
  }

  if (!filters.length) return null;

  const patient = await Patient.findOne({ $or: filters });
  if (!patient || patient.status === "inactive" || patient.registrationStatus === "verified") return patient;

  const now = new Date();
  patient.registrationStatus = "verified";
  patient.verifiedAt = now;
  patient.verificationHistory = [
    ...(patient.verificationHistory || []),
    {
      status: "verified",
      appointment: appointment._id,
      changedBy: user.id,
      changedByEmail: user.email,
      note: "Automatically verified after the patient's first completed appointment.",
      changedAt: now,
    },
  ];

  await patient.save();

  if (patient.userId) {
    await User.findByIdAndUpdate(patient.userId, { accountStatus: "verified_patient" });
  }

  await AuditLog.create({
    action: "Patient Verified",
    entityType: "Patient",
    entityId: patient._id,
    performedBy: user.id,
    performedByEmail: user.email,
    metadata: {
      patientId: patient.patientId,
      appointmentId: appointment._id,
      verifiedAt: now,
    },
  });

  return patient;
};

const createAutomaticTreatmentRecord = async (appointment, user) => {
  const existing = await DentalRecord.findOne({
    appointment: appointment._id,
    $or: [
      { recordType: "treatment_record" },
      {
        recordType: { $exists: false },
        $and: [
          {
            $or: [
              { diagnosis: { $nin: [null, ""] } },
              { treatment: { $nin: [null, ""] } },
              { treatmentPerformed: { $nin: [null, ""] } },
              { materialsUsed: { $nin: [null, ""] } },
              { notes: { $nin: [null, ""] } },
            ],
          },
          {
            $nor: [
              { "clinicalNotes.observation": { $nin: [null, ""] } },
              { "clinicalNotes.assessment": { $nin: [null, ""] } },
              { "clinicalNotes.recommendations": { $nin: [null, ""] } },
              { "clinicalNotes.additionalNotes": { $nin: [null, ""] } },
            ],
          },
        ],
      },
    ],
  });

  if (existing) {
    if (!existing.recordType) {
      existing.recordType = "treatment_record";
      await existing.save();
    }
    return { record: existing, created: false };
  }

  const provider = fullName(user) || appointment.dentistName || "Provider";
  const serviceName = appointment.service || "Dental Treatment";
  const completedAt = appointment.completedAt || new Date();
  const originalPrice = Number.isFinite(Number(appointment.originalPrice))
    ? Number(appointment.originalPrice)
    : Number.isFinite(Number(appointment.servicePriceSnapshot))
      ? Number(appointment.servicePriceSnapshot)
      : Number.isFinite(Number(appointment.finalPrice))
        ? Number(appointment.finalPrice)
        : 0;
  const discountAmount = Number.isFinite(Number(appointment.discountAmount)) ? Number(appointment.discountAmount) : 0;
  const finalPrice = Number.isFinite(Number(appointment.finalPrice))
    ? Number(appointment.finalPrice)
    : Math.max(originalPrice - discountAmount, 0);

  try {
    const record = await DentalRecord.create({
      recordType: "treatment_record",
      patient: appointment.patient,
      appointment: appointment._id,
      patientName: appointment.patientName,
      visitDate: completedAt,
      servicePerformed: serviceName,
      procedure: serviceName,
      treatment: serviceName,
      treatmentPerformed: "",
      treatmentStatus: "completed",
      dentistName: appointment.dentistName || provider,
      createdBy: user.id,
      createdByName: provider,
      createdByEmail: user.email,
      notes: "",
      appointmentSnapshot: {
        appointmentId: `APT-${String(appointment._id).slice(-6).toUpperCase()}`,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        completedAt,
        estimatedDuration: appointment.serviceDurationSnapshot,
        originalPrice,
        discountAmount,
        finalPrice,
        promoCode: appointment.promoCode,
        promoTitle: appointment.promoTitle,
        promoDiscountType: appointment.promoDiscountType,
        promoDiscountValue: appointment.promoDiscountValue,
      },
    });

    await AuditLog.create({
      action: "Treatment Record Automatically Created",
      entityType: "Treatment Records",
      entityId: record._id,
      performedBy: user.id,
      performedByEmail: user.email,
      metadata: {
        appointmentId: appointment._id,
        patient: appointment.patient,
        patientName: appointment.patientName,
      },
    });

    return { record, created: true };
  } catch (error) {
    if (error?.code === 11000) {
      const record = await DentalRecord.findOne({
        appointment: appointment._id,
        recordType: "treatment_record",
      });
      if (record) return { record, created: false };
    }
    throw error;
  }
};

const isPromotionAvailableByDate = (promotion, now = new Date()) => {
  if (!promotion || promotion.status !== "active") return false;
  if (promotion.startDate && startOfDay(promotion.startDate) > now) return false;
  if (promotion.endDate && endOfDay(promotion.endDate) < now) return false;
  return true;
};

const resolvePromotionDiscount = (promotion) => {
  const currentType = promotion.discountType === "percentage" ? "percentage" : "fixed";
  const currentValue = Number(promotion.discountValue);

  if (Number.isFinite(currentValue) && currentValue > 0) {
    return {
      discountType: currentType,
      discountValue: currentType === "percentage" ? Math.min(currentValue, 100) : currentValue,
    };
  }

  const label = String(promotion.discountLabel || "").trim();
  const percentageMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentageMatch) {
    const value = Number(percentageMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "percentage", discountValue: Math.min(value, 100) };
    }
  }

  const amountMatch = label.replace(/,/g, "").match(/(?:₱|PHP)?\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    const value = Number(amountMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "fixed", discountValue: value };
    }
  }

  return { discountType: currentType, discountValue: 0 };
};

const validatePromotionForBooking = async ({ patientId, services, serviceName, servicePrice, promoCode, autoApply = false }) => {
  if (!patientId) {
    return {
      valid: false,
      message: "Patient profile is required before applying a promo code.",
    };
  }

  const selectedServices = Array.isArray(services) && services.length
    ? services
    : [{ serviceName, price: servicePrice }];
  const now = new Date();
  const baseQuery = {
    status: "active",
    $or: [
      { startDate: { $exists: false } },
      { startDate: null },
      { startDate: { $lte: now } },
    ],
  };

  const query = promoCode
    ? { ...baseQuery, promoCode: String(promoCode).trim().toUpperCase() }
    : baseQuery;

  const candidates = await Promotion.find(query).sort({ discountValue: -1, endDate: 1, createdAt: -1 });
  const availablePromotion = candidates.find((item) => isPromotionAvailableByDate(item, now));
  const promotion = candidates.find((item) =>
    isPromotionAvailableByDate(item, now)
    && selectedServices.some((service) => promotionAppliesToService(item, service.serviceName))
  );

  if (!promotion) {
    if (availablePromotion && promoCode) {
      return {
        valid: false,
        notApplicable: true,
        message: "This promo code does not apply to any of the selected services.",
      };
    }
    return {
      valid: false,
      message: promoCode
        ? "Promo code is invalid, expired, or inactive."
        : "No active promotion is available for these services.",
    };
  }

  const resolvedDiscount = resolvePromotionDiscount(promotion);

  if (!resolvedDiscount.discountValue) {
    return {
      valid: false,
      message: "This promotion does not have a valid discount amount configured.",
      promotion,
    };
  }

  const existingRedemption = await Appointment.findOne({
    patient: patientId,
    promotion: promotion._id,
  }).select("_id");

  if (existingRedemption) {
    return {
      valid: false,
      message: "This promo code has already been redeemed on your account.",
      promotion,
    };
  }

  if (promotion.maxRedemptions) {
    const redemptionCount = await Appointment.countDocuments({ promotion: promotion._id });
    if (redemptionCount >= promotion.maxRedemptions) {
      return {
        valid: false,
        message: "This promo code has reached its redemption limit.",
        promotion,
      };
    }
  }

  const price = calculatePromotionForServices(
    promotion.toObject?.() || promotion,
    selectedServices,
    resolvedDiscount,
  );
  return {
    valid: true,
    autoApplied: autoApply,
    promotion,
    discountType: resolvedDiscount.discountType,
    discountValue: resolvedDiscount.discountValue,
    ...price,
    message: autoApply ? "Promotion applied automatically." : "Promo code applied.",
  };
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

const getAvailableSlotMinutes = ({ appointmentSettings, service, bookedAppointments = [], selectedDate, now = new Date() }) => {
  const duration = getServiceDuration(service, appointmentSettings);
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0);
  const closing = toMinutes(appointmentSettings.closingTime);
  const slots = [...generateTimeSlots(appointmentSettings)];
  const selectedDateKey = selectedDate ? requestedDateKey(selectedDate) : null;

  return slots.filter((slotStart) => {
    const slotEnd = getSlotEndMinutes(slotStart, duration, buffer);
    if (slotEnd > closing) return false;

    // Compare against the clinic's clock (Asia/Manila), not the server's time zone.
    if (selectedDateKey && isPastClinicSlot(selectedDateKey, slotStart, now)) return false;

    return !bookedAppointments.some((appointment) =>
      appointmentBlocksSlot(appointment, slotStart, slotEnd, duration, buffer)
    );
  });
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

  const admin = await getClinicDentist();
  if (fullName(admin).toLowerCase() !== normalized) return null;
  const schedule = admin?.workPreferences?.schedule;

  if (!schedule?.workingDays?.length || !schedule.startTime || !schedule.endTime) return null;

  return {
    workingDays: schedule.workingDays,
    openingTime: schedule.startTime,
    closingTime: schedule.endTime,
  };
};

const notifyAdminsOfNewAppointment = async (appointment, settings) => {
  if (settings?.notifications?.newAppointmentAlertForAdmin === false) return;

  const admins = await User.find({ role: "admin", status: "active" }).select("_id");

  if (!admins.length) return;

  await Notification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      title: "New appointment request",
      message: `${appointment.patientName} requested ${appointment.service} on ${appointment.appointmentDate.toLocaleDateString()} at ${appointment.appointmentTime}.`,
      type: "appointment",
    })),
  );
};

const notifyPatientOfStatus = async (appointment, settings) => {
  const shouldNotify =
    ["completed", "no_show"].includes(appointment.status) ||
    (appointment.status === "confirmed" && settings?.notifications?.appointmentConfirmationEmail !== false) ||
    (["cancelled", "declined"].includes(appointment.status) && settings?.notifications?.appointmentCancellationNotification !== false);

  if (!shouldNotify) return;

  const patient = appointment.patient
    ? await Patient.findById(appointment.patient).select("userId email guardianEmail")
    : await Patient.findOne({ email: appointment.email }).select("userId email guardianEmail");

  if (!patient?.userId) return;

  const title = appointment.status === "confirmed"
    ? "Appointment confirmed"
    : appointment.status === "declined"
      ? "Appointment declined"
      : appointment.status === "completed"
        ? "Appointment completed"
        : appointment.status === "no_show"
          ? "Appointment marked as no-show"
          : "Appointment cancelled";
  const message =
    appointment.status === "confirmed"
      ? `Your ${appointment.service} appointment is confirmed for ${appointment.appointmentTime}.`
      : appointment.status === "completed"
        ? `Your ${appointment.service} treatment has been completed. Your treatment record is now available in My Records.`
        : appointment.status === "no_show"
          ? `Your ${appointment.service} appointment has been marked as no-show. Please contact the clinic if you need to reschedule.`
          : `Your ${appointment.service} appointment has been ${appointment.status === "declined" ? "declined" : "cancelled"}.${appointment.declineReason ? ` Reason: ${appointment.declineReason}` : " Please contact the clinic for assistance."}`;

  await Notification.create({
    user: patient.userId,
    patient: patient._id,
    title,
    message,
    type: "appointment",
    metadata: {
      appointmentId: appointment._id,
      event: appointment.status === "no_show" ? "appointment_no_show" : appointment.status === "declined" ? "appointment_declined" : `appointment_${appointment.status}`,
      declineReason: appointment.declineReason,
    },
  });

  sendPatientContactMail({
      patient,
      fallbackEmail: appointment.email,
      subject: `${title} - Flores-Dizon Dental Clinic`,
      message,
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="color:#082f49;">${title}</h2>
          <p>${message}</p>
          <p><strong>Service:</strong> ${appointment.service}</p>
          <p><strong>Date:</strong> ${new Date(appointment.appointmentDate).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${appointment.appointmentTime}</p>
        </div>
      `,
    }).catch(() => {});
};

const getDisplayAppointmentStatus = (appointment) => (
  appointment.status === "declined" && appointment.autoDeclinedAt ? "cancelled" : appointment.status
);

const sanitizeAppointment = (appointment) => ({
  id: appointment._id,
  appointmentId: `APT-${String(appointment._id).slice(-6).toUpperCase()}`,
  patient: appointment.patient,
  patientSnapshot: appointment.patient && typeof appointment.patient === "object"
    ? {
        id: appointment.patient._id,
        patientId: appointment.patient.patientId,
        dateOfBirth: appointment.patient.dateOfBirth,
        gender: appointment.patient.gender,
        allergies: appointment.patient.allergies || [],
        medicalConditions: appointment.patient.medicalConditions || appointment.patient.medicalHistory || "",
      }
    : null,
  patientName: appointment.patientName,
  contactNumber: appointment.contactNumber,
  email: appointment.email,
  service: appointment.service,
  serviceRef: appointment.serviceRef,
  serviceItems: appointment.serviceItems,
  servicePriceSnapshot: appointment.servicePriceSnapshot,
  serviceDurationSnapshot: appointment.serviceDurationSnapshot,
  promotion: appointment.promotion,
  promoCode: appointment.promoCode,
  promoTitle: appointment.promoTitle,
  promoDiscountType: appointment.promoDiscountType,
  promoDiscountValue: appointment.promoDiscountValue,
  originalPrice: appointment.originalPrice,
  discountAmount: appointment.discountAmount,
  finalPrice: appointment.finalPrice,
  appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.appointmentTime,
  dentistName: appointment.dentistName,
  reason: appointment.reason,
  notes: appointment.notes,
  timeline: appointment.timeline || [],
  declineReason: appointment.declineReason,
  requestSubmittedAt: appointment.requestSubmittedAt || appointment.createdAt,
  autoDeclineWarningSentAt: appointment.autoDeclineWarningSentAt,
  autoDeclinedAt: appointment.autoDeclinedAt,
  completedAt: appointment.completedAt,
  completedBy: appointment.completedBy,
  completedByEmail: appointment.completedByEmail,
  noShowAt: appointment.noShowAt,
  noShowBy: appointment.noShowBy,
  noShowByEmail: appointment.noShowByEmail,
  statusUpdatedAt: appointment.statusUpdatedAt,
  statusUpdatedBy: appointment.statusUpdatedBy,
  statusUpdatedByEmail: appointment.statusUpdatedByEmail,
  estimatedRevenueAmount: appointment.estimatedRevenueAmount,
  status: getDisplayAppointmentStatus(appointment),
  clinicalRecommendation: appointment.clinicalRecommendation || "",
  createdAt: appointment.createdAt,
});

const escapeRegex = (value) => String(value || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const appendAndCondition = (query, condition) => {
  query.$and = query.$and || [];
  query.$and.push(condition);
};

const buildProviderAppointmentScope = (user) => {
  const providerName = fullName(user);
  const providerEmail = String(user?.email || "").toLowerCase();
  const providerId = user?.id || user?._id;
  const scopedFilters = [];

  if (providerEmail) {
    scopedFilters.push(
      { completedByEmail: providerEmail },
      { noShowByEmail: providerEmail },
      { statusUpdatedByEmail: providerEmail },
    );
  }

  if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
    scopedFilters.push(
      { completedBy: providerId },
      { noShowBy: providerId },
      { statusUpdatedBy: providerId },
    );
  }

  return scopedFilters.length ? { $or: scopedFilters } : { _id: null };
};

router.get(
  "/clinic-dentist",
  asyncHandler(async (req, res) => {
    const dentist = await getClinicDentist();

    res.json({
      data: dentist
        ? {
            id: dentist._id,
            name: fullName(dentist),
            email: dentist.email,
            role: "admin",
            profilePhoto: dentist.profilePhoto,
            specialization: dentist.specialization,
          }
        : null,
    });
  }),
);

router.get(
  "/availability",
  authenticate,
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    const parsedDate = parseAppointmentDate(req.query.date);

    if (!parsedDate) {
      return res.status(400).json({
        message: "Please select a valid appointment date.",
        slots: [],
      });
    }

    const settings = await getCurrentSettings();
    const selectedDateKey = requestedDateKey(parsedDate);
    const todayKey = clinicDateKey();
    if (selectedDateKey < todayKey) {
      return res.json({
        slots: [],
        message: "This date has already passed. Please choose today or a future date.",
      });
    }

    if (req.user.role === "patient" && selectedDateKey > addDateKeyDays(todayKey, ADVANCE_BOOKING_DAYS)) {
      return res.json({
        slots: [],
        message: "Online booking is available up to 2 weeks in advance. Please choose an earlier date.",
      });
    }

    const dentistName = await getClinicDentistName();
    const selectedServiceNames = normalizeServiceNames(req.query.services || req.query.service);
    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
    const selectedServices = selectedServiceNames.map((name) =>
      activeServices.find((item) => item.serviceName === name)
    );

    if (selectedServices.some((service) => !service)) {
      return res.json({
        slots: [],
        message: "The selected service is no longer available for new appointments.",
      });
    }
    const selectedService = selectedServices.length
      ? { duration: selectedServices.reduce((total, service) => total + getServiceDuration(service, settings.appointmentSettings), 0) }
      : null;

    const personalSchedule = req.user.role === "patient"
      ? null
      : await getDentistPersonalSchedule(dentistName);
    const appointmentSettings = {
      ...settings.appointmentSettings,
      ...(personalSchedule || {}),
    };

    if (appointmentSettings.allowOnlineBooking === false && req.user.role === "patient") {
      return res.json({
        slots: [],
        message: "Online booking is currently unavailable. Please contact the clinic to schedule an appointment.",
      });
    }

    if (!isAllowedAppointmentDate(parsedDate, appointmentSettings)) {
      return res.json({
        slots: [],
        message: "No available appointments for this date. Please select another date.",
      });
    }

    const dayRange = {
      $gte: startOfDay(parsedDate),
      $lte: endOfDay(parsedDate),
    };
    const dayQuery = {
      appointmentDate: dayRange,
      status: { $in: BLOCKING_APPOINTMENT_STATUSES },
    };

    const [appointmentsForDay, bookedAppointments] = await Promise.all([
      Appointment.countDocuments({
        appointmentDate: dayRange,
        status: { $in: BLOCKING_APPOINTMENT_STATUSES },
      }),
      Appointment.find(dayQuery).select("appointmentTime dentistName status serviceDurationSnapshot").lean(),
    ]);

    if (appointmentsForDay >= Number(appointmentSettings.maxAppointmentsPerDay || 20)) {
      return res.json({
        slots: [],
        message: "No available appointments for this date. Please select another date.",
      });
    }

    const timeFormat = settings?.systemPreferences?.timeFormat || "12";
    const slotMinutes = getAvailableSlotMinutes({
      appointmentSettings,
      service: selectedService,
      bookedAppointments,
      selectedDate: parsedDate,
    });
    const slots = slotMinutes.map((slot) => formatTime(slot, timeFormat));

    res.json({
      slots,
      bookedCount: bookedAppointments.length,
      message: slots.length
        ? "Available time slots loaded."
        : "No available appointments for this date. Please select another date.",
    });
  }),
);

router.post(
  "/promo/validate",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const { service, services, promoCode, autoApply } = req.body || {};
    const selectedServiceNames = normalizeServiceNames(Array.isArray(services) ? services : service);

    if (!selectedServiceNames.length) {
      return res.status(400).json({
        message: "Please select a dental service before applying a promo code.",
        errors: { service: "Please select a dental service before applying a promo code." },
      });
    }

    const [settings, patientRecord] = await Promise.all([
      getCurrentSettings(),
      Patient.findOne({ userId: req.user.id }),
    ]);
    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
    const selectedServices = selectedServiceNames.map((name) =>
      activeServices.find((item) => item.serviceName === name)
    );

    if (selectedServices.some((selectedService) => !selectedService)) {
      return res.status(400).json({
        message: "The selected service is no longer available for new appointments.",
        errors: { service: "The selected service is no longer available for new appointments." },
      });
    }

    if (!autoApply && !String(promoCode || "").trim()) {
      return res.status(400).json({
        message: "Please enter a promo code.",
        errors: { promoCode: "Please enter a promo code." },
      });
    }

    const result = await validatePromotionForBooking({
      patientId: patientRecord?._id,
      services: selectedServices,
      promoCode,
      autoApply: Boolean(autoApply),
    });

    if (!result.valid) {
      return res.status(autoApply ? 200 : 400).json({
        valid: false,
        message: result.message,
      });
    }

    res.json({
      valid: true,
      message: result.message,
      autoApplied: result.autoApplied,
      promotion: {
        id: result.promotion._id,
        title: result.promotion.title,
        promoCode: result.promotion.promoCode,
        discountType: result.discountType,
        discountValue: result.discountValue,
        discountLabel: result.promotion.discountLabel,
        applicableServices: result.promotion.applicableServices,
        endDate: result.promotion.endDate,
      },
      eligibleServiceNames: result.eligibleServiceNames,
      originalPrice: result.originalPrice,
      discountAmount: result.discountAmount,
      finalPrice: result.finalPrice,
    });
  }),
);

router.post(
  "/book",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const {
      patientName,
      contactNumber,
      email,
      appointmentDate,
      appointmentTime,
      service,
      services,
      promoCode,
      notes,
      reason,
    } = req.body;

    const submittedServiceNames = normalizeServiceNames(Array.isArray(services) ? services : service);

    if (!patientName?.trim() || !contactNumber?.trim() || !email?.trim() || !appointmentDate || !appointmentTime || !submittedServiceNames.length) {
      return res.status(400).json({
        message: "Full name, contact number, email, preferred date, preferred time, and service are required.",
      });
    }

    if (!isValidMobileNumber(contactNumber, { required: true })) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const parsedDate = parseAppointmentDate(appointmentDate);
    const settings = await getCurrentSettings();
    const normalizedDentistName = await getClinicDentistName();
    const appointmentSettings = {
      ...settings.appointmentSettings,
    };

    if (!parsedDate) {
      return res.status(400).json({ message: "Preferred date is invalid." });
    }

    const selectedDateKey = requestedDateKey(parsedDate);
    const todayKey = clinicDateKey();

    if (selectedDateKey < todayKey) {
      return res.status(400).json({
        message: "Selected date is unavailable. Please choose a future date.",
        errors: { appointmentDate: "Selected date is unavailable. Please choose a future date." },
      });
    }

    if (selectedDateKey > addDateKeyDays(todayKey, ADVANCE_BOOKING_DAYS)) {
      return res.status(400).json({
        message: "Online booking is available up to 2 weeks in advance. Please choose an earlier date.",
        errors: { appointmentDate: "Online booking is available up to 2 weeks in advance. Please choose an earlier date." },
      });
    }

    if (appointmentSettings.allowOnlineBooking === false) {
      return res.status(403).json({
        message: "Online booking is currently unavailable. Please contact the clinic to schedule an appointment.",
      });
    }

    if (!isAllowedAppointmentDate(parsedDate, appointmentSettings)) {
      return res.status(400).json({
        message: "The selected date is outside the clinic appointment schedule.",
        errors: { appointmentDate: "The selected date is outside the clinic appointment schedule." },
      });
    }

    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
    const selectedServices = submittedServiceNames.map((name) =>
      activeServices.find((item) => item.serviceName === name)
    );

    if (selectedServices.some((selectedService) => !selectedService)) {
      return res.status(400).json({
        message: "The selected service is no longer available for new appointments.",
        errors: { service: "The selected service is no longer available for new appointments." },
      });
    }

    const serviceNames = selectedServices.map((selectedService) => selectedService.serviceName);
    const appointmentService = serviceNames.join(", ");
    const selectedTimeMinutes = toMinutes(appointmentTime);
    const serviceDuration = selectedServices.reduce(
      (total, selectedService) => total + getServiceDuration(selectedService, appointmentSettings),
      0,
    );
    const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0);
    const closing = toMinutes(appointmentSettings.closingTime);
    const selectedSlotEnd = getSlotEndMinutes(selectedTimeMinutes, serviceDuration, buffer);

    if (!generateTimeSlots(appointmentSettings).has(selectedTimeMinutes) || selectedSlotEnd > closing) {
      return res.status(400).json({
        message: "The selected time is outside the clinic appointment schedule.",
        errors: { appointmentTime: "The selected time is outside the clinic appointment schedule." },
      });
    }

    if (isPastClinicSlot(selectedDateKey, selectedTimeMinutes)) {
      return res.status(400).json({
        message: "This time slot has already passed. Please select another available time.",
        errors: { appointmentTime: "This time slot has already passed. Please select another available time." },
      });
    }

    const dayRange = {
      $gte: startOfDay(parsedDate),
      $lte: endOfDay(parsedDate),
    };

    const appointmentsForDay = await Appointment.countDocuments({
      appointmentDate: dayRange,
      status: { $in: BLOCKING_APPOINTMENT_STATUSES },
    });

    if (appointmentsForDay >= Number(appointmentSettings.maxAppointmentsPerDay || 20)) {
      return res.status(409).json({
        message: "The clinic has reached the maximum number of appointments for this date.",
      });
    }

    const dayBlockingQuery = {
      appointmentDate: dayRange,
      status: { $in: BLOCKING_APPOINTMENT_STATUSES },
    };

    const existingBookings = await Appointment.find(dayBlockingQuery)
      .select("appointmentTime dentistName status serviceDurationSnapshot")
      .lean();
    const existingBooking = existingBookings.find((appointment) =>
      appointmentBlocksSlot(appointment, selectedTimeMinutes, selectedSlotEnd, serviceDuration, buffer)
    );

    if (existingBooking) {
      return res.status(409).json({
        message: "This time slot is already booked. Please choose another available time.",
      });
    }

    const patientRecord = await Patient.findOne({ userId: req.user.id });
    const duplicateFilters = [{ email: email.trim().toLowerCase() }];
    if (patientRecord?._id) duplicateFilters.push({ patient: patientRecord._id });
    const duplicateActiveAppointment = await Appointment.findOne({
      $or: duplicateFilters,
      appointmentDate: parsedDate,
      service: appointmentService,
      status: { $in: DUPLICATE_ACTIVE_STATUSES },
    }).select("_id");

    if (duplicateActiveAppointment) {
      return res.status(409).json({
        message: "You already have an active appointment for this service and date.",
        errors: { service: "You already have an active appointment for this service and date." },
      });
    }

    const servicePrice = Math.round(selectedServices.reduce(
      (total, selectedService) => total + (Number.isFinite(Number(selectedService.price)) ? Number(selectedService.price) : 0),
      0,
    ) * 100) / 100;
    const promotionResult = String(promoCode || "").trim()
      ? await validatePromotionForBooking({
          patientId: patientRecord?._id,
          services: selectedServices,
          promoCode,
        })
      : await validatePromotionForBooking({
          patientId: patientRecord?._id,
          services: selectedServices,
          autoApply: true,
        });

    if (String(promoCode || "").trim() && !promotionResult.valid && !promotionResult.notApplicable) {
      return res.status(400).json({
        message: promotionResult.message,
        errors: { promoCode: promotionResult.message },
      });
    }

    const appliedPromotion = promotionResult.valid ? promotionResult.promotion : null;
    const originalPrice = servicePrice;
    const discountAmount = promotionResult.valid ? promotionResult.discountAmount : 0;
    const finalPrice = promotionResult.valid ? promotionResult.finalPrice : servicePrice;

    let appointment;
    try {
      appointment = await Appointment.create({
        patient: patientRecord?._id,
        patientName: patientName.trim(),
        contactNumber: normalizeMobileNumber(contactNumber),
        email: email.trim().toLowerCase(),
        appointmentDate: parsedDate,
        appointmentTime: appointmentTime.trim(),
        dentistName: normalizedDentistName,
        service: appointmentService,
        serviceRef: selectedServices[0]._id,
        serviceItems: selectedServices.map((selectedService) => ({
          serviceName: selectedService.serviceName,
          serviceRef: selectedService._id,
          price: Number.isFinite(Number(selectedService.price)) ? Number(selectedService.price) : 0,
          duration: getServiceDuration(selectedService, appointmentSettings),
        })),
        servicePriceSnapshot: servicePrice,
        serviceDurationSnapshot: serviceDuration,
        promotion: appliedPromotion?._id,
        promoCode: appliedPromotion?.promoCode,
        promoTitle: appliedPromotion?.title,
        promoDiscountType: promotionResult.valid ? promotionResult.discountType : undefined,
        promoDiscountValue: promotionResult.valid ? promotionResult.discountValue : undefined,
        originalPrice,
        discountAmount,
        finalPrice,
        notes: notes?.trim(),
        reason: reason?.trim(),
        status: "pending",
        requestSubmittedAt: new Date(),
      });
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.appointmentDate && error?.keyPattern?.appointmentTime) {
        return res.status(409).json({
          message: "This time slot is already booked. Please choose another available time.",
          errors: { appointmentTime: "This time slot is already booked. Please choose another available time." },
        });
      }
      throw error;
    }

    await Promise.allSettled([
      notifyAdminsOfNewAppointment(appointment, settings),
      AuditLog.create({
        action: "Appointment Booked",
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          service: appointment.service,
          status: appointment.status,
          promoCode: appointment.promoCode,
          discountAmount: appointment.discountAmount,
          finalPrice: appointment.finalPrice,
        },
      }),
    ]);

    res.status(201).json({
      message: "Appointment booked successfully. Your request is pending confirmation.",
      appointment: sanitizeAppointment(appointment),
    });
  }),
);

router.get(
  "/my",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const patientRecord = await Patient.findOne({ userId: req.user.id });
    const filters = [{ email: req.user.email }];

    if (patientRecord) {
      filters.push({ patient: patientRecord._id });
    }

    const activeStatuses = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "rescheduled"]);
    const now = new Date();
    const appointments = (await Appointment.find({ $or: filters }).limit(100).lean())
      .sort((left, right) => {
        const leftDate = getScheduledDateTime(left);
        const rightDate = getScheduledDateTime(right);
        const leftUpcoming = activeStatuses.has(left.status) && leftDate >= now;
        const rightUpcoming = activeStatuses.has(right.status) && rightDate >= now;

        if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
        return leftUpcoming
          ? leftDate.getTime() - rightDate.getTime()
          : rightDate.getTime() - leftDate.getTime();
      });
    const appointmentIds = appointments.map((appointment) => appointment._id).filter(Boolean);
    const clinicalNotes = appointmentIds.length
      ? await DentalRecord.find({
          appointment: { $in: appointmentIds },
          recordType: "clinical_note",
          "clinicalNotes.recommendations": { $nin: [null, ""] },
        })
        .select("appointment clinicalNotes.recommendations updatedAt createdAt")
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean()
      : [];
    const recommendationsByAppointment = new Map();

    clinicalNotes.forEach((note) => {
      const appointmentId = String(note.appointment || "");
      if (!appointmentId || recommendationsByAppointment.has(appointmentId)) return;
      recommendationsByAppointment.set(appointmentId, note.clinicalNotes?.recommendations || "");
    });

    res.json({
      data: appointments.map((appointment) => sanitizeAppointment({
        ...appointment,
        clinicalRecommendation: recommendationsByAppointment.get(String(appointment._id)) || "",
      })),
    });
  }),
);

router.patch(
  "/my/:id/cancel",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const patientRecord = await Patient.findOne({ userId: req.user.id }).select("_id").lean();
    const ownerFilters = [{ _id: req.params.id, email: req.user.email }];

    if (patientRecord?._id) {
      ownerFilters.push({ _id: req.params.id, patient: patientRecord._id });
    }

    const appointment = await Appointment.findOne({ $or: ownerFilters });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    if (appointment.status !== "pending") {
      return res.status(400).json({
        message: "Only pending appointment requests can be cancelled by the patient.",
      });
    }

    const now = new Date();
    const reason = "Cancelled by patient before clinic approval.";

    appointment.status = "cancelled";
    appointment.declineReason = reason;
    appointment.statusUpdatedAt = now;
    appointment.statusUpdatedBy = req.user.id;
    appointment.statusUpdatedByEmail = req.user.email;
    appointment.timeline = [
      ...(appointment.timeline || []),
      {
        status: "cancelled",
        action: "Appointment Cancelled by Patient",
        performedBy: req.user.id,
        performedByName: fullName(req.user) || req.user.email,
        performedByEmail: req.user.email,
        note: reason,
        recordedAt: now,
      },
    ];

    await appointment.save();

    await AuditLog.create({
      action: "Appointment Cancelled by Patient",
      entityType: "Appointment",
      entityId: appointment._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        appointmentId: appointment._id,
        patientName: appointment.patientName,
        service: appointment.service,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
      },
    }).catch(() => {});

    res.json({
      message: "Appointment request cancelled successfully.",
      appointment: sanitizeAppointment(appointment),
    });
  }),
);

router.patch(
  "/my/:id/reschedule",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const { appointmentDate, appointmentTime } = req.body || {};
    const patientRecord = await Patient.findOne({ userId: req.user.id }).select("_id").lean();
    const ownerFilters = [{ _id: req.params.id, email: req.user.email }];
    const patientScope = [{ email: req.user.email }];

    if (patientRecord?._id) {
      ownerFilters.push({ _id: req.params.id, patient: patientRecord._id });
      patientScope.push({ patient: patientRecord._id });
    }

    const appointment = await Appointment.findOne({ $or: ownerFilters });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    if (appointment.status !== "pending") {
      return res.status(400).json({
        message: "Only pending appointment requests can be rescheduled by the patient.",
      });
    }

    if (!appointmentDate || !appointmentTime) {
      return res.status(400).json({
        message: "Please select a new appointment date and time.",
      });
    }

    let validation;
    try {
      validation = await validateAppointmentSlot({
        appointmentDate,
        appointmentTime,
        serviceName: appointment.service,
        dentistName: appointment.dentistName,
        excludeAppointmentId: appointment._id,
      });
    } catch (error) {
      return res.status(error.status || 400).json({
        message: error.message || "The selected appointment schedule is unavailable.",
        errors: error.errors || {},
      });
    }

    const dayRange = {
      $gte: startOfDay(validation.parsedDate),
      $lte: endOfDay(validation.parsedDate),
    };
    const duplicateActiveAppointment = await Appointment.findOne({
      _id: { $ne: appointment._id },
      $or: patientScope,
      appointmentDate: dayRange,
      service: appointment.service,
      status: { $in: DUPLICATE_ACTIVE_STATUSES },
    }).lean();

    if (duplicateActiveAppointment) {
      return res.status(409).json({
        message: "You already have an active appointment for this service and date.",
      });
    }

    const now = new Date();
    const previousSchedule = {
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
    };

    appointment.appointmentDate = validation.parsedDate;
    appointment.appointmentTime = validation.appointmentTime || String(appointmentTime).trim();
    appointment.statusUpdatedAt = now;
    appointment.statusUpdatedBy = req.user.id;
    appointment.statusUpdatedByEmail = req.user.email;
    appointment.serviceDurationSnapshot = appointment.serviceDurationSnapshot || validation.serviceDuration;
    appointment.timeline = [
      ...(appointment.timeline || []),
      {
        status: "pending",
        action: "Appointment Rescheduled by Patient",
        performedBy: req.user.id,
        performedByName: fullName(req.user) || req.user.email,
        performedByEmail: req.user.email,
        note: `Patient requested a new schedule: ${validation.appointmentTime || appointmentTime}.`,
        recordedAt: now,
      },
    ];

    await appointment.save();

    await AuditLog.create({
      action: "Appointment Rescheduled by Patient",
      entityType: "Appointment",
      entityId: appointment._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        appointmentId: appointment._id,
        patientName: appointment.patientName,
        service: appointment.service,
        previousSchedule,
        newSchedule: {
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
        },
      },
    }).catch(() => {});

    res.json({
      message: "Appointment request rescheduled successfully. It is still waiting for clinic approval.",
      appointment: sanitizeAppointment(appointment),
    });
  }),
);

router.get(
  "/provider/reports",
  authenticate,
  authorize("staff"),
  asyncHandler(async (req, res) => {
    const query = buildProviderAppointmentScope(req.user);
    const startDate = req.query.startDate ? parseAppointmentDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? parseAppointmentDate(req.query.endDate) : null;

    if (req.query.startDate && !startDate) {
      return res.status(400).json({ message: "Start date filter is invalid." });
    }

    if (req.query.endDate && !endDate) {
      return res.status(400).json({ message: "End date filter is invalid." });
    }

    if (startDate || endDate) {
      appendAndCondition(query, {
        appointmentDate: {
          ...(startDate ? { $gte: startDate } : {}),
          ...(endDate ? { $lte: endOfDay(endDate) } : {}),
        },
      });
    }

    if (req.query.status && req.query.status !== "all") {
      appendAndCondition(query, { status: req.query.status });
    }

    if (req.query.search) {
      const pattern = new RegExp(escapeRegex(req.query.search), "i");
      appendAndCondition(query, {
        $or: [
          { patientName: pattern },
          { email: pattern },
          { service: pattern },
        ],
      });
    }

    const appointments = await Appointment.find(query)
      .sort({ appointmentDate: -1, appointmentTime: -1, createdAt: -1 })
      .limit(500)
      .lean();

    await AuditLog.create({
      action: "Report viewed",
      entityType: "Reports",
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        module: "Staff Reports",
        filters: {
          startDate: req.query.startDate,
          endDate: req.query.endDate,
          status: req.query.status || "all",
          search: req.query.search || "",
        },
      },
    }).catch(() => {});

    res.json({
      data: appointments.map(sanitizeAppointment),
    });
  }),
);

router.get(
  "/:id",
  authenticate,
  authorize("admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const appointment = await Appointment.findById(req.params.id).populate("patient");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const treatmentRecord = await DentalRecord.findOne({
      appointment: appointment._id,
      recordType: "treatment_record",
    }).lean();

    if (treatmentRecord && appointment.status !== "completed") {
      appointment.status = "completed";
      appointment.completedAt = appointment.completedAt || treatmentRecord.visitDate || new Date();
      await Appointment.updateOne(
        { _id: appointment._id, status: { $ne: "completed" } },
        { $set: { status: "completed", completedAt: appointment.completedAt } }
      );
    }

    const sanitized = sanitizeAppointment(appointment);
    sanitized.hasTreatmentRecord = Boolean(treatmentRecord);
    sanitized.treatmentRecordId = treatmentRecord ? treatmentRecord._id : null;
    sanitized.treatmentRecord = treatmentRecord
      ? {
          id: treatmentRecord._id,
          patientName: treatmentRecord.patientName,
          patient: treatmentRecord.patient,
          appointment: treatmentRecord.appointment,
          visitDate: treatmentRecord.visitDate,
          procedure: treatmentRecord.procedure || treatmentRecord.servicePerformed || treatmentRecord.treatment,
          servicePerformed: treatmentRecord.servicePerformed,
          toothNumber: treatmentRecord.toothNumber,
          toothColorMap: treatmentRecord.toothColorMap instanceof Map ? Object.fromEntries(treatmentRecord.toothColorMap) : (treatmentRecord.toothColorMap || {}),
          diagnosis: treatmentRecord.diagnosis,
          treatmentPerformed: treatmentRecord.treatmentPerformed || treatmentRecord.treatment,
          materialsUsed: treatmentRecord.materialsUsed,
          treatmentStatus: treatmentRecord.treatmentStatus || "completed",
          recommendations: treatmentRecord.recommendations || treatmentRecord.nextVisitRecommendation,
          notes: treatmentRecord.notes,
          dentistName: treatmentRecord.dentistName,
          createdByName: treatmentRecord.createdByName,
        }
      : null;

    res.json({ appointment: sanitized });
  }),
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const { status, declineReason, followUp = {} } = req.body;
    const settings = await getCurrentSettings();
    const allowedStatuses = ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "cancelled", "declined", "no_show", "rescheduled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: pending, confirmed, follow_up, checked_in, in_consultation, completed, cancelled, declined, no_show, rescheduled.",
      });
    }

    const normalizedDeclineReason = String(declineReason || "").trim();

    if (["cancelled", "declined"].includes(status) && !normalizedDeclineReason) {
      return res.status(400).json({
        message: `Please provide a reason for ${status === "declined" ? "declining" : "cancelling"} this appointment.`,
      });
    }

    const existingAppointment = await Appointment.findById(req.params.id);

    if (!existingAppointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const transitionRules = {
      confirmed: ["pending"],
      follow_up: [],
      declined: ["pending"],
      checked_in: ["confirmed", "follow_up"],
      in_consultation: ["checked_in"],
      cancelled: ["pending", "confirmed", "follow_up", "checked_in", "in_consultation"],
      completed: ["confirmed", "follow_up", "checked_in", "in_consultation"],
      no_show: ["confirmed", "follow_up", "checked_in"],
      rescheduled: ["pending", "confirmed", "follow_up", "checked_in", "in_consultation"],
      pending: [],
    };
    const allowedCurrentStatuses = transitionRules[status] || [];

    if (!allowedCurrentStatuses.includes(existingAppointment.status)) {
      return res.status(400).json({
        message:
          status === "completed" || status === "no_show"
            ? "Only active appointments can be marked as completed or no-show."
            : "This appointment can no longer be updated to the selected status.",
      });
    }

    const now = new Date();
    const scheduledAt = getScheduledDateTime(existingAppointment);
    const scheduledDay = startOfDay(scheduledAt);
    const today = startOfDay(now);

    if (status === "checked_in" && scheduledDay > today) {
      return res.status(400).json({
        message: "This appointment can only be checked in on the scheduled appointment date.",
      });
    }

    if (status === "no_show" && scheduledAt > now) {
      return res.status(400).json({
        message: "This appointment cannot be marked as no-show before the scheduled appointment time.",
      });
    }

    const update = {
      status,
      statusUpdatedAt: now,
      statusUpdatedBy: req.user.id,
      statusUpdatedByEmail: req.user.email,
    };
    const unset = {};

    if (["cancelled", "declined"].includes(status)) {
      update.declineReason = normalizedDeclineReason;
    } else {
      unset.declineReason = "";
    }

    if (status === "completed") {
      const currentService = (settings.services || []).find((service) => service.serviceName === existingAppointment.service);
      const revenueAmount = Number.isFinite(Number(existingAppointment.finalPrice))
        ? Number(existingAppointment.finalPrice)
        : Number.isFinite(Number(existingAppointment.servicePriceSnapshot))
          ? Number(existingAppointment.servicePriceSnapshot)
        : Number.isFinite(Number(currentService?.price))
          ? Number(currentService.price)
          : 0;

      update.completedAt = now;
      update.completedBy = req.user.id;
      update.completedByEmail = req.user.email;
      update.estimatedRevenueAmount = revenueAmount;
      if (!existingAppointment.servicePriceSnapshot && currentService) update.servicePriceSnapshot = revenueAmount;
      if (!existingAppointment.serviceDurationSnapshot && currentService?.duration) update.serviceDurationSnapshot = Number(currentService.duration);
      if (!existingAppointment.serviceRef && currentService?._id) update.serviceRef = currentService._id;
    }

    if (status === "no_show") {
      update.noShowAt = now;
      update.noShowBy = req.user.id;
      update.noShowByEmail = req.user.email;
      update.estimatedRevenueAmount = 0;
    }

    const updatePayload = {
      $set: update,
      $push: {
        timeline: {
          status,
          action: `Appointment ${status}`,
          performedBy: req.user.id,
          performedByName: fullName(req.user),
          performedByEmail: req.user.email,
          note: ["cancelled", "declined"].includes(status) ? normalizedDeclineReason : "",
          recordedAt: now,
        },
      },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    };

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, status: existingAppointment.status },
      updatePayload,
      { new: true, runValidators: true },
    );

    if (!appointment) {
      return res.status(409).json({ message: "Appointment status changed before this action could be completed. Please refresh and try again." });
    }

    const createdRecords = [];
    const createdFollowUps = [];
    let treatmentRecordStatus = null;

    if (status === "completed") {
      const { record, created } = await createAutomaticTreatmentRecord(appointment, req.user);
      if (record) createdRecords.push(record);
      treatmentRecordStatus = created
        ? "Treatment Record has been created automatically."
        : "A Treatment Record already exists for this appointment.";
    }

    if (status === "completed" && followUp.date && followUp.time) {
      const followUpValidation = await validateAppointmentSlot({
        appointmentDate: followUp.date,
        appointmentTime: followUp.time,
        serviceName: appointment.service,
        dentistName: appointment.dentistName,
        autoSelectAlternative: true,
      });
      const parsedFollowUpDate = followUpValidation.parsedDate;
      const scheduledFollowUpTime = followUpValidation.appointmentTime;
      const followUpAdjustmentNote = followUpValidation.autoAdjusted
        ? ` Requested time ${String(followUp.time).trim()} was unavailable, so the appointment was scheduled at ${scheduledFollowUpTime}.`
        : "";
      const followUpAppointment = await Appointment.create({
        patient: appointment.patient,
        patientName: appointment.patientName,
        contactNumber: appointment.contactNumber,
        email: appointment.email,
        service: followUpValidation.selectedService.serviceName,
        serviceRef: appointment.serviceRef,
        servicePriceSnapshot: Number(followUpValidation.selectedService.price) || appointment.servicePriceSnapshot,
        serviceDurationSnapshot: followUpValidation.serviceDuration,
        appointmentDate: parsedFollowUpDate,
        appointmentTime: scheduledFollowUpTime,
        dentistName: appointment.dentistName,
        reason: String(followUp.reason || "Follow-up visit").trim(),
        status: "follow_up",
        requestSubmittedAt: now,
        timeline: [{
          status: "follow_up",
          action: followUpValidation.autoAdjusted ? "Follow-up Scheduled at Next Available Time" : "Follow-up Scheduled",
          performedBy: req.user.id,
          performedByName: fullName(req.user),
          performedByEmail: req.user.email,
          note: `Follow-up created after completed appointment ${appointment._id}.${followUpAdjustmentNote}`.trim(),
          recordedAt: now,
        }],
      });
      createdFollowUps.push(followUpAppointment);
	      const followUpPatientContact = appointment.patient
	        ? await Patient.findById(appointment.patient).select("email guardianEmail")
	        : await Patient.findOne({ email: appointment.email }).select("email guardianEmail");
	      sendPatientContactMail({
	          patient: followUpPatientContact,
	          fallbackEmail: appointment.email,
	          subject: "Follow-up Appointment Scheduled - Flores-Dizon Dental Clinic",
	          message: `A follow-up appointment has been scheduled for ${parsedFollowUpDate.toLocaleDateString()} at ${scheduledFollowUpTime}. Reason: ${String(followUp.reason || "Follow-up visit").trim()}${followUpAdjustmentNote}`,
	          html: `
            <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
              <h2 style="color:#082f49;">Follow-up Appointment Scheduled</h2>
              <p>Your follow-up appointment has been scheduled.</p>
              <p><strong>Date:</strong> ${parsedFollowUpDate.toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${scheduledFollowUpTime}</p>
              <p><strong>Reason:</strong> ${String(followUp.reason || "Follow-up visit").trim()}</p>
	              ${followUpValidation.autoAdjusted ? `<p>The requested time was unavailable, so the clinic selected the next available appointment time.</p>` : ""}
	            </div>
	          `,
	        }).catch(() => {});
	    }

    await Promise.allSettled([
      notifyPatientOfStatus(appointment, settings),
      status === "completed" ? verifyPatientAfterCompletedAppointment(appointment, req.user) : Promise.resolve(),
      AuditLog.create({
        action: `Appointment ${status}`,
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          status,
          declineReason: ["cancelled", "declined"].includes(status) ? normalizedDeclineReason : undefined,
          estimatedRevenueAmount: status === "completed" ? appointment.estimatedRevenueAmount || 0 : undefined,
          completedAt: status === "completed" ? appointment.completedAt : undefined,
          noShowAt: status === "no_show" ? appointment.noShowAt : undefined,
          treatmentRecordCreated: createdRecords.length > 0,
          treatmentRecordCreatedAutomatically: treatmentRecordStatus === "Treatment Record has been created automatically.",
          followUpCreated: createdFollowUps.length > 0,
        },
      }),
    ]);

    res.json({
      message:
        status === "confirmed"
          ? "Appointment approved and confirmed."
          : status === "follow_up"
            ? "Follow-up appointment scheduled."
          : status === "checked_in"
            ? "Patient checked in."
            : status === "in_consultation"
              ? "Consultation started."
          : status === "declined"
            ? "Appointment declined."
            : status === "completed"
              ? "Appointment marked as completed."
              : status === "no_show"
                ? "Appointment marked as no-show."
                : status === "rescheduled"
                  ? "Appointment marked for rescheduling."
          : "Appointment status updated.",
      appointment: sanitizeAppointment(appointment),
      treatmentRecordMessage: treatmentRecordStatus,
      treatmentRecord: createdRecords[0],
      followUpAppointment: createdFollowUps[0] ? sanitizeAppointment(createdFollowUps[0]) : undefined,
    });
  }),
);

router.patch(
  "/:id/notes",
  authenticate,
  authorize("admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const notes = String(req.body.notes || "").trim().slice(0, 1000);
    const now = new Date();
    appointment.notes = notes;
    appointment.timeline = [
      ...(appointment.timeline || []),
      {
        status: appointment.status,
        action: "Appointment Notes Added",
        performedBy: req.user.id,
        performedByName: fullName(req.user),
        performedByEmail: req.user.email,
        note: notes,
        recordedAt: now,
      },
    ];
    await appointment.save();

    await AuditLog.create({
      action: "Appointment Notes Added",
      entityType: "Appointments",
      entityId: appointment._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        appointmentId: appointment._id,
        patient: appointment.patient,
      },
    });

    res.json({ message: "Appointment notes saved.", appointment: sanitizeAppointment(appointment) });
  }),
);

router.patch(
  "/:id/schedule",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const parsedDate = req.body.appointmentDate ? parseAppointmentDate(req.body.appointmentDate) : appointment.appointmentDate;
    const appointmentTime = String(req.body.appointmentTime || appointment.appointmentTime || "").trim();
    const dentistName = await getClinicDentistName();

    if (!parsedDate || !appointmentTime) {
      return res.status(400).json({ message: "Appointment date and time are required." });
    }

    const conflict = await Appointment.findOne({
      _id: { $ne: appointment._id },
      appointmentDate: parsedDate,
      appointmentTime,
      dentistName,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    }).select("_id").lean();

    if (conflict) {
      return res.status(409).json({ message: "The clinic dentist already has an appointment at the selected date and time." });
    }

    const now = new Date();
    appointment.appointmentDate = parsedDate;
    appointment.appointmentTime = appointmentTime;
    appointment.dentistName = dentistName;
    appointment.statusUpdatedAt = now;
    appointment.statusUpdatedBy = req.user.id;
    appointment.statusUpdatedByEmail = req.user.email;
    appointment.timeline = [
      ...(appointment.timeline || []),
      {
        status: appointment.status,
        action: "Appointment Rescheduled",
        performedBy: req.user.id,
        performedByName: fullName(req.user),
        performedByEmail: req.user.email,
        note: `Updated schedule to ${parsedDate.toLocaleDateString()} ${appointmentTime} with ${dentistName}.`,
        recordedAt: now,
      },
    ];
    await appointment.save();

    await AuditLog.create({
      action: "Appointment Rescheduled",
      entityType: "Appointments",
      entityId: appointment._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        appointmentId: appointment._id,
        patient: appointment.patient,
        dentistName,
        appointmentDate: parsedDate,
        appointmentTime,
      },
    });

    res.json({ message: "Appointment schedule updated.", appointment: sanitizeAppointment(appointment) });
  }),
);

router.get(
  "/",
  authenticate,
  authorize("admin", "staff"),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const now = new Date();
    const { start: todayStart, end: tomorrowStart } = storedAppointmentDayRange(clinicDateKey(now));
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const period = req.query.period || "default";
    const query = {};

    if (req.query.dentist && req.query.dentist !== "all") {
      query.dentistName = req.query.dentist;
    }

    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    if (req.query.service && req.query.service !== "all") {
      query.service = req.query.service;
    }

    if (req.query.patient || req.query.search) {
      const pattern = new RegExp(String(req.query.search || req.query.patient).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { patientName: pattern },
        { email: pattern },
        { service: pattern },
        { dentistName: pattern },
      ];
    }

    if (req.query.date) {
      const parsedDate = parseAppointmentDate(req.query.date);
      if (!parsedDate) {
        return res.status(400).json({ message: "Appointment date filter is invalid." });
      }
      query.appointmentDate = { $gte: parsedDate, $lte: endOfDay(parsedDate) };
    } else if (period === "today") {
      query.appointmentDate = { $gte: todayStart, $lt: tomorrowStart };
    } else if (period === "upcoming") {
      query.appointmentDate = { $gte: todayStart };
    } else if (period === "past") {
      query.appointmentDate = { $lt: todayStart };
    } else if (period === "last7") {
      query.appointmentDate = { $gte: addDays(todayStart, -7), $lte: now };
    } else if (period === "last30") {
      query.appointmentDate = { $gte: addDays(todayStart, -30), $lte: now };
    } else if (period === "tomorrow") {
      const tomorrowEnd = addDays(tomorrowStart, 1);
      query.appointmentDate = { $gte: tomorrowStart, $lt: tomorrowEnd };
    } else if (period === "thisWeek") {
      query.appointmentDate = { $gte: todayStart, $lt: addDays(todayStart, 7) };
    } else if (period === "thisMonth") {
      const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
      query.appointmentDate = { $gte: todayStart, $lt: monthEnd };
    } else if (period === "custom") {
      const startDate = req.query.startDate ? parseAppointmentDate(req.query.startDate) : null;
      const endDate = req.query.endDate ? parseAppointmentDate(req.query.endDate) : null;

      if (req.query.startDate && !startDate) return res.status(400).json({ message: "Start date filter is invalid." });
      if (req.query.endDate && !endDate) return res.status(400).json({ message: "End date filter is invalid." });

      if (startDate || endDate) {
        query.appointmentDate = {
          ...(startDate ? { $gte: startDate } : {}),
          ...(endDate ? { $lte: endOfDay(endDate) } : {}),
        };
      }
    } else if (period !== "all") {
      query.appointmentDate = { $gte: todayStart };
    }

    const [allMatchingAppointments, serviceOptions, settings] = await Promise.all([
      Appointment.find(query)
        .populate("patient", "patientId dateOfBirth gender allergies medicalConditions medicalHistory")
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .lean(),
      Appointment.distinct("service", { service: { $nin: [null, ""] } }),
      getCurrentSettings(),
    ]);
    const clinicServiceOptions = (settings.services || [])
      .filter((service) => service?.status !== "inactive")
      .map((service) => service.serviceName)
      .filter(Boolean);

    const includeHiddenHistory = ["past", "last7", "last30", "custom", "all"].includes(period) || Boolean(req.query.date);
    const visibleAppointments = includeHiddenHistory
      ? allMatchingAppointments
      : allMatchingAppointments.filter((appointment) => getScheduledDateTime(appointment) >= cutoff);
    const newestPastFirst = ["past", "last7", "last30"].includes(period);
    const scheduleComparator = newestPastFirst ? compareAppointmentsByScheduleDesc : compareAppointmentsBySchedule;
    const sortedAppointments = visibleAppointments.sort(scheduleComparator);
    const total = sortedAppointments.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;
    const appointments = sortedAppointments.slice(skip, skip + limit);
    const appointmentIds = appointments.map((appointment) => appointment._id).filter(Boolean);
    const treatmentRecords = appointmentIds.length
      ? await DentalRecord.find({
          appointment: { $in: appointmentIds },
          recordType: "treatment_record",
        }).lean()
      : [];
    const treatmentRecordMap = new Map();
    treatmentRecords.forEach((record) => {
      if (record.appointment) {
        treatmentRecordMap.set(String(record.appointment), record);
      }
    });

    const uncompletedWithTreatment = [];
    appointments.forEach((appointment) => {
      if (treatmentRecordMap.has(String(appointment._id)) && appointment.status !== "completed") {
        uncompletedWithTreatment.push(appointment._id);
        appointment.status = "completed";
        appointment.completedAt = appointment.completedAt || treatmentRecordMap.get(String(appointment._id))?.visitDate || new Date();
      }
    });

    if (uncompletedWithTreatment.length) {
      Appointment.updateMany(
        { _id: { $in: uncompletedWithTreatment }, status: { $ne: "completed" } },
        { $set: { status: "completed", completedAt: new Date() } }
      ).catch((err) => console.warn("Failed to batch update appointments to completed:", err));
    }

    const data = appointments.map((appointment) => {
      const sanitized = sanitizeAppointment(appointment);
      const treatmentRecord = treatmentRecordMap.get(String(appointment._id));
      sanitized.hasTreatmentRecord = Boolean(treatmentRecord);
      if (treatmentRecord && sanitized.status !== "completed") {
        sanitized.status = "completed";
      }
      sanitized.treatmentRecordId = treatmentRecord ? treatmentRecord._id : null;
      sanitized.treatmentRecord = treatmentRecord
        ? {
            id: treatmentRecord._id,
            patientName: treatmentRecord.patientName,
            patient: treatmentRecord.patient,
            appointment: treatmentRecord.appointment,
            visitDate: treatmentRecord.visitDate,
            procedure: treatmentRecord.procedure || treatmentRecord.servicePerformed || treatmentRecord.treatment,
            servicePerformed: treatmentRecord.servicePerformed,
            toothNumber: treatmentRecord.toothNumber,
            toothColorMap: treatmentRecord.toothColorMap instanceof Map ? Object.fromEntries(treatmentRecord.toothColorMap) : (treatmentRecord.toothColorMap || {}),
            diagnosis: treatmentRecord.diagnosis,
            treatmentPerformed: treatmentRecord.treatmentPerformed || treatmentRecord.treatment,
            materialsUsed: treatmentRecord.materialsUsed,
            treatmentStatus: treatmentRecord.treatmentStatus || "completed",
            recommendations: treatmentRecord.recommendations || treatmentRecord.nextVisitRecommendation,
            notes: treatmentRecord.notes,
            dentistName: treatmentRecord.dentistName,
            createdByName: treatmentRecord.createdByName,
          }
        : null;
      return sanitized;
    });

    res.json({
      data,
      pagination: {
        page: currentPage,
        limit,
        total,
        pages: totalPages,
      },
      filters: {
        services: [...new Set([...OFFICIAL_SERVICES, ...clinicServiceOptions, ...serviceOptions.filter(Boolean)])].sort(),
      },
    });
  }),
);

const syncAppointmentsWithTreatmentRecords = async () => {
  try {
    const treatmentRecords = await DentalRecord.find({
      recordType: "treatment_record",
      appointment: { $exists: true, $ne: null },
    }).select("appointment visitDate").lean();

    const appointmentIds = treatmentRecords.map((r) => r.appointment).filter(Boolean);
    if (appointmentIds.length) {
      await Appointment.updateMany(
        { _id: { $in: appointmentIds }, status: { $ne: "completed" } },
        { $set: { status: "completed" } }
      );
    }
  } catch (err) {
    console.warn("Unable to sync treatment record appointment statuses:", err);
  }
};

syncAppointmentsWithTreatmentRecords();

router.syncAppointmentsWithTreatmentRecords = syncAppointmentsWithTreatmentRecords;

module.exports = router;
