// The clinic operates on Philippine time. Booking rules use the clinic's clock, not the visitor's device,
// so "today" and "already passed" mean the same thing for every patient and match the server.
export const CLINIC_TIME_ZONE = 'Asia/Manila'

function clinicParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function clinicDateKey(value = new Date()) {
  const parts = clinicParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function clinicMinutesNow(value = new Date()) {
  const parts = clinicParts(value)
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute)
}

export function timeLabelToMinutes(value) {
  const normalized = String(value || '').trim()
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1])
    const minutes = Number(meridiemMatch[2])
    const period = meridiemMatch[3].toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return hours * 60 + minutes
  }

  const [hours = 0, minutes = 0] = normalized.split(':').map(Number)
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0)
}

// True when the slot on `dateKey` ("YYYY-MM-DD") at `timeLabel` has already started on the clinic's clock.
export function isPastClinicSlot(dateKey, timeLabel, now = new Date()) {
  if (!dateKey) return false
  const todayKey = clinicDateKey(now)
  if (dateKey < todayKey) return true
  if (dateKey > todayKey) return false
  return timeLabelToMinutes(timeLabel) <= clinicMinutesNow(now)
}
