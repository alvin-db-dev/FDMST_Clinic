const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      trim: true,
      required: [true, "Item name is required."],
    },
    category: {
      type: String,
      trim: true,
      required: [true, "Category is required."],
    },
    quantity: {
      type: Number,
      min: [0, "Quantity cannot be negative."],
      default: 0,
    },
    unit: {
      type: String,
      trim: true,
      required: [true, "Unit is required."],
      default: "pcs",
    },
    reorderLevel: {
      type: Number,
      min: [0, "Reorder level cannot be negative."],
      default: 0,
    },
    supplier: {
      type: String,
      trim: true,
    },
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative."],
      default: 0,
    },
    purchasePrice: {
      type: Number,
      min: [0, "Purchase price cannot be negative."],
    },
    sellingPrice: {
      type: Number,
      min: [0, "Selling price cannot be negative."],
      default: 0,
    },
    expirationDate: {
      type: Date,
    },
    requiresPrescription: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["available", "low_stock", "out_of_stock"],
      default: "available",
    },
    notes: {
      type: String,
      trim: true,
    },
    usageHistory: [
      {
        quantity: {
          type: Number,
          default: 0,
        },
        patient: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Patient",
        },
        patientName: {
          type: String,
          trim: true,
        },
        appointment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Appointment",
        },
        treatmentRecord: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "DentalRecord",
        },
        dentistName: {
          type: String,
          trim: true,
        },
        staffMember: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        staffName: {
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
    transactionHistory: [
      {
        transactionId: {
          type: String,
          trim: true,
        },
        type: {
          type: String,
          enum: ["initial_stock", "restock", "sale", "treatment_usage", "manual_adjustment", "return", "damaged", "expired"],
          required: true,
        },
        quantityBefore: {
          type: Number,
          default: 0,
        },
        quantityChanged: {
          type: Number,
          default: 0,
        },
        quantityAfter: {
          type: Number,
          default: 0,
        },
        unitPrice: {
          type: Number,
          default: 0,
        },
        totalAmount: {
          type: Number,
          default: 0,
        },
        patientName: {
          type: String,
          trim: true,
        },
        appointment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Appointment",
        },
        prescriptionReference: {
          type: String,
          trim: true,
        },
        dentistName: {
          type: String,
          trim: true,
        },
        processedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        processedByName: {
          type: String,
          trim: true,
        },
        notes: {
          type: String,
          trim: true,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    collection: "inventory",
    timestamps: true,
  },
);

module.exports = mongoose.model("Inventory", inventorySchema);
