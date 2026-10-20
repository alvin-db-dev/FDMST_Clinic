const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { sendStaffWelcomeEmail } = require("../services/mailService");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();

const DEFAULT_STAFF_TEMPORARY_PASSWORD = "12345678";

const sanitizeStaffUser = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  contactNumber: user.contactNumber,
  profilePhoto: user.profilePhoto,
  status: user.status,
  createdAt: user.createdAt,
});

const formatEmployeeId = (user) => user.employeeId || `${String(user.role || "USR").toUpperCase()}-${String(user._id).slice(-6).toUpperCase()}`;

const sanitizeLoginHistory = (history = []) => history
  .slice()
  .sort((left, right) => new Date(right.recordedAt) - new Date(left.recordedAt))
  .slice(0, 25)
  .map((entry) => ({
    id: entry._id,
    dateTime: entry.recordedAt,
    ipAddress: entry.ipAddress || "Unknown",
    device: entry.device || "Unknown Device",
    browser: entry.browser || "Unknown Browser",
    status: entry.status || "Successful",
  }));

const defaultWorkPreferences = {
  schedule: {
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    startTime: "09:00",
    endTime: "17:00",
  },
  notifications: {
    newAppointment: true,
    appointmentCancellation: true,
    appointmentReschedule: true,
    patientMessages: true,
    emailNotifications: true,
  },
  appearance: {
    theme: "light",
    language: "English",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12",
  },
};

const sanitizeWorkPreferences = (preferences = {}) => ({
  schedule: {
    ...defaultWorkPreferences.schedule,
    ...(preferences.schedule || {}),
  },
  notifications: {
    ...defaultWorkPreferences.notifications,
    ...(preferences.notifications || {}),
  },
  appearance: {
    ...defaultWorkPreferences.appearance,
    ...(preferences.appearance || {}),
  },
});

const sanitizeUser = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  username: user.username,
  role: user.role,
  accountStatus: user.accountStatus,
  contactNumber: user.contactNumber,
  profilePhoto: user.profilePhoto,
  recoveryEmail: user.recoveryEmail,
  employeeId: formatEmployeeId(user),
  licenseNumber: user.licenseNumber,
  specialization: user.specialization,
  lastLoginAt: user.lastLoginAt,
  lastPasswordChangedAt: user.lastPasswordChangedAt,
  requiresPasswordSetup: Boolean(user.requiresPasswordSetup),
  loginHistory: sanitizeLoginHistory(user.loginHistory || []),
  failedLoginAttempts: user.failedLoginAttempts || 0,
  totalLogins: user.totalLogins || 0,
  status: user.status,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  workPreferences: sanitizeWorkPreferences(user.workPreferences || {}),
});

const sanitizePatientProfile = (patient) => patient && ({
  id: patient._id,
  patientId: patient.patientId,
  dateOfBirth: patient.dateOfBirth,
  guardianName: patient.guardianName,
  guardianRelationship: patient.guardianRelationship,
  guardianContactNumber: patient.guardianContactNumber,
  guardianEmail: patient.guardianEmail,
  guardianAddress: patient.guardianAddress,
  gender: patient.gender,
  address: patient.address,
  emergencyContactName: patient.emergencyContactName,
  emergencyContactNumber: patient.emergencyContactNumber,
  emergencyContactRelationship: patient.emergencyContactRelationship,
  alternateContactNumber: patient.alternateContactNumber,
  allergies: patient.allergies,
  medicalHistory: patient.medicalHistory,
  medicalConditions: patient.medicalConditions,
  currentMedications: patient.currentMedications,
  additionalMedicalNotes: patient.additionalMedicalNotes,
  dentalHistory: patient.dentalHistory,
  emergencyContact: patient.emergencyContact,
  registrationStatus: patient.registrationStatus,
  verifiedAt: patient.verifiedAt,
  preferredDentist: patient.preferredDentist,
  preferredDentistName: patient.preferredDentistName,
  createdAt: patient.createdAt,
});

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const sanitizeNotification = (notification) => ({
  id: notification._id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  scheduledFor: notification.scheduledFor,
  metadata: notification.metadata || {},
  createdAt: notification.createdAt,
});

