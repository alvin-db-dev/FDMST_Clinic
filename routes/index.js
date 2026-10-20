const express = require("express");
const mongoose = require("mongoose");

const AuditLog = require("../models/AuditLog");
const Appointment = require("../models/Appointment");
const ClinicSettings = require("../models/ClinicSettings");
const DentalRecord = require("../models/DentalRecord");
const Inventory = require("../models/Inventory");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Promotion = require("../models/Promotion");
const Subscriber = require("../models/Subscriber");
const User = require("../models/User");
const authRoutes = require("./auth");
const appointmentRoutes = require("./appointments");
const dashboardRoutes = require("./dashboard");
const feedbackRoutes = require("./feedback");
const messageRoutes = require("./messages");
const uploadRoutes = require("./uploads");
const userRoutes = require("./users");
const createCrudRouter = require("../utils/createCrudRouter");
const { authenticate, authorize } = require("../middleware/auth");
const { sendMail } = require("../services/mailService");
const {
  createClinicalFileSignedUrl,
  deleteClinicalFile,
  deleteManagedPromotionImage,
  getManagedPromotionImagePath,
  isManagedClinicalFile,
} = require("../services/supabaseStorageService");
const { validateAppointmentSlot } = require("../utils/appointmentAvailability");
const { preparePatientCreateBody, preparePatientUpdateBody } = require("../utils/patientRecords");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { expirePromotions } = require("../utils/promotionExpiry");

const router = express.Router();
const DEFAULT_PATIENT_TEMPORARY_PASSWORD = "12345678";

const validatePromotionImage = (value, previousUrl = "") => {
  const imageValue = value?.trim() || "";
  if (!imageValue) return "";

  if (imageValue !== previousUrl && !getManagedPromotionImagePath(imageValue)) {
    const error = new Error("Upload the promotion image to clinic storage before saving.");
    error.status = 400;
    error.errors = { imageUrl: error.message };
    throw error;
  }

  if (imageValue !== previousUrl && imageValue.length > 2048) {
    const error = new Error("Promotion banner image is too large.");
    error.status = 400;
    error.errors = { imageUrl: "Promotion banner image is too large." };
    throw error;
  }

  return imageValue;
};

const slugPromoCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "")
  .slice(0, 18);

const generatePromoCode = (title) => {
  const base = slugPromoCode(title).slice(0, 10) || "PROMO";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffix}`;
};

const parseDiscountFromLabel = (label = "", fallbackType = "fixed") => {
  const text = String(label || "").trim();
  const percentageMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentageMatch) {
    const value = Number(percentageMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "percentage", discountValue: Math.min(value, 100) };
    }
  }

  const amountMatch = text.replace(/,/g, "").match(/(?:₱|PHP)?\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    const value = Number(amountMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: fallbackType, discountValue: value };
    }
  }

  return null;
};

const normalizeApplicableServices = (body = {}) => {
  const rawServices = Array.isArray(body.applicableServices)
    ? body.applicableServices
    : body.serviceType
      ? [body.serviceType]
      : [];
  const services = rawServices
    .map((service) => String(service || "").trim())
    .filter(Boolean);

  if (!services.length || services.some((service) => service.toLowerCase() === "all services")) {
    return ["All Services"];
  }

  return [...new Set(services)];
};

const normalizePromotionBody = async (body = {}, req) => {
  const title = body.title?.trim();

  if (!title) {
    const error = new Error("Promotion title is required.");
    error.status = 400;
    error.errors = { title: "Promotion title is required." };
    throw error;
  }

  const startDate = body.startDate ? new Date(body.startDate) : undefined;
  const endDate = body.endDate ? new Date(body.endDate) : undefined;
  let discountType = body.discountType === "percentage" ? "percentage" : "fixed";
  let discountValue = Number(body.discountValue ?? 0);
  const parsedDiscount = parseDiscountFromLabel(body.discountLabel, discountType);

  if ((!Number.isFinite(discountValue) || discountValue <= 0) && parsedDiscount) {
    discountType = parsedDiscount.discountType;
    discountValue = parsedDiscount.discountValue;
  }
  const maxRedemptions = body.maxRedemptions === "" || body.maxRedemptions === null || body.maxRedemptions === undefined
    ? undefined
    : Number(body.maxRedemptions);
  const promoCode = slugPromoCode(body.promoCode) || generatePromoCode(title);

  if (startDate && Number.isNaN(startDate.getTime())) {
    const error = new Error("Start date is invalid.");
    error.status = 400;
    error.errors = { startDate: "Start date is invalid." };
    throw error;
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    const error = new Error("End date is invalid.");
    error.status = 400;
    error.errors = { endDate: "End date is invalid." };
    throw error;
  }

  if (startDate && endDate && endDate < startDate) {
    const error = new Error("End date must be after the start date.");
    error.status = 400;
    error.errors = { endDate: "End date must be after the start date." };
    throw error;
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "percentage" && discountValue > 100)) {
    const error = new Error(discountType === "percentage"
      ? "Percentage discount must be greater than 0 and no more than 100."
      : "Fixed discount must be greater than 0.");
    error.status = 400;
    error.errors = { discountValue: error.message };
    throw error;
  }

  if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
    const error = new Error("Maximum redemption must be a whole number greater than zero.");
    error.status = 400;
    error.errors = { maxRedemptions: "Maximum redemption must be a whole number greater than zero." };
    throw error;
  }

  const existingPromotion = await Promotion.findOne({
    promoCode,
    ...(req.params?.id ? { _id: { $ne: req.params.id } } : {}),
  }).select("_id");

  if (existingPromotion) {
    const error = new Error("Promo code is already in use.");
    error.status = 409;
    error.errors = { promoCode: "Promo code is already in use." };
    throw error;
  }

  const previousPromotion = req.params?.id
    ? await Promotion.findById(req.params.id).select("imageUrl createdBy")
    : null;

  const now = new Date();
  const requestedStatus = body.status || "active";
  const status = requestedStatus === "expired" && (!endDate || endDate > now)
    ? "active"
    : requestedStatus;
  const applicableServices = normalizeApplicableServices(body);

  return {
    title,
    description: body.description?.trim() || "",
    imageUrl: validatePromotionImage(body.imageUrl, previousPromotion?.imageUrl),
    serviceType: applicableServices.includes("All Services") ? "All Services" : applicableServices[0],
    applicableServices,
    promoCode,
    discountType,
    discountValue,
    discountLabel: body.discountLabel?.trim() || (discountType === "percentage" ? `${discountValue}% off` : `₱${discountValue} off`),
    maxRedemptions: maxRedemptions ?? null,
    audience: body.audience || "all",
    status,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    createdBy: previousPromotion?.createdBy || req.user.id,
  };
};

const notifyUsersOfPromotion = async (promotion) => {
  if (promotion.status !== "active") return;
  if (promotion._id) {
    const existingNotificationCount = await Notification.countDocuments({
      type: "promotion",
      "metadata.promotionId": promotion._id,
    });

    if (existingNotificationCount) return;
  }

  const users = await User.find({
    role: { $in: ["patient", "staff"] },
    status: "active",
  }).select("_id");

  if (!users.length) return;

  const services = promotion.applicableServices?.length ? promotion.applicableServices.join(", ") : promotion.serviceType || "All Services";
  const discount = promotion.discountLabel || (promotion.discountType === "percentage" ? `${promotion.discountValue}% off` : `₱${promotion.discountValue} off`);
  const expiry = promotion.endDate ? ` Valid until ${promotion.endDate.toLocaleDateString()}.` : "";
  const detail = `${promotion.description || "A new clinic promotion is now available."} Code: ${promotion.promoCode}. ${discount} for ${services}.${expiry}`;

  await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      title: `New promotion: ${promotion.title}`,
      message: detail,
      type: "promotion",
      metadata: {
        target: "promotion",
        promotionId: promotion._id,
        promotionTitle: promotion.title,
        promotionCode: promotion.promoCode,
        promotionDiscount: discount,
        promotionServices: services,
        promotionImageUrl: promotion.imageUrl || "",
        promotionStatus: promotion.status,
        promotionEndDate: promotion.endDate || null,
      },
    })),
  );
};

const verifyAdminPasswordForPatientAction = async (req) => {
  if (req.user?.role !== "admin") {
    return;
  }

  const { adminPassword } = req.body || {};

  if (!adminPassword) {
    const error = new Error("Admin password is required to complete this patient action.");
    error.status = 400;
    throw error;
  }

  const admin = await User.findById(req.user.id).select("+passwordHash");
  const isValidPassword = admin?.passwordHash && await verifyPassword(adminPassword, admin.passwordHash);

  if (!isValidPassword) {
    const error = new Error("Admin password is incorrect. No patient changes were saved.");
    error.status = 401;
    throw error;
  }
};

const withoutAdminPassword = (body) => {
  const { adminPassword, ...safeBody } = body || {};
  return safeBody;
};

const uniqueContactEmails = (...emails) => [...new Set(
  emails
    .flat()
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean),
)];

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

const sendPatientTemporaryPasswordEmail = async ({ patient, temporaryPassword }) => {
  if (!temporaryPassword) return;

  const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || "Patient";
  const message = `Hello ${patientName}, your Flores-Dizon Dental Clinic patient account has been created. Your temporary password is ${temporaryPassword}. Please sign in and change your password as soon as possible.`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="color:#082f49;">Flores-Dizon Dental Clinic Patient Account</h2>
      <p>Hello <strong>${patientName}</strong>,</p>
      <p>Your patient account has been created.</p>
      <p>Your temporary password is:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px; color: #0c4a6e;">${temporaryPassword}</p>
      <p>Please sign in with your email address and change your password as soon as possible.</p>
    </div>
  `;

  await sendPatientContactMail({
    patient,
    subject: "Your Temporary Patient Password - Flores-Dizon Dental Clinic",
    message,
    html,
  });
};

