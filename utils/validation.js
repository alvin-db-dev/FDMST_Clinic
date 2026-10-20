const MOBILE_NUMBER_MESSAGE = "Mobile number must contain exactly 11 digits.";
const MOBILE_NUMBER_REGEX = /^09\d{9}$/;

const normalizeMobileNumber = (value) => (value || "").trim();

const isValidMobileNumber = (value, { required = false } = {}) => {
  const normalizedValue = normalizeMobileNumber(value);

  if (!normalizedValue) {
    return !required;
  }

  return MOBILE_NUMBER_REGEX.test(normalizedValue);
};

module.exports = {
  MOBILE_NUMBER_MESSAGE,
  isValidMobileNumber,
  normalizeMobileNumber,
};
