const mongoose = require("mongoose");

const dentalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    recordType: {
      type: String,
      enum: ["treatment_record", "clinical_note"],
      default: "treatment_record",
      index: true,
    },
    patientName: {
      type: String,
      trim: true,
      required: true,
    },
    noteType: {
      type: String,
      trim: true,
      default: "Clinical Note",
    },
    visitDate: {
      type: Date,
      default: Date.now,
    },
    diagnosis: {
      type: String,
      trim: true,
    },
    chiefComplaint: {
      type: String,
      trim: true,
    },
    treatment: {
      type: String,
      trim: true,
    },
    servicePerformed: {
      type: String,
      trim: true,
    },
    treatmentPerformed: {
      type: String,
      trim: true,
    },
    treatmentStatus: {
      type: String,
      enum: ["completed", "in_progress", "cancelled", "follow_up_required"],
      default: "completed",
    },
    materialsUsed: {
      type: String,
      trim: true,
    },
    recommendations: {
      type: String,
      trim: true,
    },
    nextVisitRecommendation: {
      type: String,
      trim: true,
    },
    clinicalNotes: {
      observation: {
        type: String,
        trim: true,
      },
      assessment: {
        type: String,
        trim: true,
      },
      recommendations: {
        type: String,
        trim: true,
      },
      additionalNotes: {
        type: String,
        trim: true,
      },
    },
    attachments: [{
      name: {
        type: String,
        trim: true,
        maxlength: 180,
      },
      path: {
        type: String,
        trim: true,
        required: true,
      },
      bucket: {
        type: String,
        trim: true,
        required: true,
      },
      mimeType: {
        type: String,
        enum: ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"],
        required: true,
      },
      size: {
        type: Number,
        min: 1,
        max: 5 * 1024 * 1024,
      },
      category: {
        type: String,
        enum: ["xray", "file"],
        default: "file",
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    clinicalFollowUp: {
      enabled: {
        type: Boolean,
        default: false,
      },
      date: Date,
      time: {
        type: String,
        trim: true,
      },
      reason: {
        type: String,
        trim: true,
      },
      appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
      },
      appointmentId: {
        type: String,
        trim: true,
      },
      status: {
        type: String,
        trim: true,
      },
    },
    procedure: {
      type: String,
      trim: true,
    },
    toothNumber: {
      type: String,
      trim: true,
    },
    medications: [String],
    dentistName: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdByName: {
      type: String,
      trim: true,
    },
    createdByEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    appointmentSnapshot: {
      appointmentId: {
        type: String,
        trim: true,
      },
      appointmentDate: Date,
      appointmentTime: {
        type: String,
        trim: true,
      },
      completedAt: Date,
      estimatedDuration: Number,
      originalPrice: Number,
      discountAmount: Number,
      finalPrice: Number,
      promoCode: {
        type: String,
        trim: true,
      },
      promoTitle: {
        type: String,
        trim: true,
      },
      promoDiscountType: {
        type: String,
        trim: true,
      },
      promoDiscountValue: Number,
    },
  },
  {
    collection: "dentalrecords",
    timestamps: true,
  },
);

dentalRecordSchema.index({ createdBy: 1, visitDate: -1 });
dentalRecordSchema.index({ dentistName: 1, visitDate: -1 });
dentalRecordSchema.index({ patientName: 1, visitDate: -1 });
dentalRecordSchema.index(
  { appointment: 1, recordType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointment: { $exists: true },
      recordType: "treatment_record",
    },
  },
);

module.exports = mongoose.model("DentalRecord", dentalRecordSchema);