const toStockStatus = ({ quantity = 0, reorderLevel = 0 }) => {
  const quantityValue = Number(quantity);
  const reorderValue = Number(reorderLevel || 0);

  if (quantityValue <= 0) {
    return "out_of_stock";
  }

  if (quantityValue <= reorderValue) {
    return "low_stock";
  }

  return "available";
};

const inventoryListHandler = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Inventory.find({}).sort({ itemName: 1 }).skip(skip).limit(limit),
      Inventory.countDocuments({}),
    ]);

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const inventoryUsageHandler = async (req, res, next) => {
  try {
    const quantityUsed = Number(req.body.quantity);

    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
      return res.status(400).json({ message: "Quantity used must be greater than zero." });
    }

    const appointment = req.body.appointmentId
      ? await Appointment.findById(req.body.appointmentId).lean()
      : null;

    if (req.body.appointmentId && !appointment) {
      return res.status(404).json({ message: "Appointment or treatment record was not found." });
    }

    if (appointment && appointment.status !== "completed") {
      return res.status(400).json({ message: "Inventory usage can only be recorded for completed treatments." });
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({ message: "Inventory item was not found." });
    }

    if (Number(inventoryItem.quantity || 0) < quantityUsed) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const treatmentRecord = appointment
      ? await DentalRecord.findOne({ appointment: appointment._id }).sort({ createdAt: -1 }).lean()
      : null;
    const staffName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const updatedQuantity = Number(inventoryItem.quantity || 0) - quantityUsed;
    const usageEntry = {
      quantity: quantityUsed,
      patient: appointment?.patient,
      patientName: appointment?.patientName || req.body.patientName || "",
      appointment: appointment?._id,
      treatmentRecord: treatmentRecord?._id,
      dentistName: appointment?.dentistName || req.body.dentistName || "",
      staffMember: req.user.id,
      staffName,
      note: String(req.body.note || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = updatedQuantity;
    inventoryItem.status = toStockStatus({
      quantity: updatedQuantity,
      reorderLevel: inventoryItem.reorderLevel,
    });
    inventoryItem.usageHistory.push(usageEntry);
    inventoryItem.transactionHistory.push({
      type: "treatment_usage",
      quantityBefore: Number(inventoryItem.quantity || 0) + quantityUsed,
      quantityChanged: -quantityUsed,
      quantityAfter: updatedQuantity,
      patientName: usageEntry.patientName,
      appointment: appointment?._id,
      dentistName: usageEntry.dentistName,
      processedBy: req.user.id,
      processedByName: usageEntry.staffName,
      notes: usageEntry.note,
      recordedAt: usageEntry.recordedAt,
    });
    await inventoryItem.save();

    await AuditLog.create({
      action: "Inventory usage recorded",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        inventoryItem: inventoryItem.itemName,
        quantityDeducted: quantityUsed,
        remainingQuantity: updatedQuantity,
        patient: usageEntry.patientName,
        appointmentId: appointment?._id,
        treatmentRecordId: treatmentRecord?._id,
        dentist: usageEntry.dentistName,
        staffMember: usageEntry.staffName,
      },
    });

    res.json({
      message: "Inventory usage recorded and stock updated.",
      item: inventoryItem,
    });
  } catch (error) {
    next(error);
  }
};

