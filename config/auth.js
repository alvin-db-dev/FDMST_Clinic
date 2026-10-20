const getJwtSecret = () => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is missing. Add it to .env.");
  }

  return jwtSecret;
};

const getJwtExpiresIn = () => process.env.JWT_EXPIRES_IN || "7d";

module.exports = {
  getJwtSecret,
  getJwtExpiresIn,
};
