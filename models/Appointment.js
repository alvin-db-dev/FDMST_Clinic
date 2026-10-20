const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },
    patientName: {
      type: String,
      trim: true,
      required: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },
    service: {
      type: String,
      trim: true,
      required: true,
    },
    serviceRef: {
      type: mongoose.Schema.Types.ObjectId,
    },
    servicePriceSnapshot: {
      type: Number,
      min: [0, "Service price cannot be negative."],
    },
    serviceDurationSnapshot: {
      type: Number,
      min: [1, "Service duration must be at least 1 minute."],
    },
    promotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
    },
    promoCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    promoTitle: {
      type: String,
      trim: true,
    },
    promoDiscountType: {
      type: String,
      enum: ["percentage", "fixed"],
    },
    promoDiscountValue: {
      type: Number,
      min: [0, "Discount value cannot be negative."],
    },
    originalPrice: {
      type: Number,
      min: [0, "Original price cannot be negative."],
    },
    discountAmount: {
      type: Number,
      min: [0, "Discount amount cannot be negative."],
      default: 0,
    },
    finalPrice: {
      type: Number,
      min: [0, "Final price cannot be negative."],
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    appointmentTime: {
      type: String,
      trim: true,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "cancelled", "declined", "no_show", "rescheduled"],
      default: "pending",
    },
    dentistName: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    timeline: [
      {
        status: {
          type: String,
          trim: true,
        },
        action: {
          type: String,
          trim: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        performedByName: {
          type: String,
          trim: true,
        },
        performedByEmail: {
          type: String,
          trim: true,
        },
        note: {
          type: String,
          trim: true,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    declineReason: {
      type: String,
      trim: true,
    },
    requestSubmittedAt: {
      type: Date,
      default: Date.now,
    },
    autoDeclineWarningSentAt: Date,
    autoDeclinedAt: Date,
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completedByEmail: {
      type: String,
      trim: true,
    },
    noShowAt: Date,
    noShowBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    noShowByEmail: {
      type: String,
      trim: true,
    },
    statusUpdatedAt: Date,
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    statusUpdatedByEmail: {
      type: String,
      trim: true,
    },
    estimatedRevenueAmount: {
      type: Number,
      min: [0, "Estimated revenue cannot be negative."],
    },
  },
  {
    collection: "appointments",
    timestamps: true,
  },
);

appointmentSchema.index(
  { appointmentDate: 1, appointmentTime: 1, dentistName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "rescheduled"] },
    },
  },
);

appointmentSchema.index({ status: 1, requestSubmittedAt: 1, createdAt: 1 });
appointmentSchema.index({ appointmentDate: 1, appointmentTime: 1 });
appointmentSchema.index({ appointmentDate: 1, status: 1 });
appointmentSchema.index({ dentistName: 1, appointmentDate: 1 });
appointmentSchema.index({ service: 1, appointmentDate: 1 });
appointmentSchema.index({ patientName: 1, email: 1 });
appointmentSchema.index(
  { patient: 1, promotion: 1 },
  {
    unique: true,
    partialFilterExpression: {
      patient: { $exists: true },
      promotion: { $exists: true },
    },
  },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
