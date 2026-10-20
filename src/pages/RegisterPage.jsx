import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fdmstApi } from '../api/fdmstApi.js'
import OtpInput from '../components/OtpInput.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatOtpCountdown, getOtpResendErrorMessage, secondsUntil } from '../utils/otpCountdown.js'
import { digitsOnly, validateMobileNumber } from '../utils/validation.js'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  dateOfBirth: '',
  guardianName: '',
  guardianRelationship: '',
  guardianContactNumber: '',
  guardianEmail: '',
  guardianAddress: '',
  gender: 'prefer_not_to_say',
  address: '',
  allergies: '',
  medicalHistory: '',
  password: '',
  confirmPassword: '',
  acceptedPrivacy: false,
}

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-5 text-base font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return ''

  const birthDate = new Date(dateOfBirth)
  const today = new Date()

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return ''

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()
  const hasBirthdayPassed =
    monthDifference > 0 ||
    (monthDifference === 0 && today.getDate() >= birthDate.getDate())

  if (!hasBirthdayPassed) {
    age -= 1
  }

  return age >= 0 ? String(age) : ''
}

function EyeIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function UserPlusIcon() {
  return (
    <svg
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}

function ToothIcon() {
  return (
    <svg
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
    </svg>
  )
}

function RegisterPage() {
  const toast = useToast()
  const [form, setForm] = useState(initialForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [clinicSettings, setClinicSettings] = useState(null)
  const [pendingRegistration, setPendingRegistration] = useState(null)
  const [otp, setOtp] = useState('')
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [otpExpiresAt, setOtpExpiresAt] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState('')
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(0)
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0)

  const age = useMemo(() => calculateAge(form.dateOfBirth), [form.dateOfBirth])
  const isMinor = age !== '' && Number(age) < 18

  useEffect(() => {
    let isMounted = true

    fdmstApi.getPublicSettings()
      .then((settings) => {
        if (isMounted) setClinicSettings(settings || null)
      })
      .catch(() => {
        if (isMounted) setClinicSettings(null)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const updateCountdowns = () => {
      setOtpSecondsRemaining(secondsUntil(otpExpiresAt))
      setResendSecondsRemaining(secondsUntil(resendAvailableAt))
    }

    updateCountdowns()
    const timerId = window.setInterval(updateCountdowns, 1000)

    return () => window.clearInterval(timerId)
  }, [otpExpiresAt, resendAvailableAt])

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target
    const nextValue = ['contactNumber', 'guardianContactNumber'].includes(name) ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : nextValue,
    }))
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.acceptedPrivacy) {
      toast.error('Please agree to the personal information consent before creating an account.')
      return
    }

    if (!age) {
      toast.error('Please enter a valid birth date.')
      return
    }

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required.'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
    if (!form.email.trim()) errors.email = 'Email address is required.'
    if (!form.dateOfBirth) errors.dateOfBirth = 'Birth date is required.'
    if (isMinor) {
      if (!form.guardianName.trim()) errors.guardianName = 'Parent/guardian full name is required.'
      if (!form.guardianRelationship.trim()) errors.guardianRelationship = 'Relationship to patient is required.'
      const guardianMobileError = validateMobileNumber(form.guardianContactNumber, { required: true })
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    } else if (form.guardianContactNumber) {
      const guardianMobileError = validateMobileNumber(form.guardianContactNumber)
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    }
    if (form.guardianEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardianEmail.trim())) {
      errors.guardianEmail = 'Enter a valid guardian email address.'
    }

    const mobileError = validateMobileNumber(form.contactNumber, { required: true })

    if (mobileError) {
      errors.contactNumber = mobileError
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      toast.error(Object.values(errors)[0])
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        contactNumber: form.contactNumber.trim(),
        dateOfBirth: form.dateOfBirth,
        guardianName: form.guardianName.trim(),
        guardianRelationship: form.guardianRelationship.trim(),
        guardianContactNumber: form.guardianContactNumber.trim(),
        guardianEmail: form.guardianEmail.trim(),
        guardianAddress: form.guardianAddress.trim(),
        gender: form.gender,
        address: form.address.trim(),
        allergies: form.allergies.trim(),
        medicalHistory: form.medicalHistory.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      }

      const response = await fdmstApi.requestRegistrationOtp(payload)
      setPendingRegistration({ ...payload, email: response.email || payload.email })
      setOtpExpiresAt(response.otpExpiresAt || '')
      setResendAvailableAt(response.resendAvailableAt || '')
      setOtp('')
      toast.success(response.message || 'Verification code sent to your email.')
    } catch (registerError) {
      setFieldErrors(registerError.errors || {})
      if (registerError.nextAllowedAt) setResendAvailableAt(registerError.nextAllowedAt)
      toast.error(getOtpResendErrorMessage(registerError) || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async (event) => {
    event.preventDefault()

    if (!pendingRegistration) return

    if (!otp.trim()) {
      toast.error('Enter the verification code sent to your email.')
      return
    }

    setIsVerifyingOtp(true)

    try {
      const response = await fdmstApi.verifyRegistrationOtp({
        email: pendingRegistration.email,
        otp: otp.trim(),
      })

      toast.success(
        `Registration successful. Your Patient ID is ${response.patient.patientId}. Your account is currently unverified until your first completed clinic appointment.`,
      )
      setPendingRegistration(null)
      setOtp('')
      setOtpExpiresAt('')
      setResendAvailableAt('')
      setForm(initialForm)
      setFieldErrors({})
    } catch (error) {
      toast.error(error.message || 'Unable to verify OTP.')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const resendOtp = async () => {
    if (!pendingRegistration) return
    if (resendSecondsRemaining > 0) {
      toast.error(`Please wait before requesting another OTP. Try again in ${formatOtpCountdown(resendSecondsRemaining)}.`)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fdmstApi.requestRegistrationOtp(pendingRegistration)
      setOtpExpiresAt(response.otpExpiresAt || '')
      setResendAvailableAt(response.resendAvailableAt || '')
      toast.success(response.message || 'Verification code resent.')
      setOtp('')
    } catch (error) {
      if (error.nextAllowedAt) setResendAvailableAt(error.nextAllowedAt)
      toast.error(getOtpResendErrorMessage(error) || 'Unable to resend verification code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-700 lg:grid lg:grid-cols-2">
      <section className="relative min-h-[48rem] overflow-hidden bg-sky-950 px-8 py-10 text-white sm:px-12 lg:min-h-screen lg:px-16">
        <div className="absolute left-28 top-28 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-36 right-20 h-[34rem] w-[34rem] rounded-full bg-white/5" />

        <div className="relative z-10 flex min-h-full flex-col">
          <Link
            className="inline-flex w-fit items-center gap-3 text-sm font-medium text-sky-200 transition hover:text-white"
            to="/"
          >
            <span className="text-2xl leading-none">←</span>
            Back to Clinic Website
          </Link>

          <div className="mt-16 flex items-center gap-4">
            {clinicSettings?.clinicLogo ? (
              <img src={clinicSettings.clinicLogo} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg ring-1 ring-white/20" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg">
                <ToothIcon />
              </span>
            )}
            <div>
              <p className="text-2xl font-semibold leading-tight">{clinicSettings?.clinicName || 'Flores-Dizon Dental'}</p>
              <p className="mt-1 text-base font-medium text-sky-200">Clinic Management System</p>
            </div>
          </div>

          <div className="mt-20 max-w-xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Create your patient account today.
            </h1>
            <p className="mt-8 text-lg font-normal leading-9 text-sky-100">
              Register to book appointments online, access your dental records, view promotions,
              and track your oral health journey with Flores-Dizon Dental Clinic.
            </p>
          </div>

          <div className="mt-16 grid gap-7 text-base font-medium text-sky-100">
            <p className="flex items-center gap-4">
              <span className="text-2xl">🦷</span>
              Book appointments online anytime
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">📋</span>
              View your dental history & odontogram
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">🏷️</span>
              Access exclusive patient promotions
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">⭐</span>
              Submit feedback after each visit
            </p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center rounded-t-[2rem] bg-white px-6 py-10 shadow-2xl sm:px-10 lg:rounded-l-[2rem] lg:rounded-t-none lg:px-24">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sky-950">
              <UserPlusIcon />
            </span>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-sky-950">
                Create Patient Account
              </h2>
              <p className="mt-3 text-base font-normal text-slate-400">
                Already have an account?{' '}
                <Link className="font-semibold text-sky-950 hover:text-amber-500" to="/login">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>

          <form className="mt-10 grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                First Name *
                <input
                  className={inputClass}
                  name="firstName"
                  onChange={handleChange}
                  placeholder="Maria"
                  required
                  type="text"
                  value={form.firstName}
                />
                {fieldErrors.firstName ? (
                  <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Last Name *
                <input
                  className={inputClass}
                  name="lastName"
                  onChange={handleChange}
                  placeholder="Santos"
                  required
                  type="text"
                  value={form.lastName}
                />
                {fieldErrors.lastName ? (
                  <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span>
                ) : null}
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Email Address *
              <input
                className={inputClass}
                name="email"
                onChange={handleChange}
                placeholder="maria.santos@email.com"
                required
                type="email"
                value={form.email}
              />
              {fieldErrors.email ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Mobile Number *
              <input
                className={inputClass}
                name="contactNumber"
                onChange={handleChange}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
                required
                type="tel"
                value={form.contactNumber}
              />
              {fieldErrors.contactNumber ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span>
              ) : null}
            </label>

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Birth Date *
                <input
                  className={inputClass}
                  name="dateOfBirth"
                  onChange={handleChange}
                  required
                  type="date"
                  value={form.dateOfBirth}
                />
                {fieldErrors.dateOfBirth ? (
                  <span className="text-xs font-medium text-red-600">{fieldErrors.dateOfBirth}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Age
                <input
                  className={`${inputClass} bg-slate-50 text-slate-400`}
                  disabled
                  placeholder="Auto-computed"
                  type="text"
                  value={age}
                />
              </label>
            </div>

            {isMinor ? (
              <section className="grid gap-5 rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
                <div className="grid gap-1">
                  <h3 className="text-lg font-bold text-sky-950">Parent/Guardian Information</h3>
                  <p className="text-sm font-medium leading-6 text-slate-500">
                    The parent/guardian will serve as the primary contact for this minor patient.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Parent/Guardian Full Name *
                    <input
                      className={inputClass}
                      name="guardianName"
                      onChange={handleChange}
                      placeholder="Parent or legal guardian full name"
                      required
                      type="text"
                      value={form.guardianName}
                    />
                    {fieldErrors.guardianName ? (
                      <span className="text-xs font-medium text-red-600">{fieldErrors.guardianName}</span>
                    ) : null}
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Relationship to Patient *
                    <select
                      className={inputClass}
                      name="guardianRelationship"
                      onChange={handleChange}
                      required
                      value={form.guardianRelationship}
                    >
                      <option value="">Select relationship</option>
                      <option value="Mother">Mother</option>
                      <option value="Father">Father</option>
                      <option value="Legal Guardian">Legal Guardian</option>
                      <option value="Grandparent">Grandparent</option>
                      <option value="Relative">Relative</option>
                    </select>
                    {fieldErrors.guardianRelationship ? (
                      <span className="text-xs font-medium text-red-600">{fieldErrors.guardianRelationship}</span>
                    ) : null}
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Contact Number *
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      maxLength={11}
                      name="guardianContactNumber"
                      onChange={handleChange}
                      placeholder="09XXXXXXXXX"
                      required
                      type="tel"
                      value={form.guardianContactNumber}
                    />
                    {fieldErrors.guardianContactNumber ? (
                      <span className="text-xs font-medium text-red-600">{fieldErrors.guardianContactNumber}</span>
                    ) : null}
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Email Address (if applicable)
                    <input
                      className={inputClass}
                      name="guardianEmail"
                      onChange={handleChange}
                      placeholder="guardian@email.com"
                      type="email"
                      value={form.guardianEmail}
                    />
                    {fieldErrors.guardianEmail ? (
                      <span className="text-xs font-medium text-red-600">{fieldErrors.guardianEmail}</span>
                    ) : null}
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
                    Home Address (optional)
                    <textarea
                      className={`${inputClass} min-h-24 py-4`}
                      name="guardianAddress"
                      onChange={handleChange}
                      placeholder="Leave blank if same as patient address"
                      value={form.guardianAddress}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Gender
              <select
                className={inputClass}
                name="gender"
                onChange={handleChange}
                value={form.gender}
              >
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Address
              <textarea
                className={`${inputClass} min-h-24 py-4`}
                name="address"
                onChange={handleChange}
                placeholder="Enter full address"
                value={form.address}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Allergies
              <textarea
                className={`${inputClass} min-h-24 py-4`}
                name="allergies"
                onChange={handleChange}
                placeholder="Enter known allergies, separated by commas (optional)"
                value={form.allergies}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Medical History
              <textarea
                className={`${inputClass} min-h-24 py-4`}
                name="medicalHistory"
                onChange={handleChange}
                placeholder="Enter medical history or current conditions if applicable"
                value={form.medicalHistory}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Password *
              <span className="relative">
                <input
                  className={`${inputClass} w-full pr-14`}
                  name="password"
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-sky-950"
                  onClick={() => setShowPassword((currentValue) => !currentValue)}
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon />
                </button>
              </span>
              {fieldErrors.password ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.password}</span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Confirm Password *
              <span className="relative">
                <input
                  className={`${inputClass} w-full pr-14`}
                  name="confirmPassword"
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-sky-950"
                  onClick={() => setShowConfirmPassword((currentValue) => !currentValue)}
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <EyeIcon />
                </button>
              </span>
              {fieldErrors.confirmPassword ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.confirmPassword}</span>
              ) : null}
            </label>

            <label className="flex items-start gap-4 text-sm font-semibold leading-7 text-slate-500">
              <input
                checked={form.acceptedPrivacy}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-sky-950 focus:ring-sky-900"
                name="acceptedPrivacy"
                onChange={handleChange}
                required
                type="checkbox"
              />
              <span>
                I agree that my personal information will be used by Flores-Dizon Dental Clinic for
                appointment scheduling and patient care purposes only.
              </span>
            </label>

            <button
              className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Patient Account'}
            </button>
          </form>
        </div>
      </section>

      {pendingRegistration ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <form onSubmit={handleVerifyOtp} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl shadow-sky-950/20 ring-1 ring-white/60 transition sm:p-8">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
              <UserPlusIcon />
            </span>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Email Verification</p>
            <h2 className="mt-2 text-2xl font-semibold text-sky-950">Verify your patient account</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Enter the 6-digit OTP sent to <span className="font-semibold text-sky-950">{pendingRegistration.email}</span>.
            </p>
            <label className="mt-6 grid gap-3 text-left text-sm font-semibold text-slate-500">
              Verification Code
              <OtpInput value={otp} onChange={setOtp} disabled={isVerifyingOtp} autoFocus idPrefix="registration-otp" />
            </label>
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">
              {otpSecondsRemaining > 0 ? (
                <span>OTP is valid for {formatOtpCountdown(otpSecondsRemaining)}.</span>
              ) : (
                <span className="text-red-600">OTP has expired. Please request a new code.</span>
              )}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPendingRegistration(null)
                  setOtp('')
                  setOtpExpiresAt('')
                  setResendAvailableAt('')
                }}
                className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                disabled={isVerifyingOtp}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/15 transition hover:-translate-y-0.5 hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
                disabled={isVerifyingOtp}
              >
                {isVerifyingOtp ? 'Verifying...' : 'Verify & Create'}
              </button>
            </div>
            <button
              type="button"
              onClick={resendOtp}
              className="mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold text-sky-950 transition hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-100 disabled:opacity-60"
              disabled={isSubmitting || isVerifyingOtp || resendSecondsRemaining > 0}
            >
              {resendSecondsRemaining > 0
                ? `Resend OTP in ${formatOtpCountdown(resendSecondsRemaining)}`
                : 'Resend OTP'}
            </button>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default RegisterPage
