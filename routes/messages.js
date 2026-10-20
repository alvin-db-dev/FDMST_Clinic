const express = require("express");
const mongoose = require("mongoose");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { createChatFileSignedUrl, isManagedChatFile } = require("../services/supabaseStorageService");
const { emitToConversation, emitToUser, isUserOnline } = require("../utils/messagingSocket");

const router = express.Router();
const MESSAGE_LIMIT = 80;
const PREVIEW_LIMIT = 90;

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "FDMST User";
const cleanMessage = (value) => String(value || "")
  .replace(/[<>]/g, "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 2000);

const sanitizeUser = (user) => ({
  id: user?._id || user?.id,
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
  name: fullName(user),
  email: user?.email || "",
  role: user?.role || "",
  profilePhoto: user?.profilePhoto || "",
  isOnline: isUserOnline(user?._id || user?.id),
});

const sanitizeMessage = async (message) => {
  const attachment = message.attachment?.path
    ? {
        filename: message.attachment.filename,
        type: message.attachment.type,
        size: message.attachment.size,
        url: await createChatFileSignedUrl(message.attachment).catch(() => ""),
      }
    : message.attachment || null;
  return {
    id: message._id,
    conversationId: message.conversation,
    sender: message.sender,
    receiver: message.receiver,
    content: message.content,
    attachment,
    deliveryStatus: message.deliveryStatus,
    readBy: message.readBy || [],
    createdAt: message.createdAt,
  };
};

const normalizeAttachment = (attachment) => {
  if (!attachment) return undefined;
  if (!isManagedChatFile(attachment)) {
    const error = new Error("Upload the attachment to secure chat storage before sending it.");
    error.status = 400;
    throw error;
  }
  return {
    filename: String(attachment.filename || "Attachment").trim().slice(0, 180),
    path: attachment.path,
    bucket: attachment.bucket,
    type: String(attachment.type || "").trim(),
    size: Number(attachment.size) || undefined,
  };
};

const getOtherParticipant = (conversation, currentUserId) => {
  const participants = [conversation.patient, conversation.clinicUser].filter(Boolean);
  return participants.find((participant) => String(participant._id || participant.id) !== String(currentUserId));
};

const getConversationQuery = (user) => (
  user.role === "patient"
    ? { patient: user.id }
    : { participants: user.id }
);

const canAccessConversation = (conversation, user) => (
  conversation?.participants?.some((participant) => String(participant._id || participant) === String(user.id))
);

const getDefaultClinicUser = async () => {
  const admin = await User.findOne({ role: "admin", status: "active" }).sort({ createdAt: 1 });
  if (admin) return admin;
  return User.findOne({ role: "staff", status: "active" }).sort({ createdAt: 1 });
};

const resolveConversationParticipants = async (req) => {
  if (req.user.role === "patient") {
    const clinicUserId = req.body.clinicUserId || req.query.clinicUserId;
    const clinicUser = clinicUserId && mongoose.Types.ObjectId.isValid(clinicUserId)
      ? await User.findOne({ _id: clinicUserId, role: { $in: ["admin", "staff"] }, status: "active" })
      : await getDefaultClinicUser();

    if (!clinicUser) {
      const error = new Error("No clinic staff are available for messaging right now.");
      error.status = 404;
      throw error;
    }

    return { patient: req.user.id, clinicUser: clinicUser._id };
  }

  const recipientId = req.body.staffId || req.body.patientId || req.query.staffId || req.query.patientId;
  const recipientRole = req.body.staffId || req.query.staffId ? "staff" : "patient";
  if (recipientRole === "staff" && req.user.role !== "admin") {
    const error = new Error("Only admins can start staff conversations.");
    error.status = 403;
    throw error;
  }
  if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
    const error = new Error("Please select a conversation recipient.");
    error.status = 400;
    throw error;
  }

  const recipient = await User.findOne({ _id: recipientId, role: recipientRole, status: recipientRole === "staff" ? "active" : { $ne: "inactive" } });
  if (!recipient) {
    const error = new Error("Recipient account not found.");
    error.status = 404;
    throw error;
  }

  return { patient: recipient._id, clinicUser: req.user.id };
};