const getNotificationOwnershipFilters = async (userId) => {
  const patient = await Patient.findOne({ userId }).select("_id");
  return [
    { user: userId },
    ...(patient ? [{ patient: patient._id }] : []),
  ];
};

const isValidProfilePhoto = (profilePhoto) =>
  !profilePhoto ||
  /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(profilePhoto) ||
  (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(profilePhoto) &&
    profilePhoto.length <= 750000);

const isStrongPassword = (password) =>
  typeof password === "string" &&
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password);

const passwordRequirementsMessage = "Password must be at least 8 characters and include uppercase, lowercase, and number.";

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim() || "Unknown";

const auditSelfProfileAction = (req, user, action, metadata = {}) => AuditLog.create({
  action,
  entityType: "User",
  entityId: user._id,
  performedBy: user._id,
  performedByEmail: user.email,
  metadata: {
    userName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
    ipAddress: getRequestIp(req),
    ...metadata,
  },
}).catch(() => {});

const timeToMinutes = (value) => {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return NaN;
  return hours * 60 + minutes;
};

const allowedWorkingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const verifyAdminPasswordForAction = async (adminId, adminPassword) => {
  if (!adminPassword) {
    return {
      ok: false,
      status: 400,
      message: "Admin password is required to complete this action.",
    };
  }

  const admin = await User.findById(adminId).select("+passwordHash");

  if (!admin || admin.role !== "admin") {
    return {
      ok: false,
      status: 403,
      message: "Only an authenticated admin can perform this action.",
    };
  }

  const isAdminPasswordValid = await verifyPassword(adminPassword, admin.passwordHash);

  if (!isAdminPasswordValid) {
    return {
      ok: false,
      status: 401,
      message: "Admin password is incorrect. No changes were saved.",
    };
  }

  return { ok: true, admin };
};

const logStaffAudit = async ({ action, admin, staffUser, metadata = {} }) => {
  await AuditLog.create({
    action,
    entityType: "User",
    entityId: staffUser._id,
    performedBy: admin._id,
    performedByEmail: admin.email,
    metadata: {
      staffEmail: staffUser.email,
      staffRole: staffUser.role,
      ...metadata,
    },
  });
};

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const patient = user.role === "patient"
      ? await Patient.findOne({ userId: user._id })
      : null;
    const recentActivity = user.role === "admin"
      ? await AuditLog.find({ performedBy: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("action entityType metadata createdAt")
        .lean()
      : [];

    res.json({
      user: {
        ...sanitizeUser(user),
        patient: sanitizePatientProfile(patient),
        recentActivity,
      },
    });
  }),
);

router.get(
  "/me/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const filters = await getNotificationOwnershipFilters(req.user.id);
    const query = { $or: filters };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query)
      .sort({ createdAt: -1 })
        .limit(10),
      Notification.countDocuments({ ...query, isRead: false }),
    ]);

    res.json({
      data: notifications.map(sanitizeNotification),
      unreadCount,
    });
  }),
);

router.get(
  "/me/settings",
  authenticate,
  authorize("staff"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("workPreferences role firstName lastName email");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    res.json({
      data: sanitizeWorkPreferences(user.workPreferences || {}),
    });
  }),
);

