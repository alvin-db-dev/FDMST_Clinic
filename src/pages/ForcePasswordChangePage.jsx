import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import PasswordField from '../components/PasswordField.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { getRoleHomePath } from '../utils/auth.js'

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-5 text-base font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const defaultStaffPassword = '12345678'

const passwordChecks = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'One number', test: (value) => /\d/.test(value) },
]

function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const user = authStorage.getUser()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requirements = useMemo(
    () => passwordChecks.map((check) => ({ ...check, met: check.test(newPassword) })),
    [newPassword],
  )
  const passwordsMatch = Boolean(confirmPassword) && newPassword === confirmPassword
  const canSubmit = requirements.every((item) => item.met) && passwordsMatch

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!user.requiresPasswordSetup) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!canSubmit) {
      toast.error('Complete the password requirements before saving.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fdmstApi.updatePassword({
        currentPassword: defaultStaffPassword,
        newPassword,
        confirmPassword,
      })
      toast.success(response.message || 'Password updated successfully.')
      navigate(getRoleHomePath(user.role), { replace: true })
    } catch (error) {
      toast.error(error.message || 'Unable to update password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-700">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/10 ring-1 ring-white/60 sm:p-8">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-2xl font-bold text-sky-950 ring-1 ring-sky-100">
            FD
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">First Login Security</p>
          <h1 className="mt-2 text-3xl font-semibold text-sky-950">Create Your Own Password</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            You signed in with the default staff password. Create a secure password before continuing to your account.
          </p>
        </div>

        <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
          <PasswordField inputClassName={inputClass} label="New Password" name="newPassword" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          <PasswordField inputClassName={inputClass} label="Confirm New Password" name="confirmPassword" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-sky-950">Password Requirements</p>
            <div className="mt-3 grid gap-2 text-sm">
              {requirements.map((item) => (
                <span key={item.label} className={item.met ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                  {item.met ? 'OK' : '-'} {item.label}
                </span>
              ))}
              <span className={passwordsMatch ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                {passwordsMatch ? 'OK' : '-'} Passwords match
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg shadow-sky-950/15 transition hover:-translate-y-0.5 hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving Password...' : 'Save New Password'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ForcePasswordChangePage
