const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    path: {
      type: String,
      trim: true,
    },
    bucket: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    size: Number,
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      default: "",
    },
    attachment: attachmentSchema,
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveryStatus: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    collection: "messages",
    timestamps: true,
  },
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, deliveryStatus: 1 });

module.exports = mongoose.model("Message", messageSchema);