router.patch(
  "/me/settings",
  authenticate,
  authorize("staff"),
  asyncHandler(async (req, res) => {
    const { schedule = {}, notifications = {}, appearance = {} } = req.body || {};
    const workingDays = Array.isArray(schedule.workingDays)
      ? schedule.workingDays.filter((day) => allowedWorkingDays.includes(day))
      : [];
    const startTime = String(schedule.startTime || "").trim();
    const endTime = String(schedule.endTime || "").trim();
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    if (!workingDays.length) {
      return res.status(400).json({
        message: "Select at least one working day.",
        errors: { workingDays: "Select at least one working day." },
      });
    }

    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) {
      return res.status(400).json({
        message: "End time must be later than start time.",
        errors: { workingHours: "End time must be later than start time." },
      });
    }

    const theme = ["light", "dark", "system"].includes(appearance.theme) ? appearance.theme : "light";
    const dateFormat = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].includes(appearance.dateFormat) ? appearance.dateFormat : "MM/DD/YYYY";
    const timeFormat = ["12", "24"].includes(String(appearance.timeFormat)) ? String(appearance.timeFormat) : "12";
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const previous = sanitizeWorkPreferences(user.workPreferences || {});
    const next = {
      schedule: {
        workingDays,
        startTime,
        endTime,
      },
      notifications: {
        newAppointment: Boolean(notifications.newAppointment),
        appointmentCancellation: Boolean(notifications.appointmentCancellation),
        appointmentReschedule: Boolean(notifications.appointmentReschedule),
        patientMessages: Boolean(notifications.patientMessages),
        emailNotifications: Boolean(notifications.emailNotifications),
      },
      appearance: {
        theme,
        language: String(appearance.language || "English").trim() || "English",
        dateFormat,
        timeFormat,
      },
    };

    user.workPreferences = next;
    await user.save();

    const auditActions = [];
    if (JSON.stringify(previous.schedule) !== JSON.stringify(next.schedule)) auditActions.push("Updated Schedule Settings");
    if (JSON.stringify(previous.notifications) !== JSON.stringify(next.notifications)) auditActions.push("Updated Notification Settings");
    if (JSON.stringify(previous.appearance) !== JSON.stringify(next.appearance)) auditActions.push("Updated Appearance Settings");
    await Promise.all(auditActions.map((action) => auditSelfProfileAction(req, user, action)));

    res.json({
      message: "Settings updated successfully.",
      data: sanitizeWorkPreferences(user.workPreferences || {}),
      user: sanitizeUser(user),
    });
  }),
);

router.post(
  "/me/report-action",
  authenticate,
  authorize("staff"),
  asyncHandler(async (req, res) => {
    const action = ["Report viewed", "Report exported", "Report printed"].includes(req.body?.action)
      ? req.body.action
      : "Report viewed";
    const user = await User.findById(req.user.id).select("firstName lastName email role");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    await AuditLog.create({
      action,
      entityType: "Reports",
      performedBy: user._id,
      performedByEmail: user.email,
      metadata: {
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
        role: user.role,
        module: "Staff Reports",
        filters: req.body?.filters || {},
      },
    });

    res.json({ message: "Report activity recorded." });
  }),
);

router.patch(
  "/me/notifications/read",
  authenticate,
  asyncHandler(async (req, res) => {
    const filters = await getNotificationOwnershipFilters(req.user.id);
    await Notification.updateMany({ $or: filters, isRead: false }, { isRead: true });

    res.json({ message: "Notifications marked as read." });
  }),
);

router.patch(
  "/me/notifications/:id/read",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification." });
    }

    const filters = await getNotificationOwnershipFilters(req.user.id);
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, $or: filters },
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({ data: sanitizeNotification(notification) });
  }),
);

router.delete(
  "/me/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const filters = await getNotificationOwnershipFilters(req.user.id);
    const result = await Notification.deleteMany({ $or: filters });

    res.json({
      message: "Notifications cleared.",
      deletedCount: result.deletedCount || 0,
    });
  }),
);

router.patch(
  "/me/password",
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Current password, new password, and confirmation are required.",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: passwordRequirementsMessage,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirmation do not match.",
      });
    }

    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: "Current password is incorrect.",
      });
    }

    user.passwordHash = await hashPasswordScrypt(newPassword);
    user.requiresPasswordSetup = false;
    user.lastPasswordChangedAt = new Date();
    await user.save();

    await auditSelfProfileAction(req, user, "Changed Password");

    res.json({
      message: "Password updated successfully.",
      user: sanitizeUser(user),
    });
  }),
);

