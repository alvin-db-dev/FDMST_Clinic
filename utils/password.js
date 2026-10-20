const crypto = require("crypto");
const { promisify } = require("util");
const bcrypt = require("bcrypt");

const scrypt = promisify(crypto.scrypt);

const hashPasswordScrypt = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
};

const hashPasswordBcrypt = async (password) => bcrypt.hash(password, 10);

const verifyPassword = async (password, passwordHash) => {
  if (!passwordHash) {
    return false;
  }

  if (passwordHash.startsWith("$2")) {
    return bcrypt.compare(password, passwordHash);
  }

  const [algorithm, salt, hash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");
  const derivedHash = Buffer.from(derivedKey.toString("hex"), "hex");

  if (storedHash.length !== derivedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedHash, derivedHash);
};

module.exports = {
  hashPasswordScrypt,
  hashPasswordBcrypt,
  verifyPassword,
};
