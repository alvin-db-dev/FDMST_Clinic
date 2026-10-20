import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  FaCalendarCheck,
  FaClock,
  FaGift,
  FaEnvelope,
  FaInfoCircle,
  FaMoneyBillWave,
  FaNotesMedical,
  FaPhoneAlt,
  FaRegCalendarAlt,
  FaStethoscope,
  FaTimes,
  FaTooth,
  FaUser,
  FaUserMd,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { getRoleHomePath } from '../../utils/auth.js'
import { addDaysToDateKey, clinicDateKey, isPastClinicSlot } from '../../utils/clinicTime.js'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition duration-200 placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const iconInputClass =
  `${inputClass} pl-11`

const textareaClass =
  'min-h-36 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium leading-6 text-slate-700 outline-none transition duration-200 placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const defaultAppointmentSettings = {
  openingTime: '09:00',
  closingTime: '17:00',
  appointmentDuration: 30,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  bufferTime: 10,
  allowWeekendAppointments: true,
  allowOnlineBooking: true,
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ADVANCE_BOOKING_DAYS = 14

function toMinutes(value) {
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

function formatTime(minutes, timeFormat = '12') {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (timeFormat === '24') {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${String(displayHours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`
}

function generateTimeSlots(appointmentSettings = defaultAppointmentSettings, timeFormat = '12') {
  const opening = toMinutes(appointmentSettings.openingTime || defaultAppointmentSettings.openingTime)
  const closing = toMinutes(appointmentSettings.closingTime || defaultAppointmentSettings.closingTime)
  const duration = Math.max(Number(appointmentSettings.appointmentDuration) || 30, 5)
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0)
  const step = duration + buffer
  const slots = []

  if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing <= opening || step <= 0) {
    return slots
  }

  for (let current = opening; current + duration <= closing && slots.length < 96; current += step) {
    slots.push(formatTime(current, timeFormat))
  }

  return slots
}

function isWorkingDate(dateValue, appointmentSettings = defaultAppointmentSettings) {
  if (!dateValue) return true

  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return true

  const dayName = dayNames[date.getDay()]
  const isWeekend = dayName === 'Saturday' || dayName === 'Sunday'

  if (isWeekend && appointmentSettings.allowWeekendAppointments === false) {
    return false
  }

  const workingDays = appointmentSettings.workingDays?.length
    ? appointmentSettings.workingDays
    : defaultAppointmentSettings.workingDays

  return workingDays.includes(dayName)
}

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-sky-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>
  )
}

function formatServicePrice(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? currencyFormatter.format(amount) : 'Price unavailable'
}

function formatServiceDuration(value) {
  const minutes = Number(value)
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'Duration not specified'
}

function formatDentistName(value, fallback = 'Flores Dizon') {
  const name = String(value || '').trim()
  if (!name) return fallback
  if (/^flores[-\s]+dizon\s+admin$/i.test(name)) return 'Flores Dizon'
  return name
    .replace(/^admin\s*[-–—]\s*/i, '')
    .replace(/\s*[-–—]\s*admin$/i, '')
    .replace(/-/g, ' ')
    .trim() || fallback
}

function formatPromoDiscount(promotion) {
  if (!promotion) return ''

  const value = Number(promotion.discountValue)
  if (!Number.isFinite(value) || value <= 0) return promotion.discountLabel || ''

  return promotion.discountType === 'percentage'
    ? `${value}% OFF`
    : `${currencyFormatter.format(value)} OFF`
}

function Field({ label, icon: Icon, error, children }) {
  return (
    <div className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
      <span>{label}</span>
      <span className="relative block">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </span>
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </div>
  )
}

function BookAppointmentPage() {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [user] = useState(() => authStorage.getUser())
  const availabilityRequestRef = useRef(0)
  const promoRequestRef = useRef(0)
  const [dentists, setDentists] = useState([])
  const [clinicSettings, setClinicSettings] = useState(null)
  const [bookingDataError, setBookingDataError] = useState('')
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const [availabilityMessage, setAvailabilityMessage] = useState('')
  const [form, setForm] = useState({
    patientName: '',
    contactNumber: '',
    email: '',
    appointmentDate: '',
    appointmentTime: '',
    dentistName: '',
    service: '',
    notes: '',
    reason: '',
    promoCode: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [appliedPromo, setAppliedPromo] = useState(null)
  const [promoMessage, setPromoMessage] = useState('')
  const [isApplyingPromo, setIsApplyingPromo] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(null)
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [reviewSnapshot, setReviewSnapshot] = useState(null)

  // "Today" on the clinic's clock, refreshed every 30 seconds so dates and time slots that pass while the
  // page is open stop being bookable.
  const [clinicNowTick, setClinicNowTick] = useState(() => Date.now())
  useEffect(() => {
    const intervalId = window.setInterval(() => setClinicNowTick(Date.now()), 30000)
    return () => window.clearInterval(intervalId)
  }, [])
  const minDate = useMemo(() => clinicDateKey(clinicNowTick), [clinicNowTick])
  const maxDate = useMemo(() => addDaysToDateKey(minDate, ADVANCE_BOOKING_DAYS), [minDate])
  const bookableTimeSlots = useMemo(
    () => availableTimeSlots.filter((slot) => !isPastClinicSlot(form.appointmentDate, slot, clinicNowTick)),
    [availableTimeSlots, form.appointmentDate, clinicNowTick],
  )

  useEffect(() => {
    if (form.appointmentTime && isPastClinicSlot(form.appointmentDate, form.appointmentTime, clinicNowTick)) {
      const timeoutId = window.setTimeout(() => {
        setForm((currentForm) => ({ ...currentForm, appointmentTime: '' }))
        setFieldErrors((currentErrors) => ({
          ...currentErrors,
          appointmentTime: 'Your selected time has just passed. Please choose another available time.',
        }))
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    return undefined
  }, [clinicNowTick, form.appointmentDate, form.appointmentTime])
  const settingsSource = clinicSettings?.appointmentSettings
  const workingDaysKey = Array.isArray(settingsSource?.workingDays)
    ? settingsSource.workingDays.join('|')
    : defaultAppointmentSettings.workingDays.join('|')
  const appointmentSettings = useMemo(() => ({
    ...defaultAppointmentSettings,
    ...(settingsSource || {}),
    workingDays: Array.isArray(settingsSource?.workingDays) && settingsSource.workingDays.length
      ? settingsSource.workingDays
      : defaultAppointmentSettings.workingDays,
  }), [
    settingsSource,
  ])
  const timeFormat = clinicSettings?.systemPreferences?.timeFormat || '12'
  const availableServices = useMemo(() => {
    const configuredServices = clinicSettings?.services
      ?.filter((service) => service.status !== 'inactive' && service.serviceName)
      ?.map((service) => ({
        ...service,
        serviceName: service.serviceName.trim(),
      }))

    return configuredServices || []
  }, [clinicSettings])
  const selectedService = useMemo(
    () => availableServices.find((service) => service.serviceName === form.service) || null,
    [availableServices, form.service],
  )
  const fallbackTimeSlots = useMemo(
    () => generateTimeSlots(appointmentSettings, timeFormat),
    [
      appointmentSettings,
      timeFormat,
    ],
  )
  const priceSummary = useMemo(() => {
    const originalPrice = selectedService && Number.isFinite(Number(selectedService.price)) ? Number(selectedService.price) : 0

    if (appliedPromo?.valid) {
      return {
        originalPrice: appliedPromo.originalPrice,
        discountAmount: appliedPromo.discountAmount,
        finalPrice: appliedPromo.finalPrice,
      }
    }

    return {
      originalPrice,
      discountAmount: 0,
      finalPrice: originalPrice,
    }
  }, [appliedPromo, selectedService])
  const formattedSelectedDate = useMemo(() => {
    if (!form.appointmentDate) return 'Not selected'
    const date = new Date(`${form.appointmentDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) return form.appointmentDate
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [form.appointmentDate])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const service = params.get('service')
    const promoCode = params.get('promoCode')

    if (!service && !promoCode) return

    const timeoutId = window.setTimeout(() => {
      setForm((currentForm) => ({
        ...currentForm,
        service: service || currentForm.service,
        promoCode: promoCode || currentForm.promoCode,
      }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [location.search])

  useEffect(() => {
    if (!user) return

    Promise.resolve().then(() => {
      setForm((currentForm) => ({
        ...currentForm,
        patientName: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.email || '',
        contactNumber: digitsOnly(user.contactNumber || ''),
      }))
    })
  }, [user])

  useEffect(() => {
    const loadBookingData = async () => {
      const [dentistsResult, settingsResult, profileResult] = await Promise.allSettled([
        fdmstApi.getClinicDentist(),
        fdmstApi.getPublicSettings(),
        fdmstApi.getProfile(),
      ])

      const loadedDentists = dentistsResult.status === 'fulfilled'
        ? (dentistsResult.value.data?.name ? [dentistsResult.value.data] : [])
        : []

      if (dentistsResult.status === 'fulfilled') {
        setDentists(loadedDentists)
      } else {
        setDentists([])
      }

      if (settingsResult.status === 'fulfilled') {
        setClinicSettings(settingsResult.value || null)
        setBookingDataError('')
      } else {
        setClinicSettings(null)
        setBookingDataError('Unable to load current clinic services. Please try again later.')
      }

      if (profileResult.status === 'fulfilled' && profileResult.value.user) {
        const profileUser = profileResult.value.user
        authStorage.saveSession({ user: profileUser })

        if (String(profileUser.role || '').toLowerCase() !== 'patient') {
          toast.error('Please sign in with a patient account to book an appointment.')
          navigate(getRoleHomePath(profileUser.role), { replace: true })
          return
        }
      }

      if (loadedDentists[0]?.name) {
        setForm((currentForm) => ({
          ...currentForm,
          dentistName: loadedDentists[0].name,
        }))
      }
    }

    loadBookingData()
  }, [navigate, toast])

  useEffect(() => {
    const clinicDentist = dentists[0]?.name
    if (!clinicDentist || form.dentistName === clinicDentist) return

    const timeoutId = window.setTimeout(() => {
      setForm((currentForm) => ({ ...currentForm, dentistName: clinicDentist }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [dentists, form.dentistName])

  useEffect(() => {
    const requestId = availabilityRequestRef.current + 1
    availabilityRequestRef.current = requestId

    if (!form.appointmentDate) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (form.appointmentDate < minDate) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('Selected date is unavailable. Please choose a future date.')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (form.appointmentDate > maxDate) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('Online booking is available up to 2 weeks in advance. Please choose an earlier date.')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (!isWorkingDate(form.appointmentDate, appointmentSettings)) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('No available appointments for this date. Please select another date.')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    let isMounted = true

    const loadAvailability = async () => {
      setIsLoadingAvailability(true)
      setAvailabilityMessage('Loading available appointments...')

      try {
        const response = await fdmstApi.getAppointmentAvailability({
          date: form.appointmentDate,
          dentistName: form.dentistName,
          service: form.service,
        })

        if (!isMounted || availabilityRequestRef.current !== requestId) return

        const slots = Array.isArray(response.slots) ? response.slots : fallbackTimeSlots
        setAvailableTimeSlots(slots)
        setAvailabilityMessage(slots.length ? '' : (response.message || 'No available appointments for this date. Please select another date.'))
        setForm((currentForm) => (
          currentForm.appointmentTime && !slots.includes(currentForm.appointmentTime)
            ? { ...currentForm, appointmentTime: '' }
            : currentForm
        ))
      } catch (error) {
        if (!isMounted || availabilityRequestRef.current !== requestId) return

        setAvailableTimeSlots([])
        setAvailabilityMessage(error.message || 'Unable to load available appointments. Please try again.')
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      } finally {
        if (isMounted && availabilityRequestRef.current === requestId) {
          setIsLoadingAvailability(false)
        }
      }
    }

    const timeoutId = window.setTimeout(loadAvailability, 180)

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
    }
  }, [
    form.appointmentDate,
    form.dentistName,
    form.service,
    minDate,
    maxDate,
    appointmentSettings,
    appointmentSettings.openingTime,
    appointmentSettings.closingTime,
    appointmentSettings.appointmentDuration,
    appointmentSettings.bufferTime,
    appointmentSettings.allowWeekendAppointments,
    appointmentSettings.allowOnlineBooking,
    fallbackTimeSlots,
    workingDaysKey,
    timeFormat,
  ])

  useEffect(() => {
    const requestId = promoRequestRef.current + 1
    promoRequestRef.current = requestId

    const manualCode = form.promoCode.trim()
    const timeoutId = window.setTimeout(async () => {
      setAppliedPromo(null)
      setPromoMessage('')

      if (!form.service || !selectedService) return

      setIsApplyingPromo(true)

      try {
        const response = await fdmstApi.validateAppointmentPromo({
          service: form.service,
          promoCode: manualCode,
          autoApply: !manualCode,
        })

        if (promoRequestRef.current !== requestId) return

        if (response.valid) {
          setAppliedPromo(response)
          setForm((currentForm) => currentForm.promoCode
            ? currentForm
            : { ...currentForm, promoCode: response.promotion?.promoCode || '' })
          setPromoMessage(response.message || 'Promotion applied.')
        } else if (manualCode) {
          setPromoMessage(response.message || 'Promo code could not be applied.')
        }
      } catch (error) {
        if (promoRequestRef.current !== requestId) return
        if (manualCode) {
          setPromoMessage(error.message || 'Promo code could not be applied.')
        }
      } finally {
        if (promoRequestRef.current === requestId) setIsApplyingPromo(false)
      }
    }, manualCode ? 350 : 150)

    return () => window.clearTimeout(timeoutId)
  }, [form.service, form.promoCode, selectedService])

  const handleChange = useCallback((event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
      ...(name === 'appointmentDate' && !nextValue ? { appointmentTime: '' } : {}),
    }))
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }, [])

  const validateBookingForm = () => {
    const mobileError = validateMobileNumber(form.contactNumber, { required: true })
    const dateError = !form.appointmentDate
      ? 'Please select an appointment date.'
      : ''
    const currentClinicDate = clinicDateKey()
    const pastDateError = form.appointmentDate && form.appointmentDate < currentClinicDate
      ? 'Selected date is unavailable. Please choose a future date.'
      : ''
    const advanceDateError = form.appointmentDate && form.appointmentDate > addDaysToDateKey(currentClinicDate, ADVANCE_BOOKING_DAYS)
      ? 'Online booking is available up to 2 weeks in advance. Please choose an earlier date.'
      : ''
    const scheduleError = form.appointmentDate && !isWorkingDate(form.appointmentDate, appointmentSettings)
      ? 'The selected date is outside the clinic schedule.'
      : ''
    const timeError = !form.appointmentTime
      ? 'Please select an available appointment time.'
      : ''
    const serviceError = !form.service
      ? 'Please select a dental service.'
      : !selectedService
        ? 'The selected service is no longer available.'
        : ''
    const unavailableTimeError = form.appointmentTime && bookableTimeSlots.length && !bookableTimeSlots.includes(form.appointmentTime)
      ? 'This time slot is no longer available. Please select another available time.'
      : ''
    // Checked against the clinic's clock at the moment of submitting, not the visitor's device time zone.
    const sameDayPastTimeError = form.appointmentTime && isPastClinicSlot(form.appointmentDate, form.appointmentTime)
      ? 'This time slot has already passed. Please select another available time.'
      : ''

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return false
    }

    if (dateError) {
      setFieldErrors({ appointmentDate: dateError })
      toast.error(dateError)
      return false
    }

    if (pastDateError) {
      setFieldErrors({ appointmentDate: pastDateError })
      toast.error(pastDateError)
      return false
    }

    if (advanceDateError) {
      setFieldErrors({ appointmentDate: advanceDateError })
      toast.error(advanceDateError)
      return false
    }

    if (scheduleError) {
      setFieldErrors({ appointmentDate: scheduleError })
      toast.error(scheduleError)
      return false
    }

    if (isLoadingAvailability) {
      toast.info('Loading available appointments. Please wait a moment.')
      return false
    }

    if (timeError) {
      setFieldErrors({ appointmentTime: timeError })
      toast.error(timeError)
      return false
    }

    if (unavailableTimeError) {
      setFieldErrors({ appointmentTime: unavailableTimeError })
      toast.error(unavailableTimeError)
      return false
    }

    if (sameDayPastTimeError) {
      setFieldErrors({ appointmentTime: sameDayPastTimeError })
      toast.error(sameDayPastTimeError)
      return false
    }

    if (serviceError) {
      setFieldErrors({ service: serviceError })
      toast.error(serviceError)
      return false
    }

    return true
  }

  const submitBookingRequest = async () => {
    setIsSubmitting(true)

    try {
      const response = await fdmstApi.bookAppointment(reviewSnapshot || form)
      toast.success(response.message || 'Appointment booked successfully.')
      setBookingSuccess(response.appointment || null)
      setIsReviewOpen(false)
      setReviewSnapshot(null)
      setFieldErrors({})
      setForm((currentForm) => ({
        ...currentForm,
        appointmentDate: '',
        appointmentTime: '',
        dentistName: '',
        service: '',
        promoCode: '',
        notes: '',
        reason: '',
      }))
      setAppliedPromo(null)
      setPromoMessage('')
    } catch (submitError) {
      setFieldErrors(submitError.errors || {})
      toast.error(submitError.message || 'Failed to book appointment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateBookingForm()) return
    setReviewSnapshot({ ...form })
    setIsReviewOpen(true)
  }

  const reviewData = reviewSnapshot || form

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl animate-[fadeIn_0.35s_ease-out]">
        <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-sky-950 px-6 py-8 text-white sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">
                  {clinicSettings?.clinicName || 'Flores-Dizon Dental Clinic'}
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Book an Appointment</h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-sky-100">
                  Schedule your dental appointment quickly and easily. Your request will remain pending until confirmed by the clinic.
                </p>
              </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-300 ring-1 ring-white/15 shadow-lg">
                <FaCalendarCheck className="h-9 w-9" aria-hidden="true" />
              </div>
            </div>
          </div>

          <form className="grid gap-8 p-6 sm:p-8 lg:p-10" onSubmit={handleSubmit}>
            <section className="grid gap-5">
              <SectionHeader
                icon={FaUser}
                title="Personal Information"
                description="Confirm the contact details the clinic will use for appointment updates."
              />
              <div className="grid gap-5 lg:grid-cols-3">
                <Field label="Full Name" icon={FaUser} error={fieldErrors.patientName}>
                  <input
                    className={iconInputClass}
                    type="text"
                    name="patientName"
                    value={form.patientName}
                    onChange={handleChange}
                    placeholder="Juan Dela Cruz"
                    required
                  />
                </Field>

                <Field label="Contact Number" icon={FaPhoneAlt} error={fieldErrors.contactNumber}>
                  <input
                    className={iconInputClass}
                    type="tel"
                    name="contactNumber"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.contactNumber}
                    onChange={handleChange}
                    placeholder="09XXXXXXXXX"
                    required
                  />
                </Field>

                <Field label="Email" icon={FaEnvelope} error={fieldErrors.email}>
                  <input
                    className={iconInputClass}
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                    required
                  />
                </Field>
              </div>
            </section>

            <div className="h-px bg-slate-100" />

            <section className="grid gap-5">
              <SectionHeader
                icon={FaRegCalendarAlt}
                title="Appointment Schedule"
                description="Choose your preferred visit date, time, and dental service."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Preferred Date" icon={FaRegCalendarAlt} error={fieldErrors.appointmentDate}>
                  <input
                    className={iconInputClass}
                    type="date"
                    name="appointmentDate"
                    min={minDate}
                    max={maxDate}
                    value={form.appointmentDate}
                    onChange={handleChange}
                    required
                  />
                </Field>

                <Field label="Preferred Time" icon={FaClock} error={fieldErrors.appointmentTime}>
                  <select
                    className={iconInputClass}
                    name="appointmentTime"
                    value={form.appointmentTime}
                    onChange={handleChange}
                    disabled={!form.appointmentDate || isLoadingAvailability || !bookableTimeSlots.length}
                    required
                  >
                    <option value="">
                      {isLoadingAvailability ? 'Loading available appointments...' : 'Select a time'}
                    </option>
                    {bookableTimeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Dentist" icon={FaUserMd} error={fieldErrors.dentistName}>
                  <div className={`${iconInputClass} flex items-center text-slate-900`}>
                    {formatDentistName(form.dentistName || dentists[0]?.name)}
                  </div>
                </Field>

                <Field label="Service" icon={FaTooth} error={fieldErrors.service}>
                  <select
                    className={iconInputClass}
                    name="service"
                    value={form.service}
                    onChange={handleChange}
                    disabled={!availableServices.length}
                    required
                  >
                    <option value="">Select a dental service</option>
                    {availableServices.map((service) => (
                      <option key={service.id || service.serviceName} value={service.serviceName}>
                        {service.serviceName}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Promo Code" icon={FaGift} error={fieldErrors.promoCode}>
                  <input
                    className={iconInputClass}
                    name="promoCode"
                    value={form.promoCode}
                    onChange={handleChange}
                    placeholder="Enter promo code"
                    autoComplete="off"
                  />
                </Field>
              </div>
              {bookingDataError ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  {bookingDataError}
                </div>
              ) : !availableServices.length ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  No active dental services are available for online booking right now.
                </div>
              ) : null}
              {form.service ? (
                <div className="grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 lg:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-950 ring-1 ring-sky-100">
                      <FaMoneyBillWave className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Estimated Price</p>
                      <p className="mt-1 text-sm font-semibold text-sky-950">{selectedService ? formatServicePrice(selectedService.price) : 'Price unavailable'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-950 ring-1 ring-sky-100">
                      <FaClock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Estimated Duration</p>
                      <p className="mt-1 text-sm font-semibold text-sky-950">{selectedService ? formatServiceDuration(selectedService.duration) : 'Duration not specified'}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-sky-100 lg:col-span-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {appliedPromo?.valid ? 'Promotion Applied' : 'Promotion'}
                      </p>
                      {isApplyingPromo ? (
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">Checking...</span>
                      ) : appliedPromo?.valid ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Applied</span>
                      ) : null}
                    </div>
                    {appliedPromo?.valid ? (
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="font-semibold text-sky-950">{appliedPromo.promotion?.title}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{appliedPromo.promotion?.promoCode}</p>
                        <p className="text-xs font-semibold text-emerald-700">{formatPromoDiscount(appliedPromo.promotion)}</p>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Original Price</span>
                          <span className="line-through">{currencyFormatter.format(priceSummary.originalPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>Discount{appliedPromo.promotion?.discountType === 'percentage' ? ` (${appliedPromo.promotion.discountValue}%)` : ''}</span>
                          <span>-{currencyFormatter.format(priceSummary.discountAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-sky-950">
                          <span>Final Price</span>
                          <span>{currencyFormatter.format(priceSummary.finalPrice)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        {promoMessage || 'Active service promos will be applied automatically when available.'}
                      </p>
                    )}
                    {promoMessage && appliedPromo?.valid ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-700">{promoMessage}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="min-h-7">
                {availabilityMessage && form.appointmentDate ? (
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold ring-1 ${
                      isLoadingAvailability
                        ? 'bg-sky-50 text-sky-700 ring-sky-100'
                        : bookableTimeSlots.length
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                          : 'bg-amber-50 text-amber-700 ring-amber-100'
                    }`}
                  >
                    {availabilityMessage}
                  </span>
                ) : null}
              </div>
              {form.appointmentDate ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-sky-950">Availability Preview</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDentistName(form.dentistName || dentists[0]?.name)} | {formattedSelectedDate} | {form.service || 'Select a service'}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                      {isLoadingAvailability ? 'Checking slots...' : `${bookableTimeSlots.length} slot${bookableTimeSlots.length === 1 ? '' : 's'} available`}
                    </span>
                  </div>
                  {bookableTimeSlots.length ? (
                    <div className="mt-4 flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
                      {bookableTimeSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setForm((currentForm) => ({ ...currentForm, appointmentTime: slot }))}
                          className={`h-9 rounded-xl px-3 text-xs font-semibold ring-1 transition ${
                            form.appointmentTime === slot
                              ? 'bg-sky-950 text-white ring-sky-950'
                              : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-sky-50 hover:text-sky-950'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                      {isLoadingAvailability ? 'Loading available appointment times...' : 'No available appointments for this date. Please select another date.'}
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            <div className="h-px bg-slate-100" />

            <section className="grid gap-5">
              <SectionHeader
                icon={FaNotesMedical}
                title="Visit Details"
                description="Share symptoms, concerns, or notes that can help the clinic prepare."
              />
              <label className="grid gap-2 text-sm font-semibold text-slate-600">
                Reason for Visit
                <span className="relative block">
                  <FaStethoscope className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <textarea
                    className={`${textareaClass} pl-11`}
                    name="reason"
                    value={form.reason}
                    onChange={handleChange}
                    placeholder="Example: tooth pain, routine cleaning, braces adjustment, follow-up checkup"
                  />
                </span>
                {fieldErrors.reason ? <span className="text-xs font-medium text-red-600">{fieldErrors.reason}</span> : null}
              </label>
            </section>

            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-950">
              <div className="flex gap-3">
                <FaInfoCircle className="mt-1 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                <p>
                  Please arrive 10-15 minutes before your scheduled appointment. Bring any previous dental records if applicable.
                </p>
              </div>
            </div>

            <div className="flex justify-stretch sm:justify-end">
              <button
                type="submit"
                disabled={isSubmitting || isLoadingAvailability}
                className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg shadow-sky-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-900 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <FaCalendarCheck className="h-4 w-4" aria-hidden="true" />
                {isSubmitting ? 'Requesting Appointment...' : 'Review Appointment'}
              </button>
            </div>
          </form>
        </section>
      </div>
      {isReviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5 sm:px-8">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Booking Summary</p>
                <h2 className="mt-2 text-2xl font-semibold text-sky-950">Review Appointment Details</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Please confirm these details before sending your appointment request to the clinic.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close appointment review"
              >
                <FaTimes />
              </button>
            </div>
            <div className="p-6 sm:p-8">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Service</dt><dd className="mt-1 font-semibold text-sky-950">{reviewData.service}</dd></div>
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Dentist</dt><dd className="mt-1 font-semibold text-sky-950">{formatDentistName(reviewData.dentistName || dentists[0]?.name)}</dd></div>
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Date</dt><dd className="mt-1 font-semibold text-sky-950">{formattedSelectedDate}</dd></div>
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Time</dt><dd className="mt-1 font-semibold text-sky-950">{reviewData.appointmentTime || 'Not selected'}</dd></div>
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Duration</dt><dd className="mt-1 font-semibold text-sky-950">{selectedService ? formatServiceDuration(selectedService.duration) : 'Duration not specified'}</dd></div>
                {reviewData.reason.trim() ? (
                  <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2 xl:col-span-3">
                    <dt className="font-semibold text-slate-900">Reason for Visit</dt>
                    <dd className="mt-1 whitespace-pre-line font-semibold leading-6 text-sky-950">{reviewData.reason.trim()}</dd>
                  </div>
                ) : null}
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Original Price</dt><dd className="mt-1 font-semibold text-sky-950">{currencyFormatter.format(priceSummary.originalPrice)}</dd></div>
                <div className="rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Promo Discount</dt><dd className="mt-1 font-semibold text-emerald-700">-{currencyFormatter.format(priceSummary.discountAmount)}</dd></div>
                <div className="rounded-2xl bg-emerald-50 p-4"><dt className="font-semibold text-slate-900">Final Price</dt><dd className="mt-1 text-lg font-semibold text-emerald-800">{currencyFormatter.format(priceSummary.finalPrice)}</dd></div>
              </dl>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsReviewOpen(false)}
                  disabled={isSubmitting}
                  className="inline-flex h-12 min-w-40 items-center justify-center rounded-xl border border-slate-200 px-5 text-center text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={submitBookingRequest}
                  disabled={isSubmitting}
                  className="inline-flex h-12 min-w-48 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FaCalendarCheck className="h-4 w-4" aria-hidden="true" />
                  {isSubmitting ? 'Confirming...' : 'Confirm Appointment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {bookingSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[0.85fr_1.45fr] lg:items-stretch">
              <div className="flex h-full flex-col justify-center rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-100">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                  <FaCalendarCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold text-sky-950">Appointment Request Sent</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Your request is pending clinic confirmation. Most requests are reviewed within 24 hours.
                </p>
              </div>
              <div className="flex h-full flex-col gap-6">
                <dl className="grid auto-rows-fr gap-3 text-sm sm:grid-cols-2">
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Appointment Number</dt><dd className="mt-2 break-words font-semibold text-sky-950">{bookingSuccess.appointmentId}</dd></div>
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Current Status</dt><dd className="mt-2 font-semibold text-amber-700">Pending</dd></div>
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Service</dt><dd className="mt-2 break-words font-semibold text-sky-950">{bookingSuccess.service}</dd></div>
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Dentist</dt><dd className="mt-2 break-words font-semibold text-sky-950">{formatDentistName(bookingSuccess.dentistName || dentists[0]?.name)}</dd></div>
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Date</dt><dd className="mt-2 font-semibold text-sky-950">{bookingSuccess.appointmentDate ? new Date(bookingSuccess.appointmentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not provided'}</dd></div>
                  <div className="flex min-h-24 flex-col justify-between rounded-2xl bg-slate-50 p-4"><dt className="font-semibold text-slate-900">Time</dt><dd className="mt-2 font-semibold text-sky-950">{bookingSuccess.appointmentTime}</dd></div>
                </dl>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setBookingSuccess(null)}
                    className="inline-flex h-12 min-w-48 items-center justify-center rounded-xl border border-slate-200 px-5 text-center text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
                  >
                    Book Another Appointment
                  </button>
	                  <Link
	                    to="/patient"
	                    state={{ refreshDashboard: true }}
	                    className="inline-flex h-12 min-w-44 items-center justify-center rounded-xl border border-slate-200 px-5 text-center text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50"
	                  >
                    Return to Dashboard
                  </Link>
	                  <Link
	                    to="/patient"
	                    state={{ refreshDashboard: true, openAppointments: true }}
	                    className="inline-flex h-12 min-w-48 items-center justify-center rounded-xl bg-sky-950 px-5 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-900"
	                  >
                    View My Appointments
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default BookAppointmentPage
