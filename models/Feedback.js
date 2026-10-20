const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    patientName: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    category: {
      type: String,
      enum: ["scheduling", "service_quality", "overall_experience"],
      default: "overall_experience",
    },
    comments: {
      type: String,
      trim: true,
      required: true,
      maxlength: 1500,
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
  },
  {
    collection: "feedback",
    timestamps: true,
  },
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ patient: 1, createdAt: -1 });
feedbackSchema.index({ appointment: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
