const normalizeServiceName = (value) => String(value || "").trim().toLowerCase();

const promotionAppliesToService = (promotion, serviceName) => {
  const selected = normalizeServiceName(serviceName);
  const services = Array.isArray(promotion.applicableServices) && promotion.applicableServices.length
    ? promotion.applicableServices
    : promotion.serviceType
      ? [promotion.serviceType]
      : ["All Services"];

  return services.some((service) => {
    const normalized = normalizeServiceName(service);
    return normalized === "all services" || normalized === selected;
  });
};

const calculatePromotionPrice = (promotion, originalPrice) => {
  const price = Math.max(Number(originalPrice) || 0, 0);
  const discountType = promotion.effectiveDiscountType || promotion.discountType;
  const discountValue = Math.max(Number(promotion.effectiveDiscountValue ?? promotion.discountValue) || 0, 0);
  const discountAmount = discountType === "percentage"
    ? price * Math.min(discountValue, 100) / 100
    : Math.min(discountValue, price);
  const normalizedDiscount = Math.min(Math.max(Math.round(discountAmount * 100) / 100, 0), price);

  return {
    originalPrice: price,
    discountAmount: normalizedDiscount,
    finalPrice: Math.max(Math.round((price - normalizedDiscount) * 100) / 100, 0),
  };
};

const calculatePromotionForServices = (promotion, services, resolvedDiscount) => {
  const eligibleServices = services.filter((service) => promotionAppliesToService(promotion, service.serviceName));
  const originalPrice = services.reduce((total, service) => total + Math.max(Number(service.price) || 0, 0), 0);
  const eligibleSubtotal = eligibleServices.reduce((total, service) => total + Math.max(Number(service.price) || 0, 0), 0);
  const eligiblePrice = calculatePromotionPrice({
    ...promotion,
    effectiveDiscountType: resolvedDiscount.discountType,
    effectiveDiscountValue: resolvedDiscount.discountValue,
  }, eligibleSubtotal);
  const normalizedOriginalPrice = Math.round(originalPrice * 100) / 100;

  return {
    eligibleServiceNames: eligibleServices.map((service) => service.serviceName),
    originalPrice: normalizedOriginalPrice,
    discountAmount: eligiblePrice.discountAmount,
    finalPrice: Math.max(Math.round((normalizedOriginalPrice - eligiblePrice.discountAmount) * 100) / 100, 0),
  };
};

module.exports = {
  calculatePromotionForServices,
  promotionAppliesToService,
};
