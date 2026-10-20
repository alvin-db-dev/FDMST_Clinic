// Public URL of the deployed app.
const DEFAULT_ORIGINS = ["https://fdmsd.wonderprotect.net"];
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "");

const isProduction = () => process.env.NODE_ENV === "production";

const getAllowedOrigins = () => {
  const configured = [process.env.APP_URL, process.env.CLIENT_URL, process.env.CORS_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map(normalizeOrigin)
    .filter(Boolean);

  // Fall back to the deployed app when no origins are configured.
  return configured.length ? [...new Set(configured)] : [...DEFAULT_ORIGINS];
};

// The frontend is served by this server, so requests from a page on the same host are always allowed.
const isSameHostOrigin = (origin, host) => {
  try {
    return new URL(origin).host === String(host || "").toLowerCase();
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin, host) => {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (getAllowedOrigins().includes(normalized) || isSameHostOrigin(normalized, host)) return true;
  return !isProduction() && LOCAL_ORIGIN_PATTERN.test(normalized);
};

const validateEnvironment = () => {
  const required = ["MONGO_URI", "JWT_SECRET"];

  if (isProduction()) {
    required.push(
      "MAIL_API_URL",
      "MAIL_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_STORAGE_BUCKET",
    );
  }

  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (String(process.env.JWT_SECRET).length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }

  const seedEmail = String(process.env.ADMIN_SEED_EMAIL || "").trim();
  const seedPassword = String(process.env.ADMIN_SEED_PASSWORD || "");
  if (Boolean(seedEmail) !== Boolean(seedPassword)) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be configured together.");
  }
  if (seedPassword && seedPassword.length < 12) {
    throw new Error("ADMIN_SEED_PASSWORD must contain at least 12 characters.");
  }
};

module.exports = {
  DEFAULT_ORIGINS,
  getAllowedOrigins,
  isOriginAllowed,
  isProduction,
  normalizeOrigin,
  validateEnvironment,
};
