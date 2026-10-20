import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FaCheckCircle, FaClock, FaCommentDots, FaEye, FaSearch, FaStar, FaTimes } from 'react-icons/fa'
import { useSearchParams } from 'react-router-dom'
import { fdmstApi } from '../../api/fdmstApi.js'
import FeedbackStars from '../../components/FeedbackStars.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const categoryLabels = {
  scheduling: 'Scheduling',
  service_quality: 'Service Quality',
  overall_experience: 'Overall Experience',
}

const statusStyles = {
  new: 'bg-amber-50 text-amber-700 ring-amber-100',
  reviewed: 'bg-sky-50 text-sky-800 ring-sky-100',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
}

const formatDateTime = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyles[status] || statusStyles.new}`}>{status}</span>
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-sky-950">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
    </article>
  )
}

function AdminFeedbackPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedFeedbackRef = useRef('')
  const [feedback, setFeedback] = useState([])
  const [summary, setSummary] = useState({ total: 0, new: 0, resolved: 0, averageRating: 0 })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [filters, setFilters] = useState({ search: '', status: '', rating: '', category: '' })
  const [page, setPage] = useState(1)
  const [selectedFeedback, setSelectedFeedback] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadFeedback = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true)
    setErrorMessage('')
    try {
      const response = await fdmstApi.getAdminFeedback({ ...filters, page, limit: 15 })
      setFeedback(Array.isArray(response.data) ? response.data : [])
      setSummary(response.summary || { total: 0, new: 0, resolved: 0, averageRating: 0 })
      setPagination(response.pagination || { page: 1, pages: 1, total: 0 })
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load patient feedback.')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    const timer = setTimeout(() => loadFeedback(), filters.search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [loadFeedback, filters.search])

  const updateStatus = async (item, status, { quiet = false } = {}) => {
    if (!item || item.status === status) return item
    setIsUpdating(true)
    try {
      const updated = await fdmstApi.updateFeedbackStatus(item.id, status)
      setFeedback((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setSelectedFeedback((current) => current?.id === updated.id ? updated : current)
      setSummary((current) => ({
        ...current,
        new: Math.max(current.new + (item.status === 'new' ? -1 : 0) + (status === 'new' ? 1 : 0), 0),
        resolved: Math.max(current.resolved + (item.status === 'resolved' ? -1 : 0) + (status === 'resolved' ? 1 : 0), 0),
      }))
      if (!quiet) toast.success(status === 'resolved' ? 'Feedback marked as resolved.' : 'Feedback marked as reviewed.')
      return updated
    } catch (error) {
      toast.error(error.message || 'Unable to update feedback.')
      return item
    } finally {
      setIsUpdating(false)
    }
  }

  const openFeedback = useCallback(async (item) => {
    requestedFeedbackRef.current = String(item.id)
    setSelectedFeedback(item)
    setSearchParams({ feedback: item.id }, { replace: true })
    if (item.status === 'new') await updateStatus(item, 'reviewed', { quiet: true })
  // updateStatus intentionally uses the current item snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearchParams])

  useEffect(() => {
    const requestedId = searchParams.get('feedback')
    if (!requestedId || requestedFeedbackRef.current === requestedId) return
    requestedFeedbackRef.current = requestedId
    const inList = feedback.find((item) => String(item.id) === requestedId)
    if (inList) {
      openFeedback(inList)
      return
    }
    fdmstApi.getAdminFeedbackById(requestedId)
      .then((item) => openFeedback(item))
      .catch((error) => toast.error(error.message || 'Unable to open feedback.'))
  }, [feedback, openFeedback, searchParams, toast])

  const closeModal = () => {
    setSelectedFeedback(null)
    requestedFeedbackRef.current = ''
    setSearchParams({}, { replace: true })
  }

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters])

  return (
    <main className="bg-slate-50/60 px-4 py-6 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={FaCommentDots} label="Total Feedback" value={summary.total} tone="bg-sky-50 text-sky-800 ring-sky-100" />
          <SummaryCard icon={FaStar} label="Average Rating" value={`${summary.averageRating || 0}/5`} tone="bg-amber-50 text-amber-600 ring-amber-100" />
          <SummaryCard icon={FaClock} label="New Feedback" value={summary.new} tone="bg-violet-50 text-violet-700 ring-violet-100" />
          <SummaryCard icon={FaCheckCircle} label="Resolved" value={summary.resolved} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Patient Feedback</h2>
              <p className="mt-1 text-sm text-slate-500">Read patient ratings and track each response through review.</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_12rem_12rem_13rem_auto]">
              <label className="relative min-w-0">
                <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="Search patient or feedback..."
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-sky-900 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100">
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
              </select>
              <select value={filters.rating} onChange={(event) => updateFilter('rating', event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100">
                <option value="">All Ratings</option>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} Stars</option>)}
              </select>
              <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100">
                <option value="">All Categories</option>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button
                type="button"
                disabled={!hasFilters}
                onClick={() => { setFilters({ search: '', status: '', rating: '', category: '' }); setPage(1) }}
                className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-3 p-5 sm:p-6">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : errorMessage ? (
            <div className="m-5 rounded-xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-700 sm:m-6">
              <p>{errorMessage}</p>
              <button type="button" onClick={() => loadFeedback()} className="mt-3 font-semibold underline">Retry</button>
            </div>
          ) : feedback.length ? (
            <div className="divide-y divide-slate-100">
              {feedback.map((item) => (
                <button key={item.id} type="button" onClick={() => openFeedback(item)} className="grid w-full gap-4 p-5 text-left transition hover:bg-slate-50 sm:p-6 lg:grid-cols-[minmax(13rem,0.8fr)_minmax(18rem,1.5fr)_11rem_7rem] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-sky-950">{item.patientName}</p>
                    <p className="mt-1 text-xs font-medium text-slate-400">{item.patient?.patientId || 'Patient ID unavailable'}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <FeedbackStars rating={item.rating} size="sm" />
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.comments}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">{categoryLabels[item.category] || 'Overall Experience'}</p>
                    {item.appointment ? <p className="mt-2 truncate text-xs font-medium text-sky-900">{item.appointment.service}</p> : <p className="mt-2 text-xs text-slate-400">General feedback</p>}
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <StatusBadge status={item.status} />
                    <FaEye className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-1 ring-amber-100"><FaStar className="h-6 w-6" /></span>
              <p className="mt-4 font-semibold text-sky-950">No feedback found</p>
              <p className="mt-2 text-sm text-slate-500">New patient ratings will appear here.</p>
            </div>
          )}

          {pagination.pages > 1 ? (
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-sm text-slate-500">Page {pagination.page} of {pagination.pages}</p>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-40">Previous</button>
                <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-40">Next</button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {selectedFeedback ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Patient Feedback</p>
                <h2 id="feedback-detail-title" className="mt-1 truncate text-xl font-semibold text-sky-950">{selectedFeedback.patientName}</h2>
              </div>
              <button type="button" onClick={closeModal} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-sky-950" aria-label="Close feedback details">
                <FaTimes className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-6 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <FeedbackStars rating={selectedFeedback.rating} size="lg" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">{selectedFeedback.rating} out of 5 stars</p>
                </div>
                <StatusBadge status={selectedFeedback.status} />
              </div>

              <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase text-slate-400">Patient ID</dt><dd className="mt-1 font-semibold text-sky-950">{selectedFeedback.patient?.patientId || 'Not recorded'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase text-slate-400">Category</dt><dd className="mt-1 font-semibold text-sky-950">{categoryLabels[selectedFeedback.category] || 'Overall Experience'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase text-slate-400">Submitted</dt><dd className="mt-1 text-sm font-medium text-slate-600">{formatDateTime(selectedFeedback.createdAt)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase text-slate-400">Appointment</dt><dd className="mt-1 text-sm font-medium text-slate-600">{selectedFeedback.appointment ? `${selectedFeedback.appointment.service} · ${formatDateTime(selectedFeedback.appointment.appointmentDate)}` : 'General clinic feedback'}</dd></div>
              </dl>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-sky-950">Patient comments</h3>
                <p className="mt-2 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">{selectedFeedback.comments}</p>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={closeModal} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Close</button>
              {selectedFeedback.status !== 'resolved' ? (
                <button type="button" disabled={isUpdating} onClick={() => updateStatus(selectedFeedback, 'resolved')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  <FaCheckCircle className="h-4 w-4" aria-hidden="true" /> Mark as Resolved
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default AdminFeedbackPage