const findOrCreateConversation = async ({ patient, clinicUser }) => {
  const existing = await Conversation.findOne({ patient, clinicUser });
  if (existing) return existing;

  return Conversation.create({
    patient,
    clinicUser,
    participants: [patient, clinicUser],
    lastMessageAt: new Date(),
  });
};

const populateConversation = (query) => query
  .populate("patient", "firstName lastName email profilePhoto role status")
  .populate("clinicUser", "firstName lastName email profilePhoto role status")
  .populate("lastMessageSender", "firstName lastName email role");

const sanitizeConversation = async (conversation, currentUserId) => {
  const [unreadCount, latestVisibleMessage] = await Promise.all([
    Message.countDocuments({
      conversation: conversation._id,
      receiver: currentUserId,
      "readBy.user": { $ne: currentUserId },
      deletedFor: { $ne: currentUserId },
    }),
    Message.findOne({
      conversation: conversation._id,
      deletedFor: { $ne: currentUserId },
    }).sort({ createdAt: -1 }).select("content attachment createdAt sender").lean(),
  ]);
  const otherUser = getOtherParticipant(conversation, currentUserId);

  return {
    id: conversation._id,
    patient: sanitizeUser(conversation.patient),
    clinicUser: sanitizeUser(conversation.clinicUser),
    otherUser: sanitizeUser(otherUser),
    lastMessage: latestVisibleMessage
      ? cleanMessage(latestVisibleMessage.content).slice(0, PREVIEW_LIMIT) || "Attachment"
      : "",
    lastMessageAt: latestVisibleMessage?.createdAt || conversation.createdAt,
    lastMessageSender: conversation.lastMessageSender ? sanitizeUser(conversation.lastMessageSender) : null,
    unreadCount,
    isArchived: (conversation.archivedBy || []).some((userId) => String(userId) === String(currentUserId)),
    updatedAt: conversation.updatedAt,
  };
};

router.use(authenticate);

router.get(
  "/recipients",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    const query = req.user.role === "patient"
      ? { role: { $in: ["admin", "staff"] }, status: "active" }
      : req.user.role === "admin"
        ? { $or: [{ role: "patient", status: { $ne: "inactive" } }, { role: "staff", status: "active" }], _id: { $ne: req.user.id } }
        : { role: "patient", status: { $ne: "inactive" } };
    const users = await User.find(query).sort({ role: -1, firstName: 1, lastName: 1 }).select("firstName lastName email role profilePhoto status").limit(100);
    res.json({ data: users.map(sanitizeUser) });
  }),
);

router.get(
  "/conversations",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    const query = getConversationQuery(req.user);
    query.deletedBy = { $ne: req.user.id };
    if (req.query.status === "archived") query.archivedBy = req.user.id;
    if (req.query.status === "active") query.archivedBy = { $ne: req.user.id };

    const conversations = await populateConversation(
      Conversation.find(query).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100),
    );
    let data = await Promise.all(conversations.map((conversation) => sanitizeConversation(conversation, req.user.id)));

    if (req.query.status === "unread") {
      data = data.filter((conversation) => conversation.unreadCount > 0);
    }

    const search = String(req.query.search || "").trim().toLowerCase();
    if (search) {
      data = data.filter((conversation) =>
        [conversation.patient.name, conversation.clinicUser.name, conversation.otherUser.name, conversation.lastMessage]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }

    res.json({ data });
  }),
);

router.post(
  "/conversations",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    const participants = await resolveConversationParticipants(req);
    const existingConversation = await findOrCreateConversation(participants);
    await Conversation.updateOne(
      { _id: existingConversation._id },
      { $pull: { deletedBy: req.user.id } },
    );
    const conversation = await populateConversation(Conversation.findById(existingConversation._id));

    res.status(201).json({ conversation: await sanitizeConversation(conversation, req.user.id) });
  }),
);

router.get(
  "/conversations/:id/messages",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    const conversation = await populateConversation(Conversation.findById(req.params.id));
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const messages = await Message.find({
      conversation: conversation._id,
      deletedFor: { $ne: req.user.id },
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || MESSAGE_LIMIT, 150))
      .lean();

    res.json({
      conversation: await sanitizeConversation(conversation, req.user.id),
      data: await Promise.all(messages.reverse().map(sanitizeMessage)),
    });
  }),
);

