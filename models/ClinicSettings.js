const mongoose = require("mongoose");

const clinicSettingsSchema = new mongoose.Schema(
  {
    clinicName: {
      type: String,
      trim: true,
      default: "Flores-Dizon Dental Clinic",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    contactNumber: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    operatingHours: {
      type: String,
      trim: true,
      default: "Monday to Saturday, 9:00 AM - 5:00 PM",
    },
    clinicLogo: {
      type: String,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    services: {
      type: [
        {
          serviceName: { type: String, trim: true, required: true },
          category: { type: String, trim: true, default: "General" },
          duration: { type: Number, default: 30, min: [1, "Service duration must be at least 1 minute."] },
          price: { type: Number, default: 0, min: [0, "Service price cannot be negative."] },
          status: { type: String, enum: ["active", "inactive"], default: "active" },
        },
      ],
      default: [],
    },
    appointmentSettings: {
      openingTime: { type: String, default: "09:00" },
      closingTime: { type: String, default: "17:00" },
      appointmentDuration: { type: Number, default: 30 },
      workingDays: { type: [String], default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
      maxAppointmentsPerDay: { type: Number, default: 20 },
      bufferTime: { type: Number, default: 10 },
      allowWeekendAppointments: { type: Boolean, default: true },
      allowOnlineBooking: { type: Boolean, default: true },
    },
    systemPreferences: {
      theme: { type: String, default: "light" },
      language: { type: String, default: "English" },
      timeZone: { type: String, default: "Asia/Manila" },
      dateFormat: { type: String, default: "MMM d, yyyy" },
      timeFormat: { type: String, default: "12" },
    },
    security: {
      sessionTimeout: { type: Number, default: 30 },
    },
    backup: {
      lastBackupDate: { type: Date },
      status: { type: String, default: "No backup created yet" },
    },
    notifications: {
      appointmentConfirmationEmail: { type: Boolean, default: true },
      appointmentReminderEmail: { type: Boolean, default: true },
      appointmentCancellationNotification: { type: Boolean, default: true },
      lowInventoryAlert: { type: Boolean, default: true },
      newAppointmentAlertForAdmin: { type: Boolean, default: true },
      smtpHost: { type: String, trim: true, default: "" },
      smtpPort: { type: String, trim: true, default: "" },
      emailUsername: { type: String, trim: true, default: "" },
      emailPassword: { type: String, default: "" },
    },
    appointmentReminders: {
      type: Boolean,
      default: true,
    },
    inventoryAlerts: {
      type: Boolean,
      default: true,
    },
    requireAdminPasswordForStaff: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "clinic_settings",
    timestamps: true,
  },
);

module.exports = mongoose.model("ClinicSettings", clinicSettingsSchema);
