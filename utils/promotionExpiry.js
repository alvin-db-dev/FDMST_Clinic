const Promotion = require("../models/Promotion");

const PROMOTION_EXPIRY_INTERVAL_MS = 15 * 60 * 1000;

let intervalId = null;
let isRunning = false;

const expirePromotions = async () => {
  if (isRunning) return { modifiedCount: 0 };

  isRunning = true;

  try {
    const now = new Date();
    return await Promotion.updateMany(
      {
        status: "active",
        endDate: { $exists: true, $ne: null, $lte: now },
      },
      {
        $set: { status: "expired" },
      },
    );
  } catch (error) {
    console.error("Promotion expiry check failed:", error);
    return { modifiedCount: 0 };
  } finally {
    isRunning = false;
  }
};

const startPromotionExpiryMonitor = () => {
  if (intervalId) return intervalId;

  expirePromotions();
  intervalId = setInterval(expirePromotions, PROMOTION_EXPIRY_INTERVAL_MS);
  return intervalId;
};

const stopPromotionExpiryMonitor = () => {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
};

module.exports = {
  expirePromotions,
  startPromotionExpiryMonitor,
  stopPromotionExpiryMonitor,
};