router.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      contactNumber,
      profilePhoto,
      recoveryEmail,
      licenseNumber,
      specialization,
      preferredDentistName,
      dateOfBirth,
      guardianName,
      guardianRelationship,
      guardianContactNumber,
      guardianEmail,
      guardianAddress,
      gender,
      address,
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactNumber,
      alternateContactNumber,
      allergies,
      medicalConditions,
      currentMedications,
      additionalMedicalNotes,
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return res.status(400).json({
        message: "First name, last name, and email are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user.id },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    if (!isValidProfilePhoto(profilePhoto)) {
      return res.status(400).json({
        message: "Profile photo must be a PNG, JPG, or WebP image under 550 KB.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recoveryEmail).trim())) {
      return res.status(400).json({
        message: "Enter a valid recovery email address.",
        errors: { recoveryEmail: "Enter a valid recovery email address." },
      });
    }

    if (req.user.role === "patient") {
      const emergencyName = String(emergencyContactName || "").trim();
      const emergencyRelationship = String(emergencyContactRelationship || "").trim();
      const emergencyNumber = String(emergencyContactNumber || "").trim();
      const alternateNumber = String(alternateContactNumber || "").trim();
      const normalizedGuardianName = String(guardianName || "").trim();
      const normalizedGuardianRelationship = String(guardianRelationship || "").trim();
      const normalizedGuardianContact = String(guardianContactNumber || "").trim();
      const normalizedGuardianEmail = String(guardianEmail || "").trim().toLowerCase();
      const age = calculateAge(dateOfBirth);

      if (age !== null && age < 18 && (!normalizedGuardianName || !normalizedGuardianRelationship || !normalizedGuardianContact)) {
        const guardianErrors = {};
        if (!normalizedGuardianName) guardianErrors.guardianName = "Parent/guardian full name is required.";
        if (!normalizedGuardianRelationship) guardianErrors.guardianRelationship = "Relationship to patient is required.";
        if (!normalizedGuardianContact) guardianErrors.guardianContactNumber = "Guardian contact number is required.";

        return res.status(400).json({
          message: "Parent/guardian full name, relationship, and contact number are required for patients under 18.",
          errors: guardianErrors,
        });
      }

      if (normalizedGuardianContact && !isValidMobileNumber(normalizedGuardianContact)) {
        return res.status(400).json({
          message: MOBILE_NUMBER_MESSAGE,
          errors: { guardianContactNumber: MOBILE_NUMBER_MESSAGE },
        });
      }

      if (normalizedGuardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedGuardianEmail)) {
        return res.status(400).json({
          message: "Enter a valid guardian email address.",
          errors: { guardianEmail: "Enter a valid guardian email address." },
        });
      }

      if ((emergencyName || emergencyRelationship || emergencyNumber) && (!emergencyName || !emergencyRelationship || !emergencyNumber)) {
        return res.status(400).json({
          message: "Emergency contact name, relationship, and contact number are required when emergency contact information is provided.",
          errors: {
            emergencyContact: "Complete the emergency contact name, relationship, and contact number.",
          },
        });
      }

      if (emergencyNumber && !isValidMobileNumber(emergencyNumber)) {
        return res.status(400).json({
          message: MOBILE_NUMBER_MESSAGE,
          errors: { emergencyContactNumber: MOBILE_NUMBER_MESSAGE },
        });
      }

      if (alternateNumber && !isValidMobileNumber(alternateNumber)) {
        return res.status(400).json({
          message: MOBILE_NUMBER_MESSAGE,
          errors: { alternateContactNumber: MOBILE_NUMBER_MESSAGE },
        });
      }
    }

    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    if (newPassword || currentPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message: "Current password, new password, and confirmation are required.",
        });
      }

      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          message: passwordRequirementsMessage,
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          message: "New password and confirmation do not match.",
        });
      }

      const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          message: "Current password is incorrect.",
        });
      }

      user.passwordHash = await hashPasswordScrypt(newPassword);
      user.requiresPasswordSetup = false;
      user.lastPasswordChangedAt = new Date();
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.email = normalizedEmail;
    user.contactNumber = normalizeMobileNumber(contactNumber);
    user.profilePhoto = profilePhoto || "";

    if (user.role === "admin") {
      user.recoveryEmail = recoveryEmail ? String(recoveryEmail).trim().toLowerCase() : "";
    }

    await user.save();

    const profileActions = ["Updated Personal Information"];
    if (profilePhoto !== undefined) profileActions.push("Changed Profile Picture");
    if (newPassword || currentPassword || confirmPassword) profileActions.push("Changed Password");

    await Promise.all(profileActions.map((action) => auditSelfProfileAction(req, user, action)));

    if (user.role === "patient") {
      let preferredDentistUpdate = {};
      if (preferredDentistName !== undefined) {
        const preferredName = String(preferredDentistName || "").trim();
        const activeDentists = preferredName
          ? await User.find({ role: "admin", status: "active" }).select("firstName lastName").lean()
          : [];
        const preferredDentist = activeDentists.find((dentist) =>
          [dentist.firstName, dentist.lastName].filter(Boolean).join(" ").trim() === preferredName
        );

        preferredDentistUpdate = {
          preferredDentist: preferredDentist?._id,
          preferredDentistName: preferredDentist ? preferredName : "",
        };
      }

      await Patient.findOneAndUpdate(
        { userId: user._id },
        {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          contactNumber: user.contactNumber,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          guardianName: String(guardianName || "").trim(),
          guardianRelationship: String(guardianRelationship || "").trim(),
          guardianContactNumber: guardianContactNumber ? normalizeMobileNumber(guardianContactNumber) : "",
          guardianEmail: String(guardianEmail || "").trim().toLowerCase(),
          guardianAddress: String(guardianAddress || "").trim(),
          gender: ["male", "female", "other", "prefer_not_to_say"].includes(gender) ? gender : undefined,
          address: String(address || "").trim(),
          emergencyContactName: String(emergencyContactName || "").trim(),
          emergencyContactRelationship: String(emergencyContactRelationship || "").trim(),
          emergencyContactNumber: emergencyContactNumber ? normalizeMobileNumber(emergencyContactNumber) : "",
          alternateContactNumber: alternateContactNumber ? normalizeMobileNumber(alternateContactNumber) : "",
          allergies: Array.isArray(allergies)
            ? allergies.map((item) => String(item || "").trim()).filter(Boolean)
            : String(allergies || "").split(",").map((item) => item.trim()).filter(Boolean),
          medicalConditions: String(medicalConditions || "").trim(),
          medicalHistory: String(medicalConditions || "").trim(),
          currentMedications: String(currentMedications || "").trim(),
          additionalMedicalNotes: String(additionalMedicalNotes || "").trim(),
          ...preferredDentistUpdate,
        },
      );
    }

    const patient = user.role === "patient"
      ? await Patient.findOne({ userId: user._id })
      : null;

    res.json({
      message: "Profile updated successfully.",
      user: {
        ...sanitizeUser(user),
        patient: sanitizePatientProfile(patient),
      },
    });
  }),
);

