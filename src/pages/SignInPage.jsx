import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fdmstApi } from '../api/fdmstApi.js'
import { useToast } from '../context/ToastContext.jsx'
import { getRoleHomePath } from '../utils/auth.js'

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-5 text-base font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

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
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
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
    >
      <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
    </svg>
  )
}

function LogInIcon() {
  return (
    <svg
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  )
}

function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clinicSettings, setClinicSettings] = useState(null)

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

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    setIsSubmitting(true)

    try {
      const response = await fdmstApi.login({
        email: form.email.trim(),
        password: form.password,
      })

      toast.success(response.message || 'Login successful.')
      const redirectPath = response.user?.requiresPasswordSetup
        ? '/force-password-change'
        : location.state?.from || getRoleHomePath(response.user.role)
      navigate(redirectPath, { replace: true })
    } catch (err) {
      toast.error(err.message || 'Invalid email or password.', { duration: 8000 })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-700 lg:grid lg:grid-cols-2">

      {/* LEFT SIDE */}

      <section className="relative min-h-[48rem] overflow-hidden bg-sky-950 px-8 py-10 text-white sm:px-12 lg:min-h-screen lg:px-16">

        <div className="absolute left-28 top-28 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-36 right-20 h-[34rem] w-[34rem] rounded-full bg-white/5" />

        <div className="relative z-10 flex min-h-full flex-col">

          <Link
            to="/"
            className="inline-flex w-fit items-center gap-3 text-sm font-medium text-sky-200 transition hover:text-white"
          >
            <span className="text-2xl">←</span>
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
              <p className="text-2xl font-semibold">
                {clinicSettings?.clinicName || 'Flores-Dizon Dental'}
              </p>

              <p className="mt-1 text-base text-sky-200">
                Clinic Management System
              </p>
            </div>
          </div>

          <div className="mt-24 max-w-xl">
            <h1 className="text-5xl font-semibold leading-tight">
              Welcome Back
            </h1>

            <p className="mt-8 text-lg leading-9 text-sky-100">
              Welcome back to the dental clinic portal.
              <br />
              <br />
              Your all-in-one platform for dental appointments,
              patient records, inventory, and analytics — built
              for the Flores-Dizon Dental team.
            </p>
          </div>

        </div>

      </section>

      {/* RIGHT SIDE */}

      <section className="flex min-h-screen items-center rounded-t-[2rem] bg-white px-6 py-10 shadow-2xl sm:px-10 lg:rounded-l-[2rem] lg:rounded-t-none lg:px-24">

        <div className="mx-auto w-full max-w-lg">

          <div className="flex items-start gap-4">

            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sky-950">
              <LogInIcon />
            </span>

            <div>
              <h2 className="text-3xl font-semibold text-sky-950">
                Sign In
              </h2>

            </div>

          </div>

          <form
            className="mt-10 grid gap-6"
            onSubmit={handleSubmit}
          >

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Email Address

              <input
                className={inputClass}
                type="email"
                name="email"
                placeholder="example@email.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">

              Password

              <span className="relative">

                <input
                  className={`${inputClass} w-full pr-14`}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-950"
                >
                  <EyeIcon />
                </button>

              </span>

            </label>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-sky-950 hover:text-amber-500"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>

            <p className="text-left text-base text-slate-400">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-sky-950 transition hover:text-amber-500"
              >
                Create one here
              </Link>
            </p>

          </form>

        </div>

      </section>

    </main>
  )
}

export default SignInPage
