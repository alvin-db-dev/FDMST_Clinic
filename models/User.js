const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      required: true,
    },
    lastName: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    requiresPasswordSetup: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["admin", "staff", "patient"],
      default: "patient",
    },
    accountStatus: {
      type: String,
      enum: ["unverified_user", "verified_patient", "active_staff", "active_admin", "inactive"],
      default: "unverified_user",
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    profilePhoto: {
      type: String,
      trim: true,
    },
    recoveryEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    employeeId: {
      type: String,
      trim: true,
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
    specialization: {
      type: String,
      trim: true,
    },
    lastLoginAt: Date,
    lastPasswordChangedAt: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    totalLogins: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    loginHistory: [
      {
        ipAddress: {
          type: String,
          trim: true,
        },
        device: {
          type: String,
          trim: true,
        },
        browser: {
          type: String,
          trim: true,
        },
        status: {
          type: String,
          enum: ["Successful", "Failed"],
          required: true,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    workPreferences: {
      schedule: {
        workingDays: {
          type: [String],
          default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        },
        startTime: {
          type: String,
          default: "09:00",
        },
        endTime: {
          type: String,
          default: "17:00",
        },
      },
      notifications: {
        newAppointment: {
          type: Boolean,
          default: true,
        },
        appointmentCancellation: {
          type: Boolean,
          default: true,
        },
        appointmentReschedule: {
          type: Boolean,
          default: true,
        },
        patientMessages: {
          type: Boolean,
          default: true,
        },
        emailNotifications: {
          type: Boolean,
          default: true,
        },
      },
      appearance: {
        theme: {
          type: String,
          enum: ["light", "dark", "system"],
          default: "light",
        },
        language: {
          type: String,
          default: "English",
        },
        dateFormat: {
          type: String,
          enum: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"],
          default: "MM/DD/YYYY",
        },
        timeFormat: {
          type: String,
          enum: ["12", "24"],
          default: "12",
        },
      },
    },
  },
  {
    collection: "users",
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
