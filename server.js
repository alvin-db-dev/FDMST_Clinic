const path = require("path");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, ".env"), quiet: true });

const app = require("./app");
const connectDatabase = require("./config/database");
const { isOriginAllowed, validateEnvironment } = require("./config/environment");
const seedAdmin = require("./scripts/seedAdmin");
const { startAppointmentExpiryMonitor, stopAppointmentExpiryMonitor } = require("./utils/appointmentExpiry");
const { registerSocketServer } = require("./utils/messagingSocket");
const { startPromotionExpiryMonitor, stopPromotionExpiryMonitor } = require("./utils/promotionExpiry");

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || "0.0.0.0";
let server;
let io;

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully.`);
  stopAppointmentExpiryMonitor();
  stopPromotionExpiryMonitor();
  io?.disconnectSockets(true);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  const closeDatabase = async () => {
    await mongoose.disconnect().catch(() => {});
    clearTimeout(forceExit);
    process.exit(0);
  };

  if (server?.listening) server.close(closeDatabase);
  else closeDatabase();
};

const startServer = async () => {
  try {
    validateEnvironment();
    await connectDatabase();
    await seedAdmin();
    startAppointmentExpiryMonitor();
    startPromotionExpiryMonitor();

    server = http.createServer(app);
    io = new Server(server, {
      cors(req, callback) {
        if (isOriginAllowed(req.headers.origin, req.headers.host)) {
          return callback(null, { origin: true, methods: ["GET", "POST"] });
        }
        return callback(new Error("This origin is not allowed to connect."));
      },
    });
    registerSocketServer(io);

    server.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

startServer();
