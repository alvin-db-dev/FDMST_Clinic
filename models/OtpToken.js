const mongoose = require("mongoose");

const otpTokenSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["registration", "password_reset"],
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attempts: {
      type: Number,
      default: 0,
    },
    consumedAt: Date,
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    collection: "otp_tokens",
    timestamps: true,
  },
);

otpTokenSchema.index({ email: 1, purpose: 1, consumedAt: 1, expiresAt: 1 });

module.exports = mongoose.model("OtpToken", otpTokenSchema);
