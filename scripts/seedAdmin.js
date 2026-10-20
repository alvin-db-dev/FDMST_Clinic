const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const connectDatabase = require("../config/database");
const User = require("../models/User");
const { hashPasswordBcrypt } = require("../utils/password");

const seedAdmin = async () => {
  const adminEmail = String(process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_SEED_PASSWORD || "");

  if (!adminEmail && !adminPassword) {
    console.log("Admin bootstrap skipped; no ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD configured.");
    return null;
  }

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be configured together.");
  }

  if (adminPassword.length < 12) {
    throw new Error("ADMIN_SEED_PASSWORD must contain at least 12 characters.");
  }

  const existingAdmin = await User.findOne({ email: adminEmail });

  if (existingAdmin) {
    console.log(`Admin account already exists for ${adminEmail}.`);
    return existingAdmin;
  }

  const passwordHash = await hashPasswordBcrypt(adminPassword);

  const admin = await User.create({
    firstName: String(process.env.ADMIN_SEED_FIRST_NAME || "Clinic").trim(),
    lastName: String(process.env.ADMIN_SEED_LAST_NAME || "Administrator").trim(),
    email: adminEmail,
    passwordHash,
    role: "admin",
    accountStatus: "active_admin",
    status: "active",
  });

  console.log(`Admin account created for ${adminEmail}. Change the bootstrap password immediately.`);
  return admin;
};

const runSeed = async () => {
  await connectDatabase();
  await seedAdmin();
  process.exit(0);
};

if (require.main === module) {
  runSeed().catch((error) => {
    console.error("Failed to seed admin account:", error.message);
    process.exit(1);
  });
}

module.exports = seedAdmin;