router.patch(
  "/me/profile-photo",
  authenticate,
  asyncHandler(async (req, res) => {
    const { profilePhoto } = req.body;

    if (!isValidProfilePhoto(profilePhoto)) {
      return res.status(400).json({
        message: "Profile photo must be a PNG, JPG, WebP, or GIF image URL.",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    user.profilePhoto = profilePhoto || "";
    await user.save();
    await auditSelfProfileAction(req, user, profilePhoto ? "Changed Profile Picture" : "Removed Profile Picture");

    const patient = user.role === "patient"
      ? await Patient.findOne({ userId: user._id })
      : null;

    res.json({
      message: profilePhoto ? "Profile photo updated successfully." : "Profile photo removed successfully.",
      user: {
        ...sanitizeUser(user),
        patient: sanitizePatientProfile(patient),
      },
    });
  }),
);

router.get(
  "/staff",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const staff = await User.find({ role: "staff" })
      .sort({ createdAt: -1 })
      .select("-passwordHash");

    res.json({
      data: staff.map(sanitizeStaffUser),
    });
  }),
);

router.post(
  "/admin/verify-password",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { adminPassword } = req.body;
    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    res.json({
      message: "Admin password verified.",
    });
  }),
);

router.post(
  "/staff",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, contactNumber, adminPassword } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !adminPassword) {
      return res.status(400).json({
        message: "First name, last name, email, and admin password are required.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const staffName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const passwordHash = await hashPasswordScrypt(DEFAULT_STAFF_TEMPORARY_PASSWORD);

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      contactNumber: normalizeMobileNumber(contactNumber),
      passwordHash,
      requiresPasswordSetup: true,
      role: "staff",
      accountStatus: "active_staff",
      status: "active",
    });
    user.employeeId = `STAFF-${String(user._id).slice(-6).toUpperCase()}`;
    await user.save();

    await logStaffAudit({
      action: "staff_created",
      admin: adminVerification.admin,
      staffUser: user,
    });

    const mailResult = { sent: false };

    try {
      await sendStaffWelcomeEmail({
        to: normalizedEmail,
        staffName,
        temporaryPassword: DEFAULT_STAFF_TEMPORARY_PASSWORD,
      });
      mailResult.sent = true;
    } catch (mailError) {
      mailResult.error = mailError.message;
    }

    res.status(201).json({
      message: mailResult.sent
        ? "Staff account created successfully. A welcome email was sent with the default password."
        : "Staff account created successfully, but the welcome email could not be sent. Check the mail API configuration.",
      mail: mailResult,
      user: sanitizeStaffUser(user),
    });
  }),
);

