const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { getJwtSecret } = require("../config/auth");
const asyncHandler = require("../utils/asyncHandler");

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.sub);

    if (!user || user.status === "inactive") {
      return res.status(401).json({ message: "Invalid or inactive account." });
    }

    req.user = {
      id: user._id,
      email: user.email,
      role: String(user.role || "").toLowerCase(),
      firstName: user.firstName,
      lastName: user.lastName,
      contactNumber: user.contactNumber,
      profilePhoto: user.profilePhoto,
    };

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
});

const authorize =
  (...roles) =>
  (req, res, next) => {
    const userRole = String(req.user?.role || "").toLowerCase();
    const allowedRoles = roles.map((role) => String(role).toLowerCase());

    if (!req.user || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: "You do not have permission to access this resource." });
    }

    next();
  };

module.exports = {
  authenticate,
  authorize,
};
