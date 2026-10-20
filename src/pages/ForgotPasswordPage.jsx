import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fdmstApi } from '../api/fdmstApi.js'
import OtpInput from '../components/OtpInput.jsx'
import PasswordField from '../components/PasswordField.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatOtpCountdown, getOtpResendErrorMessage, secondsUntil } from '../utils/otpCountdown.js'

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-5 text-base font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

function LockIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState('email')
  const [form, setForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [otpExpiresAt, setOtpExpiresAt] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState('')
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(0)
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0)

  useEffect(() => {
    const updateCountdowns = () => {
      setOtpSecondsRemaining(secondsUntil(otpExpiresAt))
      setResendSecondsRemaining(secondsUntil(resendAvailableAt))
    }

    updateCountdowns()
    const timerId = window.setInterval(updateCountdowns, 1000)

    return () => window.clearInterval(timerId)
  }, [otpExpiresAt, resendAvailableAt])

  const update = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const requestOtp = async (event) => {
    event.preventDefault()
    if (!form.email.trim()) {
      toast.error('Enter your email address.')
      return
    }

    if (step === 'reset' && resendSecondsRemaining > 0) {
      toast.error(`Please wait before requesting another OTP. Try again in ${formatOtpCountdown(resendSecondsRemaining)}.`)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fdmstApi.requestPasswordResetOtp({ email: form.email.trim() })
      setOtpExpiresAt(response.otpExpiresAt || '')
      setResendAvailableAt(response.resendAvailableAt || '')
      toast.success(response.message || 'Password reset code sent.')
      setStep('reset')
    } catch (error) {
      if (error.otpExpiresAt) setOtpExpiresAt(error.otpExpiresAt)
      if (error.nextAllowedAt) setResendAvailableAt(error.nextAllowedAt)
      if (error.status === 429) setStep('reset')
      toast.error(getOtpResendErrorMessage(error) || 'Unable to send reset code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetPassword = async (event) => {
    event.preventDefault()
    if (!form.otp.trim()) {
      toast.error('Enter the OTP sent to your email.')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('New password and confirmation do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fdmstApi.resetPasswordWithOtp({
        email: form.email.trim(),
        otp: form.otp.trim(),
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      })
      toast.success(response.message || 'Password reset successful.')
      setOtpExpiresAt('')
      setResendAvailableAt('')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error.message || 'Unable to reset password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-700">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/10 ring-1 ring-white/60 sm:p-8">
        <Link to="/login" className="inline-flex rounded-xl px-2 py-1 text-sm font-semibold text-sky-950 transition hover:bg-amber-50 hover:text-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100">
          ← Back to Sign In
        </Link>
        <div className="mt-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
            <LockIcon />
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Account Recovery</p>
          <h1 className="mt-2 text-3xl font-semibold text-sky-950">Forgot Password</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            {step === 'email'
              ? 'Enter your account email and we will send a one-time password.'
              : `Enter the OTP sent to ${form.email} and choose a new password.`}
          </p>
        </div>

        {step === 'email' ? (
          <form className="mt-8 grid gap-5" onSubmit={requestOtp}>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Email Address
              <input className={inputClass} type="email" name="email" value={form.email} onChange={update} placeholder="example@email.com" required />
            </label>
            <button type="submit" disabled={isSubmitting} className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg shadow-sky-950/15 transition hover:-translate-y-0.5 hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60">
              {isSubmitting ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form className="mt-8 grid gap-5" onSubmit={resetPassword}>
            <label className="grid gap-3 text-sm font-semibold text-slate-500">
              OTP Code
              <OtpInput
                value={form.otp}
                onChange={(nextOtp) => setForm((current) => ({ ...current, otp: nextOtp }))}
                disabled={isSubmitting}
                autoFocus
                idPrefix="password-reset-otp"
              />
            </label>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">
              {otpSecondsRemaining > 0 ? (
                <span>OTP is valid for {formatOtpCountdown(otpSecondsRemaining)}.</span>
              ) : (
                <span className="text-red-600">OTP has expired. Please request a new code.</span>
              )}
            </div>
            <PasswordField inputClassName={inputClass} label="New Password" name="newPassword" value={form.newPassword} onChange={update} autoComplete="new-password" />
            <PasswordField inputClassName={inputClass} label="Confirm New Password" name="confirmPassword" value={form.confirmPassword} onChange={update} autoComplete="new-password" />
            <button type="submit" disabled={isSubmitting} className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg shadow-sky-950/15 transition hover:-translate-y-0.5 hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60">
              {isSubmitting ? 'Resetting Password...' : 'Reset Password'}
            </button>
            <button type="button" disabled={isSubmitting || resendSecondsRemaining > 0} onClick={requestOtp} className="rounded-xl px-4 py-2 text-sm font-semibold text-sky-950 transition hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-100 disabled:opacity-60">
              {resendSecondsRemaining > 0
                ? `Resend OTP in ${formatOtpCountdown(resendSecondsRemaining)}`
                : 'Resend OTP'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default ForgotPasswordPage