router.patch(
  "/staff/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, email, contactNumber, adminPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid staff account ID." });
    }

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return res.status(400).json({
        message: "First name, last name, and email are required.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const staffUser = await User.findOne({
      _id: id,
      role: "staff",
    });

    if (!staffUser) {
      return res.status(404).json({ message: "Staff account not found." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: staffUser._id },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const previousValues = {
      firstName: staffUser.firstName,
      lastName: staffUser.lastName,
      email: staffUser.email,
      contactNumber: staffUser.contactNumber,
    };

    staffUser.firstName = firstName.trim();
    staffUser.lastName = lastName.trim();
    staffUser.email = normalizedEmail;
    staffUser.role = "staff";
    staffUser.contactNumber = normalizeMobileNumber(contactNumber);
    staffUser.accountStatus = "active_staff";

    await staffUser.save();

    await logStaffAudit({
      action: "staff_updated",
      admin: adminVerification.admin,
      staffUser,
      metadata: { previousValues },
    });

    res.json({
      message: "Staff account updated successfully.",
      user: sanitizeStaffUser(staffUser),
    });
  }),
);

router.patch(
  "/staff/:id/status",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid staff account ID." });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or inactive." });
    }

    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const staffUser = await User.findOne({
      _id: id,
      role: "staff",
    });

    if (!staffUser) {
      return res.status(404).json({ message: "Staff account not found." });
    }

    const previousStatus = staffUser.status;
    staffUser.status = status;
    await staffUser.save();

    await logStaffAudit({
      action: status === "active" ? "staff_activated" : "staff_deactivated",
      admin: adminVerification.admin,
      staffUser,
      metadata: { previousStatus, newStatus: status },
    });

    res.json({
      message: `Staff account ${status === "active" ? "activated" : "deactivated"} successfully.`,
      user: sanitizeStaffUser(staffUser),
    });
  }),
);

module.exports = router;
