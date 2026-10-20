const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { getJwtSecret } = require("../config/auth");

let ioInstance = null;
const onlineUsers = new Map();

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

const registerSocketServer = (io) => {
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("Authentication required."));

      const payload = jwt.verify(token, getJwtSecret());
      const user = await User.findById(payload.sub).select("firstName lastName email role status");
      if (!user || user.status === "inactive") return next(new Error("Invalid or inactive account."));

      socket.user = {
        id: String(user._id),
        email: user.email,
        role: String(user.role || "").toLowerCase(),
        firstName: user.firstName,
        lastName: user.lastName,
      };
      return next();
    } catch {
      return next(new Error("Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
    socket.join(userRoom(userId));
    io.emit("presence:update", { userId, isOnline: true });

    socket.on("conversation:join", (conversationId) => {
      if (conversationId) socket.join(conversationRoom(conversationId));
    });

    socket.on("conversation:leave", (conversationId) => {
      if (conversationId) socket.leave(conversationRoom(conversationId));
    });

    socket.on("typing:start", ({ conversationId }) => {
      if (conversationId) socket.to(conversationRoom(conversationId)).emit("typing:start", { conversationId, userId });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (conversationId) socket.to(conversationRoom(conversationId)).emit("typing:stop", { conversationId, userId });
    });

    socket.on("disconnect", () => {
      const count = Math.max((onlineUsers.get(userId) || 1) - 1, 0);
      if (count) {
        onlineUsers.set(userId, count);
      } else {
        onlineUsers.delete(userId);
        io.emit("presence:update", { userId, isOnline: false });
      }
    });
  });
};

const emitToUser = (userId, event, payload) => {
  if (ioInstance && userId) ioInstance.to(userRoom(String(userId))).emit(event, payload);
};

const emitToConversation = (conversationId, event, payload) => {
  if (ioInstance && conversationId) ioInstance.to(conversationRoom(String(conversationId))).emit(event, payload);
};

const isUserOnline = (userId) => onlineUsers.has(String(userId));

module.exports = {
  emitToConversation,
  emitToUser,
  isUserOnline,
  registerSocketServer,
};
