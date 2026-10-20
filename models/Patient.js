const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    patientId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      trim: true,
      required: true,
    },
    middleName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      required: true,
    },
    dateOfBirth: Date,
    registrationStatus: {
      type: String,
      enum: ["unverified", "verified"],
      default: "unverified",
    },
    verifiedAt: Date,
    verificationHistory: [
      {
        status: {
          type: String,
          enum: ["new", "verified", "inactive"],
          required: true,
        },
        appointment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Appointment",
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        changedByEmail: {
          type: String,
          trim: true,
          lowercase: true,
        },
        note: {
          type: String,
          trim: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    emergencyContactName: {
      type: String,
      trim: true,
    },
    emergencyContactNumber: {
      type: String,
      trim: true,
    },
    emergencyContactRelationship: {
      type: String,
      trim: true,
    },
    alternateContactNumber: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      type: String,
      trim: true,
    },
    guardianName: {
      type: String,
      trim: true,
    },
    guardianRelationship: {
      type: String,
      trim: true,
    },
    guardianContactNumber: {
      type: String,
      trim: true,
    },
    guardianEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    guardianAddress: {
      type: String,
      trim: true,
    },
    allergies: [String],
    medicalConditions: {
      type: String,
      trim: true,
    },
    currentMedications: {
      type: String,
      trim: true,
    },
    additionalMedicalNotes: {
      type: String,
      trim: true,
    },
    medicalHistory: {
      type: String,
      trim: true,
    },
    dentalHistory: {
      type: String,
      trim: true,
    },
    billingNotes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    assignedDentist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    assignedDentistName: {
      type: String,
      trim: true,
    },
    preferredDentist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    preferredDentistName: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
    },
  },
  {
    collection: "patients",
    timestamps: true,
  },
);

module.exports = mongoose.model("Patient", patientSchema);
