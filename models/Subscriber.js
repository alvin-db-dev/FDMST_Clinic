const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    source: {
      type: String,
      trim: true,
      default: "website",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    collection: "subscribers",
    timestamps: true,
  },
);

module.exports = mongoose.model("Subscriber", subscriberSchema);