const inventorySaleHandler = async (req, res, next) => {
  try {
    const quantitySold = Number(req.body.quantity);

    if (!Number.isFinite(quantitySold) || quantitySold <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than zero." });
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem || inventoryItem.isActive === false) {
      return res.status(404).json({ message: "Inventory item is unavailable." });
    }

    if (Number(inventoryItem.quantity || 0) < quantitySold) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const appointment = req.body.appointmentId
      ? await Appointment.findById(req.body.appointmentId).lean()
      : null;

    if (req.body.appointmentId && !appointment) {
      return res.status(404).json({ message: "Connected appointment was not found." });
    }

    if (inventoryItem.requiresPrescription) {
      const prescriptionReference = String(req.body.prescriptionReference || "").trim();
      const dentistName = String(req.body.dentistName || appointment?.dentistName || "").trim();

      if (req.user.role === "staff" && (!prescriptionReference || !dentistName)) {
        return res.status(400).json({ message: "A dentist prescription or approval is required before releasing this item." });
      }
    }

    const unitPrice = Math.max(Number(inventoryItem.sellingPrice ?? inventoryItem.purchasePrice ?? 0) || 0, 0);
    const totalAmount = Math.round(unitPrice * quantitySold * 100) / 100;
    const quantityBefore = Number(inventoryItem.quantity || 0);
    const quantityAfter = quantityBefore - quantitySold;
    const transactionId = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const processedByName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const transaction = {
      transactionId,
      type: "sale",
      quantityBefore,
      quantityChanged: -quantitySold,
      quantityAfter,
      unitPrice,
      totalAmount,
      patientName: String(req.body.patientName || appointment?.patientName || "").trim(),
      appointment: appointment?._id,
      prescriptionReference: String(req.body.prescriptionReference || "").trim(),
      dentistName: String(req.body.dentistName || appointment?.dentistName || "").trim(),
      processedBy: req.user.id,
      processedByName,
      notes: String(req.body.notes || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = quantityAfter;
    inventoryItem.status = toStockStatus({
      quantity: quantityAfter,
      reorderLevel: inventoryItem.reorderLevel,
    });
    inventoryItem.transactionHistory.push(transaction);
    await inventoryItem.save();

    await AuditLog.create({
      action: "Inventory sale recorded",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        transactionId,
        inventoryItem: inventoryItem.itemName,
        quantitySold,
        unitPrice,
        totalAmount,
        patientName: transaction.patientName,
        appointmentId: appointment?._id,
        prescriptionReference: transaction.prescriptionReference,
        dentistName: transaction.dentistName,
        quantityBefore,
        quantityAfter,
      },
    });

    res.json({
      message: "Sale/release recorded and stock updated.",
      transactionId,
      item: inventoryItem,
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

const inventoryAdjustmentHandler = async (req, res, next) => {
  try {
    const type = req.body.type === "deduct" ? "manual_adjustment" : "restock";
    const quantity = Number(req.body.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Adjustment quantity must be greater than zero." });
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({ message: "Inventory item was not found." });
    }

    const quantityBefore = Number(inventoryItem.quantity || 0);
    const quantityChanged = type === "restock" ? quantity : -quantity;
    const quantityAfter = quantityBefore + quantityChanged;

    if (quantityAfter < 0) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const processedByName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const transaction = {
      type,
      quantityBefore,
      quantityChanged,
      quantityAfter,
      processedBy: req.user.id,
      processedByName,
      notes: String(req.body.note || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = quantityAfter;
    inventoryItem.status = toStockStatus({ quantity: quantityAfter, reorderLevel: inventoryItem.reorderLevel });
    inventoryItem.transactionHistory.push(transaction);
    await inventoryItem.save();

    await AuditLog.create({
      action: type === "restock" ? "Inventory restocked" : "Inventory manually adjusted",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        inventoryItem: inventoryItem.itemName,
        transactionType: type,
        quantityBefore,
        quantityChanged,
        quantityAfter,
        notes: transaction.notes,
      },
    });

    res.json({
      message: type === "restock" ? "Inventory restocked successfully." : "Inventory deducted successfully.",
      item: inventoryItem,
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

const normalizeClinicSettingsBody = (body = {}) => {
  const normalized = { ...body };

  if (Array.isArray(body.services)) {
    normalized.services = body.services.map((service, index) => {
      const serviceName = String(service.serviceName || "").trim();
      const price = Number(service.price ?? 0);
      const duration = Number(service.duration ?? 0);

      if (!serviceName) {
        const error = new Error("Service name is required.");
        error.status = 400;
        error.errors = { [`services.${index}.serviceName`]: "Service name is required." };
        throw error;
      }

      if (!Number.isFinite(price) || price < 0) {
        const error = new Error("Service price must be a valid non-negative amount.");
        error.status = 400;
        error.errors = { [`services.${index}.price`]: "Service price must be a valid non-negative amount." };
        throw error;
      }

      if (!Number.isFinite(duration) || duration < 1) {
        const error = new Error("Service duration must be a valid number of minutes.");
        error.status = 400;
        error.errors = { [`services.${index}.duration`]: "Service duration must be a valid number of minutes." };
        throw error;
      }

      return {
        ...service,
        serviceName,
        category: String(service.category || "General").trim() || "General",
        price,
        duration,
        status: service.status === "inactive" ? "inactive" : "active",
      };
    });
  }

  if (body.systemPreferences && typeof body.systemPreferences === "object") {
    const preferences = body.systemPreferences;
    const theme = ["light", "dark", "system"].includes(preferences.theme) ? preferences.theme : "light";
    const language = ["English", "Filipino"].includes(preferences.language) ? preferences.language : "English";
    const timeZone = ["Asia/Manila", "UTC"].includes(preferences.timeZone) ? preferences.timeZone : "Asia/Manila";
    const dateFormat = ["MMM d, yyyy", "MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"].includes(preferences.dateFormat)
      ? preferences.dateFormat
      : "MMM d, yyyy";
    const timeFormat = ["12", "24"].includes(String(preferences.timeFormat)) ? String(preferences.timeFormat) : "12";

    normalized.systemPreferences = {
      theme,
      language,
      timeZone,
      dateFormat,
      timeFormat,
    };
  }

  return normalized;
};

const sanitizePatientDentalRecord = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  delete value.clinicalNotes;
  return value;
};

const escapeRegex = (value) => String(value || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const providerName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const parseReportDate = (value, endOfDay = false) => {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(...String(value).split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)))
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return parsed;
};

const patientFullName = (patient) => [patient?.firstName, patient?.lastName].filter(Boolean).join(" ").trim();
const patientFullNameWithMiddle = (patient) => [patient?.firstName, patient?.middleName, patient?.lastName].filter(Boolean).join(" ").trim();

const getPatientDisplayStatus = (patient) => {
  if ((patient.status || "active") === "inactive") return "Inactive";
  return patient.registrationStatus === "verified" ? "Verified" : "New";
};

const formatScheduleLabel = (appointment) => {
  if (!appointment) return "";
  const date = appointment.appointmentDate ? new Date(appointment.appointmentDate).toLocaleDateString() : "";
  return [date, appointment.appointmentTime].filter(Boolean).join(" ");
};

const patientMatchesSearch = (patient, search) => {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) return true;
  return [
    patientFullName(patient),
    patient.patientId,
    patient.contactNumber,
    patient.email,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
};

const buildCarePatientResponse = (patient, appointments = [], records = []) => {
  const patientName = patientFullName(patient);
  const patientEmail = String(patient.email || "").toLowerCase();
  const patientAppointments = appointments
    .filter((appointment) => {
      const appointmentPatient = String(appointment.patient || appointment.patient?._id || "");
      return (
        appointmentPatient === String(patient._id) ||
        (patientEmail && String(appointment.email || "").toLowerCase() === patientEmail) ||
        String(appointment.patientName || "").trim().toLowerCase() === patientName.toLowerCase()
      );
    })
    .sort((left, right) => new Date(right.appointmentDate || 0) - new Date(left.appointmentDate || 0));
  const patientRecords = records
    .filter((record) => {
      const recordPatient = String(record.patient || record.patient?._id || "");
      return recordPatient === String(patient._id) || String(record.patientName || "").trim().toLowerCase() === patientName.toLowerCase();
    })
    .sort((left, right) => new Date(right.visitDate || right.createdAt || 0) - new Date(left.visitDate || left.createdAt || 0));
  const now = new Date();
  const pastAppointments = patientAppointments
    .filter((appointment) => new Date(appointment.appointmentDate || 0) <= now)
    .sort((left, right) => new Date(right.appointmentDate || 0) - new Date(left.appointmentDate || 0));
  const futureAppointments = patientAppointments
    .filter((appointment) => new Date(appointment.appointmentDate || 0) >= now)
    .sort((left, right) => new Date(left.appointmentDate || 0) - new Date(right.appointmentDate || 0));

  return {
    ...patient.toObject(),
    fullName: patientName,
    displayStatus: getPatientDisplayStatus(patient),
    lastVisit: formatScheduleLabel(pastAppointments[0]),
    nextAppointment: formatScheduleLabel(futureAppointments[0]),
    appointmentHistory: patientAppointments,
    treatmentRecords: patientRecords.filter((record) => record.recordType !== "clinical_note"),
    clinicalNotes: patientRecords.filter((record) => record.recordType === "clinical_note" || clinicalNoteHasContent(record)),
  };
};

const getProviderCareData = async (req) => {
  const email = String(req.user.email || "").toLowerCase();

  if (req.user.role === "staff") {
    const [appointments, records, patients] = await Promise.all([
      Appointment.find({}).sort({ appointmentDate: -1 }).lean(),
      DentalRecord.find({}).sort({ visitDate: -1, createdAt: -1 }).lean(),
      Patient.find({}).sort({ updatedAt: -1 }),
    ]);

    return { appointments, records, patients };
  }

  const appointmentFilters = [
    { statusUpdatedBy: req.user.id },
    { completedBy: req.user.id },
    { noShowBy: req.user.id },
    { statusUpdatedByEmail: email },
    { completedByEmail: email },
    { noShowByEmail: email },
  ];
  const recordFilters = [
    { createdBy: req.user.id },
    { createdByEmail: email },
  ];

  const appointmentQuery = { $or: appointmentFilters };
  const recordQuery = { $or: recordFilters };

  const [appointments, records, assignedPatients] = await Promise.all([
    Appointment.find(appointmentQuery).sort({ appointmentDate: -1 }).lean(),
    DentalRecord.find(recordQuery).sort({ visitDate: -1, createdAt: -1 }).lean(),
    Patient.find({ assignedDentist: req.user.id }).sort({ updatedAt: -1 }),
  ]);
  const patientIds = new Set(assignedPatients.map((patient) => String(patient._id)));
  const patientEmails = new Set(assignedPatients.map((patient) => String(patient.email || "").toLowerCase()).filter(Boolean));
  const patientNames = new Set(assignedPatients.map((patient) => patientFullName(patient).toLowerCase()).filter(Boolean));

  appointments.forEach((appointment) => {
    if (appointment.patient) patientIds.add(String(appointment.patient));
    if (appointment.email) patientEmails.add(String(appointment.email).toLowerCase());
    if (appointment.patientName) patientNames.add(String(appointment.patientName).toLowerCase());
  });

  records.forEach((record) => {
    if (record.patient) patientIds.add(String(record.patient));
    if (record.patientName) patientNames.add(String(record.patientName).toLowerCase());
  });

  const patientQuery = [];
  if (patientIds.size) patientQuery.push({ _id: { $in: [...patientIds] } });
  if (patientEmails.size) patientQuery.push({ email: { $in: [...patientEmails] } });

  const patients = patientQuery.length
    ? await Patient.find({ $or: patientQuery }).sort({ updatedAt: -1 })
    : [];
  const missingNamePatients = patientNames.size
    ? (await Patient.find({}).sort({ updatedAt: -1 })).filter((patient) => patientNames.has(patientFullName(patient).toLowerCase()))
    : [];
  const merged = new Map();
  [...assignedPatients, ...patients, ...missingNamePatients].forEach((patient) => merged.set(String(patient._id), patient));

  return {
    appointments,
    records,
    patients: [...merged.values()],
  };
};

const clinicalNoteHasContent = (record) => {
  const notes = record.clinicalNotes || {};
  return [notes.observation, notes.assessment, notes.recommendations, notes.additionalNotes]
    .some((value) => String(value || "").trim());
};

const hasPatientScopedRecordLookup = (req) => (
  (req.query.appointment && mongoose.Types.ObjectId.isValid(req.query.appointment))
  || (req.query.patient && mongoose.Types.ObjectId.isValid(req.query.patient))
  || Boolean(String(req.query.patientName || "").trim())
);

const buildPatientNameConditions = (value) => {
  const name = String(value || "").trim();
  if (!name) return [];
  const tokens = name.split(/\s+/).filter(Boolean);
  const conditions = [{ patientName: new RegExp(escapeRegex(name), "i") }];

  if (tokens.length > 1) {
    conditions.push({
      patientName: new RegExp(`${escapeRegex(tokens[0])}.*${escapeRegex(tokens[tokens.length - 1])}`, "i"),
    });
  }

  return conditions;
};

const normalizePersonName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const enrichRecordsWithPatientInfo = async (records = []) => {
  const values = records.map((record) => (record?.toObject ? record.toObject() : { ...record }));
  const needsPatientLookup = values.some((record) => (
    record?.patientName
    && !record?.patientId
    && !(record?.patient && typeof record.patient === "object" && record.patient.patientId)
  ));

  if (!needsPatientLookup) return values;

  const patients = await Patient.find({})
    .select("patientId firstName middleName lastName dateOfBirth gender")
    .lean();

  const findPatientByName = (recordName) => {
    const normalizedRecordName = normalizePersonName(recordName);
    if (!normalizedRecordName) return null;

    return patients.find((patient) => {
      const firstName = normalizePersonName(patient.firstName);
      const lastName = normalizePersonName(patient.lastName);
      const nameOptions = [
        patientFullName(patient),
        patientFullNameWithMiddle(patient),
      ].map(normalizePersonName).filter(Boolean);

      return nameOptions.includes(normalizedRecordName)
        || (firstName && lastName && normalizedRecordName.includes(firstName) && normalizedRecordName.includes(lastName));
    }) || null;
  };

  return values.map((record) => {
    if (record?.patientId || (record?.patient && typeof record.patient === "object" && record.patient.patientId)) {
      return record;
    }
    const patient = findPatientByName(record.patientName);
    return patient ? { ...record, patient } : record;
  });
};

const normalizeClinicalAttachments = (attachments, user) => {
  if (!Array.isArray(attachments)) return [];
  if (user.role !== "admin" && attachments.length) {
    const error = new Error("Only administrators can add clinical note attachments.");
    error.status = 403;
    throw error;
  }
  if (attachments.length > 8) {
    const error = new Error("A clinical note can contain up to 8 attachments.");
    error.status = 400;
    throw error;
  }

  return attachments.map((attachment) => {
    if (!isManagedClinicalFile(attachment)) {
      const error = new Error("Upload each clinical attachment to secure clinic storage before saving.");
      error.status = 400;
      throw error;
    }
    return {
      name: String(attachment.name || "Clinical attachment").trim().slice(0, 180),
      path: String(attachment.path),
      bucket: String(attachment.bucket),
      mimeType: String(attachment.mimeType),
      size: Number(attachment.size) || undefined,
      category: attachment.category === "xray" ? "xray" : "file",
      uploadedBy: user.id,
      uploadedAt: attachment.uploadedAt || new Date(),
    };
  });
};

const sanitizeClinicalNote = async (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  const attachments = await Promise.all((value.attachments || []).map(async (attachment) => ({
    id: attachment._id,
    name: attachment.name,
    path: attachment.path,
    bucket: attachment.bucket,
    mimeType: attachment.mimeType,
    size: attachment.size,
    category: attachment.category,
    uploadedAt: attachment.uploadedAt,
    url: await createClinicalFileSignedUrl(attachment).catch(() => ""),
  })));
  return {
    id: value._id,
    recordType: value.recordType || "clinical_note",
    patient: value.patient,
    patientSnapshot: value.patient && typeof value.patient === "object"
      ? {
          id: value.patient._id,
          patientId: value.patient.patientId,
          dateOfBirth: value.patient.dateOfBirth,
          gender: value.patient.gender,
        }
      : null,
    patientId: value.patientId || (value.patient && typeof value.patient === "object" ? value.patient.patientId : undefined),
    appointment: value.appointment,
    patientName: value.patientName,
    noteType: value.noteType || "Clinical Note",
    visitDate: value.visitDate,
    clinicalNotes: value.clinicalNotes || {},
    attachments,
    clinicalFollowUp: value.clinicalFollowUp || null,
    createdBy: value.createdBy,
    createdByName: value.createdByName,
    createdByEmail: value.createdByEmail,
    dentistName: value.dentistName,
    servicePerformed: value.servicePerformed,
    procedure: value.procedure,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const clinicalNoteScope = (req, ownOnly = false) => {
  const name = providerName(req.user);
  const ownFilters = [
    { createdBy: req.user.id },
    { createdByEmail: req.user.email },
  ];

  if (hasPatientScopedRecordLookup(req) && ["admin", "staff"].includes(req.user.role)) {
    return {};
  }

  if (req.user.role === "admin" && !ownOnly) return {};
  return { $or: ownFilters };
};

const buildClinicalNoteQuery = (req) => {
  const ownOnly = req.query.scope !== "all";
  const query = clinicalNoteScope(req, ownOnly);
  const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
  const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { recordType: "clinical_note" },
      { "clinicalNotes.observation": { $nin: [null, ""] } },
      { "clinicalNotes.assessment": { $nin: [null, ""] } },
      { "clinicalNotes.recommendations": { $nin: [null, ""] } },
      { "clinicalNotes.additionalNotes": { $nin: [null, ""] } },
    ],
  });

  if (req.query.startDate && !startDate) {
    const error = new Error("Start date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (req.query.endDate && !endDate) {
    const error = new Error("End date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (startDate || endDate) {
    query.$and.push({
      visitDate: {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      },
    });
  }

  if (req.query.provider && req.user.role === "admin") {
    const pattern = new RegExp(escapeRegex(req.query.provider), "i");
    query.$and.push({ $or: [{ createdByName: pattern }, { createdByEmail: pattern }, { dentistName: pattern }] });
  }

  if (req.query.appointment && mongoose.Types.ObjectId.isValid(req.query.appointment)) {
    query.$and.push({ appointment: req.query.appointment });
  }

  if (req.query.patient) {
    if (!mongoose.Types.ObjectId.isValid(req.query.patient)) {
      const error = new Error("Patient reference is invalid.");
      error.status = 400;
      throw error;
    }
    query.$and.push({ patient: req.query.patient });
  }

  if (req.query.patientName) {
    const conditions = buildPatientNameConditions(req.query.patientName);
    if (conditions.length) query.$and.push({ $or: conditions });
  }

  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search), "i");
    query.$and.push({
      $or: [
        { patientName: pattern },
        { noteType: pattern },
        { servicePerformed: pattern },
        { procedure: pattern },
        { createdByName: pattern },
        { dentistName: pattern },
        { "clinicalNotes.observation": pattern },
        { "clinicalNotes.assessment": pattern },
        { "clinicalNotes.recommendations": pattern },
        { "clinicalNotes.additionalNotes": pattern },
      ],
    });
  }

  if (!query.$and.length) delete query.$and;
  return query;
};

const auditClinicalNoteAction = (req, record, action) => AuditLog.create({
  action,
  entityType: "Clinical Notes",
  entityId: record?._id,
  performedBy: req.user.id,
  performedByEmail: req.user.email,
  metadata: {
    userName: providerName(req.user),
    patient: record?.patient,
    patientName: record?.patientName,
    appointment: record?.appointment,
  },
}).catch(() => {});

const sanitizeTreatmentRecord = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  return {
    id: value._id,
    recordType: value.recordType || "treatment_record",
    patient: value.patient,
    appointment: value.appointment,
    patientName: value.patientName,
    contactNumber: value.contactNumber,
    dateOfBirth: value.dateOfBirth,
    visitDate: value.visitDate,
    procedure: value.procedure || value.servicePerformed || value.treatment,
    servicePerformed: value.servicePerformed,
    toothNumber: value.toothNumber,
    diagnosis: value.diagnosis,
    treatmentPerformed: value.treatmentPerformed || value.treatment,
    materialsUsed: value.materialsUsed,
    treatmentStatus: value.treatmentStatus || "completed",
    recommendations: value.recommendations,
    nextVisitRecommendation: value.nextVisitRecommendation,
    notes: value.notes,
    appointmentSnapshot: value.appointmentSnapshot || null,
    dentistName: value.dentistName,
    createdBy: value.createdBy,
    createdByName: value.createdByName,
    createdByEmail: value.createdByEmail,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const treatmentRecordHasContent = (record) => [
  record?.procedure,
  record?.servicePerformed,
  record?.treatment,
  record?.treatmentPerformed,
  record?.diagnosis,
  record?.materialsUsed,
  record?.recommendations,
  record?.nextVisitRecommendation,
  record?.notes,
].some((value) => String(value || "").trim());

const treatmentRecordScope = (req, ownOnly = false) => {
  const name = providerName(req.user);
  const ownFilters = [
    { createdBy: req.user.id },
    { createdByEmail: req.user.email },
  ];

  if (req.user.role === "admin" && name) {
    ownFilters.push({ dentistName: name });
  }

  if (hasPatientScopedRecordLookup(req) && ["admin", "staff"].includes(req.user.role)) {
    return {};
  }

  if (req.user.role === "admin" && !ownOnly) return {};
  return { $or: ownFilters };
};

const buildTreatmentRecordQuery = (req) => {
  const ownOnly = req.query.scope !== "all";
  const query = treatmentRecordScope(req, ownOnly);
  const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
  const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { recordType: "treatment_record" },
      { procedure: { $nin: [null, ""] } },
      { servicePerformed: { $nin: [null, ""] } },
      { treatment: { $nin: [null, ""] } },
      { treatmentPerformed: { $nin: [null, ""] } },
      { diagnosis: { $nin: [null, ""] } },
    ],
  });

  if (req.query.startDate && !startDate) {
    const error = new Error("Start date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (req.query.endDate && !endDate) {
    const error = new Error("End date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (startDate || endDate) {
    query.$and.push({
      visitDate: {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      },
    });
  }

  if (req.query.provider && req.user.role === "admin") {
    const pattern = new RegExp(escapeRegex(req.query.provider), "i");
    query.$and.push({ $or: [{ createdByName: pattern }, { createdByEmail: pattern }, { dentistName: pattern }] });
  }

  if (req.query.status && req.query.status !== "all") {
    query.$and.push({ treatmentStatus: req.query.status });
  }

  if (req.query.procedure && req.query.procedure !== "all") {
    const pattern = new RegExp(escapeRegex(req.query.procedure), "i");
    query.$and.push({ $or: [{ procedure: pattern }, { servicePerformed: pattern }, { treatment: pattern }] });
  }

  if (req.query.appointment) {
    if (!mongoose.Types.ObjectId.isValid(req.query.appointment)) {
      const error = new Error("Appointment reference is invalid.");
      error.status = 400;
      throw error;
    }
    query.$and.push({ appointment: req.query.appointment });
  }

  if (req.query.patient) {
    if (!mongoose.Types.ObjectId.isValid(req.query.patient)) {
      const error = new Error("Patient reference is invalid.");
      error.status = 400;
      throw error;
    }
    query.$and.push({ patient: req.query.patient });
  }

  if (req.query.patientName) {
    const conditions = buildPatientNameConditions(req.query.patientName);
    if (conditions.length) query.$and.push({ $or: conditions });
  }

  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search), "i");
    query.$and.push({
      $or: [
        { patientName: pattern },
        { procedure: pattern },
        { servicePerformed: pattern },
        { treatment: pattern },
        { diagnosis: pattern },
        { treatmentPerformed: pattern },
        { dentistName: pattern },
        { createdByName: pattern },
      ],
    });
  }

  if (!query.$and.length) delete query.$and;
  return query;
};

const auditTreatmentRecordAction = (req, record, action) => AuditLog.create({
  action,
  entityType: "Treatment Records",
  entityId: record?._id,
  performedBy: req.user.id,
  performedByEmail: req.user.email,
  metadata: {
    userName: providerName(req.user),
    patient: record?.patient,
    patientName: record?.patientName,
    appointment: record?.appointment,
    treatmentRecordId: record?._id,
  },
}).catch(() => {});

const sanitizePublicSettings = (settings) => ({
  clinicName: settings?.clinicName || "Flores-Dizon Dental Clinic",
  address: settings?.address || "",
  contactNumber: settings?.contactNumber || "",
  email: settings?.email || "",
  operatingHours: settings?.operatingHours || "Monday to Saturday, 9:00 AM - 5:00 PM",
  clinicLogo: settings?.clinicLogo || "",
  services: (settings?.services || []).map((service) => ({
    id: service._id,
    serviceName: service.serviceName,
    category: service.category,
    duration: service.duration,
    price: service.price,
    status: service.status,
  })),
  appointmentSettings: {
    openingTime: "09:00",
    closingTime: "17:00",
    appointmentDuration: 30,
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    maxAppointmentsPerDay: 20,
    bufferTime: 10,
    allowWeekendAppointments: true,
    allowOnlineBooking: true,
    ...(settings?.appointmentSettings || {}),
  },
  systemPreferences: {
    theme: settings?.systemPreferences?.theme || "light",
    language: settings?.systemPreferences?.language || "English",
    timeZone: settings?.systemPreferences?.timeZone || "Asia/Manila",
    dateFormat: settings?.systemPreferences?.dateFormat || "MMM d, yyyy",
    timeFormat: settings?.systemPreferences?.timeFormat || "12",
  },
  security: {
    sessionTimeout: settings?.security?.sessionTimeout || 30,
  },
  notifications: {
    appointmentConfirmationEmail: settings?.notifications?.appointmentConfirmationEmail ?? true,
    appointmentReminderEmail: settings?.notifications?.appointmentReminderEmail ?? true,
    appointmentCancellationNotification: settings?.notifications?.appointmentCancellationNotification ?? true,
    lowInventoryAlert: settings?.notifications?.lowInventoryAlert ?? true,
    newAppointmentAlertForAdmin: settings?.notifications?.newAppointmentAlertForAdmin ?? true,
  },
});

router.get("/", (req, res) => {
  res.json({
    modules: [
      "auth",
      "dashboard",
      "users",
      "patients",
      "appointments",
      "dentalrecords",
      "inventory",
      "feedback",
      "promotions",
      "notifications",
      "subscribers",
    ],
  });
});

router.use("/auth", authRoutes);
router.get("/public-settings", async (req, res, next) => {
  try {
    const settings = await ClinicSettings.findOne({}).sort({ updatedAt: -1 });
    res.json(sanitizePublicSettings(settings));
  } catch (error) {
    next(error);
  }
});
router.use("/dashboard", dashboardRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/users", userRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/messages", messageRoutes);
router.use("/uploads", uploadRoutes);
router.use(authenticate);
router.use("/users", authorize("admin"), createCrudRouter(User, { hiddenFields: "-passwordHash" }));
router.get("/patients/my-care", authorize("staff"), async (req, res, next) => {
  try {
    const { appointments, records, patients } = await getProviderCareData(req);
    const filteredPatients = patients
      .map((patient) => buildCarePatientResponse(patient, appointments, records))
      .filter((patient) => patientMatchesSearch(patient, req.query.search));

    res.json({
      data: filteredPatients,
      total: filteredPatients.length,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/patients/my-care/:id", authorize("staff"), async (req, res, next) => {
  try {
    const { appointments, records, patients } = await getProviderCareData(req);
    const patient = patients.find((item) => String(item._id) === String(req.params.id));

    if (!patient) {
      return res.status(404).json({ message: "Patient record is not available for your account." });
    }

    res.json(buildCarePatientResponse(patient, appointments, records));
  } catch (error) {
    next(error);
  }
});

router.post("/patients", authorize("admin", "staff"), async (req, res, next) => {
  try {
    await verifyAdminPasswordForPatientAction(req);

    const temporaryPassword = String(req.body.temporaryPassword || DEFAULT_PATIENT_TEMPORARY_PASSWORD).trim();
    const username = String(req.body.username || "").trim();

    if (temporaryPassword && temporaryPassword.length < 8) {
      const error = new Error("Temporary password must be at least 8 characters.");
      error.status = 400;
      error.errors = { temporaryPassword: "Temporary password must be at least 8 characters." };
      throw error;
    }

    if (username && await User.findOne({ username }).select("_id").lean()) {
      const error = new Error("This username is already registered.");
      error.status = 409;
      error.errors = { username: "This username is already registered." };
      throw error;
    }

    const patient = await Patient.create(await preparePatientCreateBody(withoutAdminPassword(req.body)));

    if (temporaryPassword && patient.email && !patient.userId) {
      const passwordHash = await hashPasswordScrypt(temporaryPassword);
      const user = await User.create({
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        username: username || undefined,
        contactNumber: patient.contactNumber,
        passwordHash,
        role: "patient",
        accountStatus: patient.registrationStatus === "verified" ? "verified_patient" : "unverified_user",
        status: patient.status || "active",
      });
      patient.userId = user._id;
      if (username) patient.username = username;
      await patient.save();
      await sendPatientTemporaryPasswordEmail({ patient, temporaryPassword });
    }

    await AuditLog.create({
      action: "Patient Created",
      entityType: "Patient",
      entityId: patient._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        patientId: patient.patientId,
        status: getPatientDisplayStatus(patient),
        createdByRole: req.user.role,
      },
    });

    res.status(201).json(patient);
  } catch (error) {
    next(error);
  }
});

router.use(
  "/patients",
  authorize("admin"),
  createCrudRouter(Patient, {
    beforeCreate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      const temporaryPassword = String(body.temporaryPassword || DEFAULT_PATIENT_TEMPORARY_PASSWORD).trim();
      if (temporaryPassword && temporaryPassword.length < 8) {
        const error = new Error("Temporary password must be at least 8 characters.");
        error.status = 400;
        error.errors = { temporaryPassword: "Temporary password must be at least 8 characters." };
        throw error;
      }
      if (body.username && await User.findOne({ username: String(body.username).trim() }).select("_id").lean()) {
        const error = new Error("This username is already registered.");
        error.status = 409;
        error.errors = { username: "This username is already registered." };
        throw error;
      }
      return preparePatientCreateBody(withoutAdminPassword(body));
    },
    afterCreate: async (patient, req) => {
      const temporaryPassword = String(req.body.temporaryPassword || DEFAULT_PATIENT_TEMPORARY_PASSWORD).trim();
      const username = String(req.body.username || "").trim();

      if (temporaryPassword && patient.email && !patient.userId) {
        const passwordHash = await hashPasswordScrypt(temporaryPassword);
        const user = await User.create({
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          username: username || undefined,
          contactNumber: patient.contactNumber,
          passwordHash,
          role: "patient",
          accountStatus: patient.registrationStatus === "verified" ? "verified_patient" : "unverified_user",
          status: patient.status || "active",
        });
        patient.userId = user._id;
        if (username) patient.username = username;
        await patient.save();
        await sendPatientTemporaryPasswordEmail({ patient, temporaryPassword });
      }

      await AuditLog.create({
        action: "Patient Created",
        entityType: "Patient",
        entityId: patient._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: { patientId: patient.patientId, status: getPatientDisplayStatus(patient) },
      });
    },
    beforeUpdate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      const existingPatient = await Patient.findById(req.params.id).lean();
      if (!existingPatient) {
        const error = new Error("Patient record not found.");
        error.status = 404;
        throw error;
      }
      const nextBody = withoutAdminPassword(body);
      const nextStatus = nextBody.status || existingPatient.status;
      const nextRegistrationStatus = nextBody.registrationStatus || existingPatient.registrationStatus;
      const statusChanged = nextStatus !== existingPatient.status || nextRegistrationStatus !== existingPatient.registrationStatus;
      const isStatusOnlyUpdate = Object.keys(nextBody).every((key) => ["status", "registrationStatus"].includes(key));

      if (statusChanged) {
        nextBody.verificationHistory = [
          ...(existingPatient.verificationHistory || []),
          {
            status: nextStatus === "inactive" ? "inactive" : nextRegistrationStatus === "verified" ? "verified" : "new",
            changedBy: req.user.id,
            changedByEmail: req.user.email,
            note: "Patient status updated by admin.",
            changedAt: new Date(),
          },
        ];
        if (nextRegistrationStatus === "verified" && !existingPatient.verifiedAt) {
          nextBody.verifiedAt = new Date();
        }
      }

      if (isStatusOnlyUpdate) {
        return {
          status: nextStatus,
          registrationStatus: nextRegistrationStatus,
          ...(nextBody.verificationHistory ? { verificationHistory: nextBody.verificationHistory } : {}),
          ...(nextBody.verifiedAt ? { verifiedAt: nextBody.verifiedAt } : {}),
        };
      }

      return preparePatientUpdateBody(
        { ...existingPatient, ...nextBody },
        { excludePatientId: req.params.id, excludeUserId: existingPatient?.userId },
      );
    },
    afterUpdate: async (patient, previousPatient, req) => {
      const statusChanged = patient.status !== previousPatient?.status
        || patient.registrationStatus !== previousPatient?.registrationStatus;

      if (statusChanged) {
        let linkedUser = patient.userId
          ? await User.findById(patient.userId)
          : null;

        if (!linkedUser) {
          const accountMatches = [];
          if (patient.email) accountMatches.push({ email: patient.email });
          if (patient.username) accountMatches.push({ username: patient.username });
          if (patient.contactNumber) {
            accountMatches.push({
              contactNumber: patient.contactNumber,
              firstName: patient.firstName,
              lastName: patient.lastName,
            });
          }

          if (accountMatches.length) {
            linkedUser = await User.findOne({ role: "patient", $or: accountMatches });
          }
        }

        if (linkedUser) {
          linkedUser.status = patient.status;
          linkedUser.accountStatus = patient.status === "inactive"
            ? "inactive"
            : patient.registrationStatus === "verified"
              ? "verified_patient"
              : "unverified_user";
          await linkedUser.save();

          if (!patient.userId) {
            patient.userId = linkedUser._id;
            await patient.save();
          }
        }
      }

      await AuditLog.create({
        action: statusChanged ? "Patient Status Changed" : "Patient Updated",
        entityType: "Patient",
        entityId: patient._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          patientId: patient.patientId,
          previousStatus: previousPatient?.status === "inactive" ? "Inactive" : previousPatient?.registrationStatus === "verified" ? "Verified" : "New",
          nextStatus: patient.status === "inactive" ? "Inactive" : patient.registrationStatus === "verified" ? "Verified" : "New",
        },
      });
    },
    beforeDelete: async (id, req) => {
      await verifyAdminPasswordForPatientAction(req);
      await AuditLog.create({
        action: "Patient Deleted",
        entityType: "Patient",
        entityId: id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
      });
    },
  }),
);
router.get("/dentalrecords/provider/reports", authorize("staff"), async (req, res, next) => {
  try {
    const name = providerName(req.user);
    const query = {
      $or: [
        { createdBy: req.user.id },
        { createdByEmail: req.user.email },
      ],
    };
    const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

    if (req.query.startDate && !startDate) {
      return res.status(400).json({ message: "Start date filter is invalid." });
    }

    if (req.query.endDate && !endDate) {
      return res.status(400).json({ message: "End date filter is invalid." });
    }

    if (startDate || endDate) {
      query.$and = query.$and || [];
      query.$and.push({
        visitDate: {
          ...(startDate ? { $gte: startDate } : {}),
          ...(endDate ? { $lte: endDate } : {}),
        },
      });
    }

    if (req.query.search) {
      const pattern = new RegExp(escapeRegex(req.query.search), "i");
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { patientName: pattern },
          { servicePerformed: pattern },
          { treatment: pattern },
          { treatmentPerformed: pattern },
          { procedure: pattern },
          { diagnosis: pattern },
        ],
      });
    }

    const records = await DentalRecord.find(query)
      .sort({ visitDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ data: records });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/clinical-notes", authorize("admin", "staff"), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const query = buildClinicalNoteQuery(req);
    const [records, total] = await Promise.all([
      DentalRecord.find(query)
        .populate("patient", "patientId dateOfBirth gender")
        .sort({ visitDate: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DentalRecord.countDocuments(query),
    ]);

    res.json({
      data: await Promise.all(records.map(sanitizeClinicalNote)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/clinical-notes", authorize("admin", "staff"), async (req, res, next) => {
  try {
    const patientName = String(req.body.patientName || "").trim();
    const notes = req.body.clinicalNotes || {};
    const appointmentId = String(req.body.appointment || "").trim();
    const followUp = req.body.followUp || {};
    const attachments = normalizeClinicalAttachments(req.body.attachments, req.user);

    if (!patientName) {
      return res.status(400).json({ message: "Patient name is required.", errors: { patientName: "Patient name is required." } });
    }

    const clinicalNotes = {
      observation: String(notes.observation || "").trim(),
      assessment: String(notes.assessment || "").trim(),
      recommendations: String(notes.recommendations || "").trim(),
      additionalNotes: String(notes.additionalNotes || "").trim(),
    };

    if (!Object.values(clinicalNotes).some(Boolean)) {
      return res.status(400).json({ message: "Enter at least one clinical note field.", errors: { clinicalNotes: "Enter at least one clinical note field." } });
    }

    let appointment = null;
    if (appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ message: "Appointment reference is invalid.", errors: { appointment: "Appointment reference is invalid." } });
      }
      appointment = await Appointment.findById(appointmentId).lean();
      if (!appointment) {
        return res.status(404).json({ message: "Appointment reference was not found." });
      }
    }

    const patient = appointment?.patient
      ? await Patient.findById(appointment.patient).select("_id userId firstName middleName lastName contactNumber email guardianEmail").lean()
      : (await Patient.find({}).select("_id userId firstName middleName lastName contactNumber email guardianEmail").lean())
        .find((candidate) => normalizePersonName(patientFullName(candidate)) === normalizePersonName(patientName)
          || normalizePersonName(patientFullNameWithMiddle(candidate)) === normalizePersonName(patientName));
    const provider = providerName(req.user);
    const record = await DentalRecord.create({
      recordType: "clinical_note",
      patient: patient?._id || appointment?.patient,
      appointment: appointment?._id,
      patientName,
      visitDate: req.body.visitDate ? parseReportDate(req.body.visitDate) || new Date() : new Date(),
      noteType: String(req.body.noteType || "Clinical Note").trim() || "Clinical Note",
      clinicalNotes,
      attachments,
      dentistName: appointment?.dentistName || (req.user.role === "admin" ? provider : ""),
      servicePerformed: appointment?.service || "",
      procedure: appointment?.service || "",
      createdBy: req.user.id,
      createdByName: provider,
      createdByEmail: req.user.email,
    });

    let followUpAppointment = null;
    let followUpWarning = "";
    const shouldCreateFollowUp = Boolean(followUp.enabled || followUp.date || followUp.time);
    let followUpDate = null;
    let followUpTime = "";
    let followUpReason = "";
    if (shouldCreateFollowUp) {
      followUpDate = parseReportDate(followUp.date);
      followUpTime = String(followUp.time || "").trim();
      followUpReason = String(followUp.reason || clinicalNotes.recommendations || "Follow-up appointment recommended.").trim();

      if (!followUpDate || !followUpTime) {
        return res.status(400).json({
          message: "Follow-up date and time are required when booking a follow-up appointment.",
          errors: { followUp: "Follow-up date and time are required." },
        });
      }

      try {
        const followUpValidation = await validateAppointmentSlot({
          appointmentDate: followUp.date,
          appointmentTime: followUpTime,
          serviceName: appointment?.service || "Follow-up Appointment",
          dentistName: appointment?.dentistName || provider,
          autoSelectAlternative: true,
        });
        followUpDate = followUpValidation.parsedDate;
        const requestedFollowUpTime = followUpTime;
        followUpTime = followUpValidation.appointmentTime;
        const followUpAdjustmentNote = followUpValidation.autoAdjusted
          ? ` Requested time ${requestedFollowUpTime} was unavailable, so the appointment was scheduled at ${followUpTime}.`
          : "";

        followUpAppointment = await Appointment.create({
          patient: patient?._id || appointment?.patient,
          patientName,
          contactNumber: patient?.contactNumber || appointment?.contactNumber || "Not provided",
          email: patient?.email || appointment?.email || "",
          service: followUpValidation.selectedService.serviceName,
          serviceRef: appointment?.serviceRef,
          servicePriceSnapshot: Number(followUpValidation.selectedService.price) || appointment?.servicePriceSnapshot,
          serviceDurationSnapshot: followUpValidation.serviceDuration,
          appointmentDate: followUpValidation.parsedDate,
          appointmentTime: followUpTime,
          reason: followUpReason,
          status: "follow_up",
          dentistName: appointment?.dentistName || provider,
          requestSubmittedAt: new Date(),
          timeline: [{
            status: "follow_up",
            action: followUpValidation.autoAdjusted ? "Follow-up Scheduled at Next Available Time" : "Follow-up Scheduled",
            performedBy: req.user.id,
            performedByName: provider,
            performedByEmail: req.user.email,
            note: `Follow-up created from clinical note ${record._id}.${followUpAdjustmentNote}`.trim(),
            recordedAt: new Date(),
          }],
        });

        if (patient?.userId) {
          await Notification.create({
            user: patient.userId,
            patient: patient._id,
            title: "Follow-up appointment recommended",
            message: `A follow-up appointment has been scheduled for ${followUpDate.toLocaleDateString()} at ${followUpTime}.${followUpAdjustmentNote}`,
            type: "appointment",
            metadata: {
              appointmentId: followUpAppointment._id,
              clinicalNoteId: record._id,
              reason: followUpReason,
            },
          });
        }

        if (patient?.userId) {
          sendPatientContactMail({
            patient,
            fallbackEmail: appointment?.email,
            subject: "Follow-up Appointment Scheduled - Flores-Dizon Dental Clinic",
            message: `A follow-up appointment has been scheduled for ${followUpDate.toLocaleDateString()} at ${followUpTime}. Reason: ${followUpReason}${followUpAdjustmentNote}`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
                <h2 style="color:#082f49;">Follow-up Appointment Scheduled</h2>
                <p>Your follow-up appointment has been scheduled.</p>
                <p><strong>Date:</strong> ${followUpDate.toLocaleDateString()}</p>
                <p><strong>Time:</strong> ${followUpTime}</p>
                <p><strong>Reason:</strong> ${followUpReason}</p>
                ${followUpValidation.autoAdjusted ? `<p>The requested time was unavailable, so the clinic selected the next available appointment time.</p>` : ""}
              </div>
            `,
          }).catch(() => {});
        }
      } catch (followUpError) {
        followUpWarning = followUpError?.code === 11000
          ? "Clinical note was saved, but the follow-up slot is already booked."
          : followUpError?.message || "Clinical note was saved, but the follow-up appointment could not be created.";
      }

      record.clinicalFollowUp = {
        enabled: true,
        date: followUpDate,
        time: followUpTime,
        reason: followUpReason,
        appointment: followUpAppointment?._id,
        appointmentId: followUpAppointment ? `APT-${String(followUpAppointment._id).slice(-6).toUpperCase()}` : "",
        status: followUpAppointment?.status || (followUpWarning ? "not_scheduled" : "follow_up"),
      };
      await record.save();
    }

    await auditClinicalNoteAction(req, record, "Clinical Note Created");
    res.status(201).json({
      message: followUpAppointment
        ? "Clinical note created and follow-up appointment scheduled."
        : "Clinical note created successfully.",
      data: await sanitizeClinicalNote(record),
      followUpAppointment,
      warning: followUpWarning,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/clinical-notes/:id", authorize("admin", "staff"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid clinical note ID." });
    }

    const scope = clinicalNoteScope(req, req.user.role !== "admin" || req.query.scope !== "all");
    const record = await DentalRecord.findOne({ _id: req.params.id, ...scope });

    if (!record || !clinicalNoteHasContent(record)) {
      return res.status(404).json({ message: "Clinical note not found." });
    }

    await auditClinicalNoteAction(req, record, "Clinical Note Viewed");
    res.json({ data: await sanitizeClinicalNote(record) });
  } catch (error) {
    next(error);
  }
});
router.patch("/dentalrecords/clinical-notes/:id", authorize("admin", "staff"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid clinical note ID." });
    }

    const record = await DentalRecord.findById(req.params.id);
    if (!record || !clinicalNoteHasContent(record)) {
      return res.status(404).json({ message: "Clinical note not found." });
    }

    const isOwner = String(record.createdBy || "") === String(req.user.id) || String(record.createdByEmail || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    if (!isOwner) {
      return res.status(403).json({ message: "Only the original note creator can edit this clinical note." });
    }

    const notes = req.body.clinicalNotes || {};
    const clinicalNotes = {
      observation: String(notes.observation || "").trim(),
      assessment: String(notes.assessment || "").trim(),
      recommendations: String(notes.recommendations || "").trim(),
      additionalNotes: String(notes.additionalNotes || "").trim(),
    };

    if (!Object.values(clinicalNotes).some(Boolean)) {
      return res.status(400).json({ message: "Enter at least one clinical note field.", errors: { clinicalNotes: "Enter at least one clinical note field." } });
    }

    record.clinicalNotes = clinicalNotes;
    let removedAttachments = [];
    if (Object.prototype.hasOwnProperty.call(req.body, "attachments")) {
      const nextAttachments = normalizeClinicalAttachments(req.body.attachments, req.user);
      const retainedPaths = new Set(nextAttachments.map((attachment) => attachment.path));
      removedAttachments = (record.attachments || []).filter((attachment) => !retainedPaths.has(attachment.path));
      record.attachments = nextAttachments;
    }
    record.visitDate = req.body.visitDate ? parseReportDate(req.body.visitDate) || record.visitDate : record.visitDate;
    record.noteType = String(req.body.noteType || record.noteType || "Clinical Note").trim();
    await record.save();
    await Promise.allSettled(removedAttachments.map((attachment) => deleteClinicalFile(attachment)));

    await auditClinicalNoteAction(req, record, "Clinical Note Updated");
    res.json({
      message: "Clinical note updated successfully.",
      data: await sanitizeClinicalNote(record),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/clinical-notes/export", authorize("admin"), async (req, res, next) => {
  try {
    await AuditLog.create({
      action: "Clinical Note Exported",
      entityType: "Clinical Notes",
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        userName: providerName(req.user),
        filters: req.body?.filters || {},
      },
    });
    res.json({ message: "Clinical notes export logged." });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/treatment-records", authorize("admin", "staff"), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const query = buildTreatmentRecordQuery(req);
    const [records, total, allMatching] = await Promise.all([
      DentalRecord.find(query)
        .populate("patient", "patientId dateOfBirth gender")
        .sort({ visitDate: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DentalRecord.countDocuments(query),
      DentalRecord.find(query).select("procedure servicePerformed treatment treatmentStatus createdByName dentistName").lean(),
    ]);
    const procedures = [...new Set(allMatching.map((record) => record.procedure || record.servicePerformed || record.treatment).filter(Boolean))].sort();
    const providers = [...new Set(allMatching.map((record) => record.createdByName || record.dentistName).filter(Boolean))].sort();
    const enrichedRecords = await enrichRecordsWithPatientInfo(records);

    res.json({
      data: enrichedRecords.map(sanitizeTreatmentRecord),
      summary: {
        total,
        completed: allMatching.filter((record) => (record.treatmentStatus || "completed") === "completed").length,
        followUps: allMatching.filter((record) => record.treatmentStatus === "follow_up_required").length,
        inProgress: allMatching.filter((record) => record.treatmentStatus === "in_progress").length,
      },
      filters: { procedures, providers },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/treatment-records", authorize("admin", "staff"), async (req, res, next) => {
  try {
    if (req.user.role === "staff") {
      return res.status(403).json({ message: "Staff can view treatment records but cannot create official treatment records." });
    }

    const patientName = String(req.body.patientName || "").trim();
    const procedure = String(req.body.procedure || req.body.servicePerformed || "").trim();
    const appointmentId = String(req.body.appointment || "").trim();

    if (!patientName) return res.status(400).json({ message: "Patient name is required.", errors: { patientName: "Patient name is required." } });
    if (!procedure) return res.status(400).json({ message: "Procedure or service is required.", errors: { procedure: "Procedure or service is required." } });

    let appointment = null;
    if (appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ message: "Appointment reference is invalid.", errors: { appointment: "Appointment reference is invalid." } });
      }
      appointment = await Appointment.findById(appointmentId).lean();
      if (!appointment) return res.status(404).json({ message: "Appointment reference was not found." });

      const existingRecord = await DentalRecord.findOne({
        appointment: appointment._id,
        recordType: "treatment_record",
      }).select("_id");
      if (existingRecord) {
        return res.status(409).json({
          message: "A Treatment Record already exists for this appointment.",
          data: { id: existingRecord._id },
        });
      }
    }

    const provider = providerName(req.user);
    const record = await DentalRecord.create({
      recordType: "treatment_record",
      patient: appointment?.patient,
      appointment: appointment?._id,
      patientName,
      visitDate: req.body.visitDate ? parseReportDate(req.body.visitDate) || new Date() : new Date(),
      procedure,
      servicePerformed: procedure,
      toothNumber: String(req.body.toothNumber || "").trim(),
      diagnosis: String(req.body.diagnosis || "").trim(),
      treatment: String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim(),
      treatmentPerformed: String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim(),
      materialsUsed: String(req.body.materialsUsed || "").trim(),
      treatmentStatus: ["completed", "in_progress", "cancelled", "follow_up_required"].includes(req.body.treatmentStatus) ? req.body.treatmentStatus : "completed",
      recommendations: String(req.body.recommendations || req.body.followUpNotes || "").trim(),
      nextVisitRecommendation: String(req.body.nextVisitRecommendation || req.body.followUpNotes || "").trim(),
      dentistName: provider,
      notes: String(req.body.notes || "").trim(),
      createdBy: req.user.id,
      createdByName: provider,
      createdByEmail: req.user.email,
    });

    await auditTreatmentRecordAction(req, record, "Treatment Record Created");
    res.status(201).json({ message: "Treatment record created successfully.", data: sanitizeTreatmentRecord(record) });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/treatment-records/:id", authorize("admin", "staff"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid treatment record ID." });
    const scope = treatmentRecordScope(req, req.user.role !== "admin" || req.query.scope !== "all");
    const record = await DentalRecord.findOne({ _id: req.params.id, ...scope })
      .populate("patient", "patientId dateOfBirth gender");

    if (!record || !treatmentRecordHasContent(record)) return res.status(404).json({ message: "Treatment record not found." });

    const [enrichedRecord] = await enrichRecordsWithPatientInfo([record]);

    await auditTreatmentRecordAction(req, enrichedRecord, "Treatment Record Viewed");
    res.json({ data: sanitizeTreatmentRecord(enrichedRecord) });
  } catch (error) {
    next(error);
  }
});
router.patch("/dentalrecords/treatment-records/:id", authorize("admin", "staff"), async (req, res, next) => {
  try {
    if (req.user.role === "staff") {
      return res.status(403).json({ message: "Staff can view treatment records but cannot edit official treatment records." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid treatment record ID." });
    const record = await DentalRecord.findById(req.params.id);

    if (!record || !treatmentRecordHasContent(record)) return res.status(404).json({ message: "Treatment record not found." });

    const isOwner = String(record.createdBy || "") === String(req.user.id) || String(record.createdByEmail || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    if (!isOwner) return res.status(403).json({ message: "Only the original provider can edit this treatment record." });

    record.visitDate = req.body.visitDate ? parseReportDate(req.body.visitDate) || record.visitDate : record.visitDate;
    record.procedure = String(req.body.procedure || record.procedure || "").trim();
    record.servicePerformed = String(req.body.procedure || req.body.servicePerformed || record.servicePerformed || "").trim();
    record.toothNumber = String(req.body.toothNumber || "").trim();
    record.diagnosis = String(req.body.diagnosis || "").trim();
    record.treatment = String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim();
    record.treatmentPerformed = String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim();
    record.materialsUsed = String(req.body.materialsUsed || "").trim();
    record.treatmentStatus = ["completed", "in_progress", "cancelled", "follow_up_required"].includes(req.body.treatmentStatus) ? req.body.treatmentStatus : record.treatmentStatus || "completed";
    record.recommendations = String(req.body.recommendations || req.body.followUpNotes || "").trim();
    record.nextVisitRecommendation = String(req.body.nextVisitRecommendation || req.body.followUpNotes || "").trim();
    record.notes = String(req.body.notes || "").trim();
    await record.save();

    await auditTreatmentRecordAction(req, record, "Treatment Record Updated");
    res.json({ message: "Treatment record updated successfully.", data: sanitizeTreatmentRecord(record) });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/treatment-records/export", authorize("admin", "staff"), async (req, res, next) => {
  try {
    await AuditLog.create({
      action: "Treatment Record Exported",
      entityType: "Treatment Records",
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        userName: providerName(req.user),
        filters: req.body?.filters || {},
      },
    });
    res.json({ message: "Treatment records export logged." });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/my", authorize("patient"), async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });

    if (!patient) {
      return res.json({
        data: [],
        appointments: [],
        patient: null,
      });
    }

    const [records, appointments] = await Promise.all([
      DentalRecord.find({
        recordType: { $ne: "clinical_note" },
        $or: [
          { patient: patient._id },
          { patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
        ],
      }).sort({ visitDate: -1, createdAt: -1 }),
      Appointment.find({
        $or: [
          { patient: patient._id },
          { email: patient.email },
          { patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
        ],
      }).sort({ appointmentDate: -1, createdAt: -1 }),
    ]);
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
      data: records.map(sanitizePatientDentalRecord),
      appointments: appointments.map((appointment) => ({
        ...(appointment.toObject ? appointment.toObject() : appointment),
        clinicalRecommendation: recommendationsByAppointment.get(String(appointment._id)) || "",
      })),
      patient,
    });
  } catch (error) {
    next(error);
  }
});
router.use("/dentalrecords", authorize("admin", "staff"), createCrudRouter(DentalRecord));
router.get("/inventory", authorize("admin", "staff"), inventoryListHandler);
router.post("/inventory/:id/usage", authorize("admin", "staff"), inventoryUsageHandler);
router.post("/inventory/:id/sale", authorize("admin", "staff"), inventorySaleHandler);
router.post("/inventory/:id/adjust", authorize("admin"), inventoryAdjustmentHandler);
router.use(
  "/inventory",
  authorize("admin"),
  createCrudRouter(Inventory, {
    defaultSort: { itemName: 1 },
    beforeCreate: (body) => ({
      ...body,
      costPrice: Number(body.costPrice ?? body.purchasePrice ?? 0) || 0,
      expirationDate: body.expirationDate || undefined,
      isActive: body.isActive ?? true,
      requiresPrescription: Boolean(body.requiresPrescription),
      sellingPrice: Number(body.sellingPrice ?? 0) || 0,
      status: toStockStatus(body),
      transactionHistory: [
        {
          type: "initial_stock",
          quantityBefore: 0,
          quantityChanged: Number(body.quantity || 0),
          quantityAfter: Number(body.quantity || 0),
          unitPrice: Number(body.sellingPrice ?? 0) || 0,
          notes: "Initial stock entry",
          recordedAt: new Date(),
        },
      ],
    }),
    beforeUpdate: async (body, req) => {
      const existing = await Inventory.findById(req.params.id).lean();
      const merged = { ...existing, ...body };

      return {
        ...body,
        costPrice: body.costPrice === undefined ? undefined : Number(body.costPrice) || 0,
        sellingPrice: body.sellingPrice === undefined ? undefined : Number(body.sellingPrice) || 0,
        requiresPrescription: body.requiresPrescription === undefined ? undefined : Boolean(body.requiresPrescription),
        status: toStockStatus(merged),
      };
    },
  }),
);
router.get("/promotions", authorize("admin", "staff", "patient"), async (req, res, next) => {
  try {
    await expirePromotions();
    const now = new Date();
    const query = req.user.role === "admin"
      ? {}
      : {
          status: "active",
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: now } },
          ],
        };
    const promotions = await Promotion.find(query).sort({ endDate: 1, createdAt: -1 });

    res.json({
      data: promotions,
      pagination: {
        page: 1,
        limit: promotions.length,
        total: promotions.length,
        pages: 1,
      },
    });
  } catch (error) {
    next(error);
  }
});
const removeUnusedPromotionImage = async (imageUrl, promotionId) => {
  if (!imageUrl) return;
  try {
    const stillUsed = await Promotion.exists({ imageUrl, _id: { $ne: promotionId } });
    if (!stillUsed) await deleteManagedPromotionImage(imageUrl);
  } catch (error) {
    console.error("Unable to clean up a previous promotion image:", error);
  }
};

router.use(
  "/promotions",
  authorize("admin"),
  createCrudRouter(Promotion, {
    beforeCreate: normalizePromotionBody,
    beforeUpdate: normalizePromotionBody,
    afterCreate: notifyUsersOfPromotion,
    afterUpdate: (promotion, previous) => {
      if (!previous?.imageUrl || previous.imageUrl === promotion.imageUrl) return;
      return removeUnusedPromotionImage(previous.imageUrl, promotion._id);
    },
    afterDelete: (promotion) => removeUnusedPromotionImage(promotion.imageUrl, promotion._id),
  }),
);
router.use("/notifications", authorize("admin", "staff", "patient"), createCrudRouter(Notification));
router.use("/subscribers", authorize("admin"), createCrudRouter(Subscriber));
router.use(
  "/audit-logs",
  authorize("admin"),
  createCrudRouter(AuditLog, {
    defaultSort: { createdAt: -1 },
    beforeCreate: (body, req) => ({
      ...body,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
    }),
  }),
);
router.use(
  "/clinic-settings",
  authorize("admin"),
  createCrudRouter(ClinicSettings, {
    beforeCreate: normalizeClinicSettingsBody,
    beforeUpdate: normalizeClinicSettingsBody,
  }),
);

module.exports = router;
