const test = require("node:test");
const assert = require("node:assert/strict");

const { calculatePromotionForServices, promotionAppliesToService } = require("../utils/appointmentPromotion");

test("percentage promotions discount only eligible services in a multi-service booking", () => {
  const result = calculatePromotionForServices(
    { applicableServices: ["Oral Prophylaxis / Cleaning"] },
    [
      { serviceName: "Oral Prophylaxis / Cleaning", price: 1000 },
      { serviceName: "Braces", price: 2000 },
    ],
    { discountType: "percentage", discountValue: 10 },
  );

  assert.deepEqual(result, {
    eligibleServiceNames: ["Oral Prophylaxis / Cleaning"],
    originalPrice: 3000,
    discountAmount: 100,
    finalPrice: 2900,
  });
});

test("fixed promotion discounts are capped at the eligible services subtotal", () => {
  const result = calculatePromotionForServices(
    { applicableServices: ["Cleaning", "Examination"] },
    [
      { serviceName: "Cleaning", price: 400 },
      { serviceName: "Examination", price: 300 },
      { serviceName: "Braces", price: 5000 },
    ],
    { discountType: "fixed", discountValue: 1000 },
  );

  assert.deepEqual(result, {
    eligibleServiceNames: ["Cleaning", "Examination"],
    originalPrice: 5700,
    discountAmount: 700,
    finalPrice: 5000,
  });
});

test("all-services promotions apply to every selected service and service names are case-insensitive", () => {
  assert.equal(promotionAppliesToService({ applicableServices: ["All Services"] }, "Braces"), true);

  const result = calculatePromotionForServices(
    { serviceType: "All Services" },
    [{ serviceName: "Braces", price: 2500 }, { serviceName: "Cleaning", price: 500 }],
    { discountType: "percentage", discountValue: 20 },
  );

  assert.deepEqual(result, {
    eligibleServiceNames: ["Braces", "Cleaning"],
    originalPrice: 3000,
    discountAmount: 600,
    finalPrice: 2400,
  });
});

test("a single selected service retains the existing promotion calculation", () => {
  const result = calculatePromotionForServices(
    { applicableServices: ["Cleaning"] },
    [{ serviceName: "Cleaning", price: 1500 }],
    { discountType: "percentage", discountValue: 15 },
  );

  assert.deepEqual(result, {
    eligibleServiceNames: ["Cleaning"],
    originalPrice: 1500,
    discountAmount: 225,
    finalPrice: 1275,
  });
});
