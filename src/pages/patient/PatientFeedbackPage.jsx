import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaCheckCircle, FaCommentDots, FaPaperPlane, FaStar } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import FeedbackStars from '../../components/FeedbackStars.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const categoryOptions = [
  { value: 'overall_experience', label: 'Overall Experience' },
  { value: 'service_quality', label: 'Service Quality' },
  { value: 'scheduling', label: 'Scheduling' },
]

const categoryLabel = (value) => categoryOptions.find((item) => item.value === value)?.label || 'Overall Experience'

const formatDate = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const initialForm = { rating: 0, category: 'overall_experience', appointment: '', comments: '' }

function PatientFeedbackPage() {
  const toast = useToast()
  const [form, setForm] = useState(initialForm)
  const [feedback, setFeedback] = useState([])
  const [appointments, setAppointments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const loadFeedback = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const response = await fdmstApi.getMyFeedback()
      setFeedback(Array.isArray(response.data) ? response.data : [])
      setAppointments(Array.isArray(response.appointments) ? response.appointments : [])
    } catch (error) {
      setLoadError(error.message || 'Unable to load your feedback history.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFeedback()
  }, [loadFeedback])

  const availableAppointments = useMemo(
    () => appointments.filter((appointment) => !appointment.hasFeedback),
    [appointments],
  )

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = {}
    if (!form.rating) errors.rating = 'Select a star rating.'
    if (form.comments.trim().length < 3) errors.comments = 'Tell us a little about your experience.'
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    setFieldErrors({})
    try {
      const created = await fdmstApi.createFeedback({
        ...form,
        comments: form.comments.trim(),
        appointment: form.appointment || undefined,
      })
      setFeedback((current) => [created, ...current])
      setAppointments((current) => current.map((appointment) => (
        String(appointment.id) === String(form.appointment) ? { ...appointment, hasFeedback: true } : appointment
      )))
      setForm(initialForm)
      toast.success('Thank you. Your feedback was sent to the clinic.')
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Unable to submit feedback.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">Patient Feedback</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Share your clinic experience</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-100 sm:text-base">
                Your rating and comments help the clinic improve patient care and appointment service.
              </p>
            </div>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
              <FaCommentDots className="h-7 w-7" aria-hidden="true" />
            </span>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Add Feedback</h2>
              <p className="mt-1 text-sm text-slate-500">Select your rating and tell the Admin about your visit.</p>
            </div>

            <form className="mt-6 grid gap-6" onSubmit={handleSubmit}>
              <fieldset>
                <legend className="text-sm font-semibold text-sky-950">Your rating</legend>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <FeedbackStars rating={form.rating} onChange={(rating) => updateForm('rating', rating)} size="lg" />
                  <span className="text-sm font-semibold text-slate-500">
                    {form.rating ? `${form.rating} out of 5` : 'Select a rating'}
                  </span>
                </div>
                {fieldErrors.rating ? <p className="mt-2 text-sm font-medium text-red-600">{fieldErrors.rating}</p> : null}
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold text-sky-950">Feedback category</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {categoryOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateForm('category', option.value)}
                      className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${
                        form.category === option.value
                          ? 'border-sky-950 bg-sky-950 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Related completed appointment <span className="font-normal text-slate-400">(optional)</span>
                <select
                  value={form.appointment}
                  onChange={(event) => updateForm('appointment', event.target.value)}
                  className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-900 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="">General clinic feedback</option>
                  {availableAppointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.service} - {formatDate(appointment.appointmentDate)} {appointment.appointmentTime}
                    </option>
                  ))}
                </select>
                {!availableAppointments.length && appointments.length ? (
                  <span className="text-xs font-normal text-slate-400">All completed appointments already have feedback.</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Your feedback
                <textarea
                  value={form.comments}
                  onChange={(event) => updateForm('comments', event.target.value.slice(0, 1500))}
                  rows={7}
                  placeholder="Tell us what went well or what the clinic can improve..."
                  className="min-h-40 resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100"
                />
                <span className="flex items-center justify-between gap-3 text-xs font-normal">
                  <span className="text-red-600">{fieldErrors.comments || ''}</span>
                  <span className="ml-auto text-slate-400">{form.comments.length}/1500</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start"
              >
                <FaPaperPlane className="h-4 w-4" aria-hidden="true" />
                {isSubmitting ? 'Sending Feedback...' : 'Submit Feedback'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Your Feedback</h2>
                <p className="mt-1 text-sm text-slate-500">Previous ratings sent to the clinic.</p>
              </div>
              <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-amber-50 px-3 text-sm font-bold text-amber-700 ring-1 ring-amber-100">
                {feedback.length}
              </span>
            </div>

            {isLoading ? (
              <div className="mt-5 grid gap-3">
                {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                <p>{loadError}</p>
                <button type="button" onClick={loadFeedback} className="mt-3 font-semibold underline">Try again</button>
              </div>
            ) : feedback.length ? (
              <div className="mt-5 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
                {feedback.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <FeedbackStars rating={item.rating} size="sm" />
                        <p className="mt-2 text-xs font-semibold uppercase text-slate-400">{categoryLabel(item.category)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        <FaCheckCircle className="h-3 w-3" aria-hidden="true" /> Sent
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{item.comments}</p>
                    {item.appointment ? <p className="mt-3 text-xs font-medium text-sky-900">{item.appointment.service} · {formatDate(item.appointment.appointmentDate)}</p> : null}
                    <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(item.createdAt)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <FaStar className="h-8 w-8 text-amber-300" aria-hidden="true" />
                <p className="mt-4 font-semibold text-sky-950">No feedback submitted yet</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Your submitted ratings will appear here.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

export default PatientFeedbackPage
