const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    serviceType: {
      type: String,
      trim: true,
    },
    applicableServices: [
      {
        type: String,
        trim: true,
      },
    ],
    promoCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      required: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "fixed",
    },
    discountValue: {
      type: Number,
      min: [0, "Discount value cannot be negative."],
      default: 0,
    },
    discountLabel: {
      type: String,
      trim: true,
    },
    maxRedemptions: {
      type: Number,
      min: [1, "Maximum redemption must be at least 1."],
    },
    audience: {
      type: String,
      enum: ["new_patients", "current_patients", "all"],
      default: "all",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      default: "active",
    },
    startDate: Date,
    endDate: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    collection: "promotions",
    timestamps: true,
  },
);

module.exports = mongoose.model("Promotion", promotionSchema);