router.post(
  "/conversations/:id/messages",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    const conversation = await populateConversation(Conversation.findById(req.params.id));
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const content = cleanMessage(req.body.content);
    if (!content && !req.body.attachment) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const receiver = getOtherParticipant(conversation, req.user.id);
    const attachment = normalizeAttachment(req.body.attachment);
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user.id,
      receiver: receiver._id,
      content,
      attachment,
      deliveryStatus: isUserOnline(receiver._id) ? "delivered" : "sent",
      readBy: [{ user: req.user.id, readAt: new Date() }],
    });

    conversation.lastMessage = content.slice(0, PREVIEW_LIMIT) || "Attachment";
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageSender = req.user.id;
    conversation.deletedBy = [];
    await conversation.save();

    const notification = await Notification.create({
      user: receiver._id,
      title: "New message",
      message: `${fullName(req.user)}: ${conversation.lastMessage}`,
      type: "message",
      metadata: {
        conversationId: conversation._id,
        senderId: req.user.id,
        target: "messages",
      },
    });

    const payload = {
      conversationId: conversation._id,
      message: await sanitizeMessage(message.toObject()),
      sender: sanitizeUser(req.user),
      notification: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      },
    };

    emitToConversation(conversation._id, "message:new", payload);
    emitToUser(receiver._id, "message:notification", payload);

    res.status(201).json(payload);
  }),
);

router.delete(
  "/conversations/:id/messages/:messageId",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.messageId)) {
      return res.status(400).json({ message: "Invalid message reference." });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    const message = await Message.findOne({ _id: req.params.messageId, conversation: conversation._id });
    if (!message) return res.status(404).json({ message: "Message not found." });

    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.user.id } });
    emitToUser(req.user.id, "message:deleted", { conversationId: conversation._id, messageId: message._id });
    res.json({ message: "Message deleted for you." });
  }),
);

router.delete(
  "/conversations/:id",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    await Promise.all([
      Conversation.updateOne(
        { _id: conversation._id },
        {
          $addToSet: { deletedBy: req.user.id },
          $pull: { archivedBy: req.user.id },
        },
      ),
      Message.updateMany(
        { conversation: conversation._id, deletedFor: { $ne: req.user.id } },
        { $addToSet: { deletedFor: req.user.id } },
      ),
    ]);

    emitToUser(req.user.id, "conversation:deleted", { conversationId: conversation._id });
    res.json({ message: "Conversation and past messages deleted for you." });
  }),
);

router.patch(
  "/conversations/:id/archive",
  authorize("admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }
    const conversation = await populateConversation(Conversation.findById(req.params.id));
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const shouldArchive = req.body.archived !== false;
    await Conversation.updateOne(
      { _id: conversation._id },
      shouldArchive
        ? { $addToSet: { archivedBy: req.user.id } }
        : { $pull: { archivedBy: req.user.id } },
    );
    const updated = await populateConversation(Conversation.findById(conversation._id));
    emitToUser(req.user.id, "conversation:archived", { conversationId: conversation._id, archived: shouldArchive });
    res.json({
      message: shouldArchive ? "Conversation archived." : "Conversation restored.",
      conversation: await sanitizeConversation(updated, req.user.id),
    });
  }),
);

router.patch(
  "/conversations/:id/read",
  authorize("patient", "admin", "staff"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !canAccessConversation(conversation, req.user)) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const now = new Date();
    await Message.updateMany(
      {
        conversation: conversation._id,
        receiver: req.user.id,
        "readBy.user": { $ne: req.user.id },
      },
      {
        $set: { deliveryStatus: "read" },
        $push: { readBy: { user: req.user.id, readAt: now } },
      },
    );
    await Notification.updateMany({
      user: req.user.id,
      type: "message",
      "metadata.conversationId": conversation._id,
    }, { $set: { isRead: true } });

    emitToConversation(conversation._id, "message:read", { conversationId: conversation._id, userId: req.user.id, readAt: now });
    res.json({ message: "Conversation marked as read." });
  }),
);

module.exports = router;
