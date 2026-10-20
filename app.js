const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { rateLimit } = require("express-rate-limit");

const apiRoutes = require("./routes");
const { isOriginAllowed, isProduction, normalizeOrigin } = require("./config/environment");

const app = express();
const frontendDistPath = path.resolve(__dirname, "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

const corsOptions = {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  credentials: false,
  maxAge: 86400,
};

const corsDelegate = (req, callback) => {
  const { origin, host } = req.headers;
  if (isOriginAllowed(origin, host)) return callback(null, corsOptions);

  const error = new Error(`Origin ${normalizeOrigin(origin)} is not allowed to access the API.`);
  error.status = 403;
  return callback(error);
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 500),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path === "/ready",
  message: { message: "Too many requests. Please wait and try again." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please wait and try again." },
});

app.disable("x-powered-by");
if (isProduction()) app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", "https:", "wss:", ...(!isProduction() ? ["http:", "ws:"] : [])],
      fontSrc: ["'self'", "data:"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsDelegate));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(morgan(isProduction() ? "combined" : "dev"));

app.get("/api", (req, res) => {
  res.json({
    message: "FDMST API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/api/ready", (req, res) => {
  const isReady = mongoose.connection.readyState === 1;
  res.status(isReady ? 200 : 503).json({
    status: isReady ? "ready" : "not_ready",
    database: isReady ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", apiRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath, {
    etag: true,
    index: false,
    maxAge: isProduction() ? "1d" : 0,
  }));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || !req.accepts("html")) {
      return next();
    }
    return res.sendFile(frontendIndexPath);
  });
} else {
  app.get("/", (req, res) => {
    res.json({ message: "FDMST API is running" });
  });
}

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl}`, isProduction() ? error.message : error);

  if (error.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(error.errors).map(([field, validationError]) => [
        field,
        validationError.message,
      ]),
    );

    return res.status(400).json({
      message: "Please review the highlighted fields.",
      errors,
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      message: "Invalid value provided. Please review your entry.",
      errors: {
        [error.path]: "Invalid value provided.",
      },
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      message: "A record with the same details already exists.",
      errors: error.keyPattern || {},
    });
  }

  res.status(error.status || 500).json({
    message: error.status ? error.message : "Something went wrong. Please try again.",
    ...(error.errors ? { errors: error.errors } : {}),
    ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    ...(error.nextAllowedAt ? { nextAllowedAt: error.nextAllowedAt } : {}),
    ...(error.otpExpiresAt ? { otpExpiresAt: error.otpExpiresAt } : {}),
  });
});

module.exports = app;
