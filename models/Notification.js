const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    message: {
      type: String,
      trim: true,
      required: true,
    },
    type: {
      type: String,
      enum: ["appointment", "inventory", "feedback", "promotion", "message", "system"],
      default: "system",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    scheduledFor: Date,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: "notifications",
    timestamps: true,
  },
);

module.exports = mongoose.model("Notification", notificationSchema);
