export const MOBILE_NUMBER_MESSAGE = 'Mobile number must contain exactly 11 digits.'
export const MOBILE_NUMBER_PATTERN = /^09\d{9}$/

export function digitsOnly(value) {
  return (value || '').replace(/\D/g, '').slice(0, 11)
}

export function validateMobileNumber(value, { required = false } = {}) {
  if (!value) {
    return required ? MOBILE_NUMBER_MESSAGE : ''
  }

  return MOBILE_NUMBER_PATTERN.test(value) ? '' : MOBILE_NUMBER_MESSAGE
}
