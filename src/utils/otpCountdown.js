export const secondsUntil = (dateValue) => {
  if (!dateValue) return 0

  const targetDate = new Date(dateValue)
  const targetTime = targetDate.getTime()

  if (Number.isNaN(targetTime)) return 0

  return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000))
}

export const formatOtpCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export const getOtpResendErrorMessage = (error) => {
  if (error?.status !== 429) return error?.message

  const waitSeconds = Number(error.retryAfterSeconds) || secondsUntil(error.nextAllowedAt)
  const waitText = waitSeconds > 0 ? ` Try again in ${formatOtpCountdown(waitSeconds)}.` : ''

  return `${error.message || 'Please wait before requesting another OTP.'}${waitText}`
}
