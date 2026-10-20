import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaFileMedical,
  FaGift,
  FaRegCalendarAlt,
  FaTimes,
  FaTimesCircle,
  FaTooth,
} from 'react-icons/fa'
import { AUTH_CHANGED_EVENT, authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'
import { addDaysToDateKey, clinicDateKey } from '../../utils/clinicTime.js'

const statusStyles = {
  cancelled: {
    icon: FaTimesCircle,
    pill: 'bg-red-50 text-red-700 ring-red-100',
  },
  declined: {
    icon: FaTimesCircle,
    pill: 'bg-red-50 text-red-700 ring-red-100',
  },
  no_show: {
    icon: FaTimesCircle,
    pill: 'bg-red-50 text-red-700 ring-red-100',
  },
  completed: {
    icon: FaCheckCircle,
    pill: 'bg-sky-50 text-sky-700 ring-sky-100',
  },
  confirmed: {
    icon: FaCheckCircle,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  pending: {
    icon: FaClock,
    pill: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
}

const progressSteps = ['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed']

function formatDateTimeHeader(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Bookable date limits follow the clinic's clock so they match the server's past-date and past-time rules.
function addDaysInputValue(days) {
  return addDaysToDateKey(clinicDateKey(), days)
}

function getDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Patient'
}

function getFirstName(user) {
  return user?.firstName || getDisplayName(user).split(' ')[0] || 'Patient'
}

function isUpcoming(appointment) {
  const status = appointment.status
  if (status === 'cancelled' || status === 'declined' || status === 'completed' || status === 'no_show') return false
  if (status === 'pending') return true

  if (!appointment.appointmentDate) return true

  const appointmentDate = new Date(appointment.appointmentDate)
  appointmentDate.setHours(23, 59, 59, 999)
  return appointmentDate >= new Date()
}

function SummaryCard({ icon: Icon, label, value, helper, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-sky-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function AppointmentStatus({ status }) {
  const style = statusStyles[status] || {
    icon: FaClock,
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
  }

  const Icon = style.icon

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${style.pill}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatStatus(status)}
    </span>
  )
}

function AppointmentTimeline({ appointment }) {
  const timeline = Array.isArray(appointment?.timeline) ? appointment.timeline : []

  return (
    <div className="mt-6 rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-sky-950">Appointment Timeline</p>
      <div className="mt-4 grid gap-3">
        {progressSteps.map((step, index) => {
          const entry = timeline.find((item) => item.status === step)
          const isCurrent = appointment?.status === step
          const isDone = progressSteps.indexOf(appointment?.status) >= index || Boolean(entry)

          return (
            <div key={step} className="flex items-start gap-3">
              <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${isDone ? 'bg-sky-950' : 'bg-slate-300'} ${isCurrent ? 'ring-4 ring-sky-100' : ''}`} />
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${isDone ? 'text-sky-950' : 'text-slate-400'}`}>{formatStatus(step)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {entry?.changedAt ? formatDate(entry.changedAt) : isCurrent ? 'Current status' : 'Pending update'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {['cancelled', 'declined', 'no_show', 'rescheduled'].includes(appointment?.status) ? (
        <div className="mt-4 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">
          Final status: {formatStatus(appointment.status)}
        </div>
      ) : null}
    </div>
  )
}

function AppointmentsPreview({ appointments, isLoading, onSelect }) {
  if (isLoading) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Loading appointments...</div>
  }

  if (!appointments.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
          <FaRegCalendarAlt className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-semibold text-sky-950">No upcoming appointments</p>
        <p className="mt-2 text-sm text-slate-500">Book your next visit and it will appear here.</p>
        <Link to="/patient/book-appointment" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900">
          Book Now
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="min-w-[52rem] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Dentist</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr key={appointment.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
                      <FaTooth aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-sky-950">{appointment.service || 'Dental Visit'}</p>
                      <p className="text-xs text-slate-500">{appointment.reason || 'Clinic appointment'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{formatDate(appointment.appointmentDate)}</td>
                <td className="px-4 py-4">{appointment.appointmentTime}</td>
                <td className="px-4 py-4">{appointment.dentistName || 'Any available dentist'}</td>
                <td className="px-4 py-4"><AppointmentStatus status={appointment.status} /></td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(appointment)}
                    className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 transition hover:bg-sky-100"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {appointments.map((appointment) => (
          <article key={appointment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sky-950">{appointment.service || 'Dental Visit'}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDate(appointment.appointmentDate)} at {appointment.appointmentTime}</p>
              </div>
              <AppointmentStatus status={appointment.status} />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">{appointment.dentistName || 'Any available dentist'}</p>
              <button type="button" onClick={() => onSelect(appointment)} className="h-10 rounded-xl bg-sky-50 px-4 text-sm font-semibold text-sky-950">
                View Details
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function PatientLandingPage() {
  const toast = useToast()
  const location = useLocation()
  const [user, setUser] = useState(() => authStorage.getUser())
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [promotions, setPromotions] = useState([])
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' })
  const [availableRescheduleSlots, setAvailableRescheduleSlots] = useState([])
  const [rescheduleMessage, setRescheduleMessage] = useState('')
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  const loadDashboard = useCallback(({ silent = false } = {}) => {
    let isActive = true

    setIsLoading(true)

    const currentUser = authStorage.getUser()
    setUser(currentUser)

    if (!currentUser) {
      setAppointments([])
      setIsLoading(false)
      return () => {
        isActive = false
      }
    }

    Promise.allSettled([
      fdmstApi.getMyAppointments(),
      fdmstApi.getMyDentalRecords(),
      fdmstApi.list('promotions'),
      fdmstApi.getProfile(),
    ])
      .then(([appointmentResult, recordsResult, promotionsResult, profileResult]) => {
        if (!isActive) return
        setAppointments(appointmentResult.status === 'fulfilled' && Array.isArray(appointmentResult.value.data) ? appointmentResult.value.data : [])
        setRecords(recordsResult.status === 'fulfilled' && Array.isArray(recordsResult.value.data) ? recordsResult.value.data : [])
        setPromotions(promotionsResult.status === 'fulfilled' && Array.isArray(promotionsResult.value.data) ? promotionsResult.value.data : [])
        if (profileResult.status === 'fulfilled' && profileResult.value.user) {
          authStorage.saveSession({ user: profileResult.value.user })
          setUser(profileResult.value.user)
        }
      })
      .catch((loadError) => {
        if (!isActive) return
        if (!silent) toast.error(loadError.message || 'Failed to load your dashboard.')
        setAppointments([])
        setRecords([])
        setPromotions([])
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [toast])

  useEffect(() => {
    window.scrollTo(0, 0)
    let cleanup
    queueMicrotask(() => {
      cleanup = loadDashboard()
    })

    return () => {
      cleanup?.()
    }
  }, [loadDashboard, location.state?.refreshDashboard])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncUser = () => setUser(authStorage.getUser())

    window.addEventListener(AUTH_CHANGED_EVENT, syncUser)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncUser)
  }, [])

  useEffect(() => {
    if (!isRescheduling || !selectedAppointment || !rescheduleForm.date) {
      const resetTimer = window.setTimeout(() => {
        setAvailableRescheduleSlots([])
        setRescheduleMessage('')
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }

    let isActive = true
    const loadTimer = window.setTimeout(() => {
      setIsLoadingRescheduleSlots(true)
      setRescheduleMessage('')

      fdmstApi.getAppointmentAvailability({
        date: rescheduleForm.date,
        dentistName: selectedAppointment.dentistName,
        service: selectedAppointment.service,
      })
        .then((result) => {
          if (!isActive) return
          const slots = Array.isArray(result.slots) ? result.slots : []
          setAvailableRescheduleSlots(slots)
          setRescheduleMessage(slots.length ? '' : result.message || 'No available appointments for this date.')
          setRescheduleForm((current) => (
            current.time && !slots.includes(current.time) ? { ...current, time: '' } : current
          ))
        })
        .catch((error) => {
          if (!isActive) return
          setAvailableRescheduleSlots([])
          setRescheduleMessage(error.message || 'Unable to load available appointment times.')
        })
        .finally(() => {
          if (isActive) setIsLoadingRescheduleSlots(false)
        })
    }, 0)

    return () => {
      isActive = false
      window.clearTimeout(loadTimer)
    }
  }, [isRescheduling, rescheduleForm.date, selectedAppointment])

  const firstName = getFirstName(user)
  const upcomingAppointments = useMemo(() => appointments.filter(isUpcoming), [appointments])
  const nextAppointment = upcomingAppointments[0]
  const completedCount = useMemo(() => appointments.filter((appointment) => appointment.status === 'completed').length, [appointments])
  const activePromotionCount = useMemo(() => promotions.filter((promotion) => promotion.status === 'active').length, [promotions])
  const activeAppointment = useMemo(
    () => upcomingAppointments.find((appointment) => progressSteps.includes(appointment.status)) || nextAppointment,
    [nextAppointment, upcomingAppointments],
  )
  const currentProgressIndex = activeAppointment ? Math.max(progressSteps.indexOf(activeAppointment.status), 0) : -1

  const closeAppointmentModal = useCallback(() => {
    setSelectedAppointment(null)
    setIsRescheduling(false)
    setRescheduleForm({ date: '', time: '' })
    setAvailableRescheduleSlots([])
    setRescheduleMessage('')
  }, [])

  const updateAppointmentInState = useCallback((updatedAppointment) => {
    setAppointments((current) => current.map((appointment) => (
      appointment.id === updatedAppointment.id ? updatedAppointment : appointment
    )))
    setSelectedAppointment(updatedAppointment)
  }, [])

  const handleCancelAppointment = useCallback(async () => {
    if (!selectedAppointment || selectedAppointment.status !== 'pending') return

    const confirmed = window.confirm('Cancel this pending appointment request?')
    if (!confirmed) return

    setIsUpdatingAppointment(true)
    try {
      const result = await fdmstApi.cancelMyAppointment(selectedAppointment.id)
      if (result.appointment) updateAppointmentInState(result.appointment)
      setIsRescheduling(false)
      toast.success(result.message || 'Appointment request cancelled successfully.')
    } catch (error) {
      toast.error(error.message || 'Unable to cancel this appointment request.')
    } finally {
      setIsUpdatingAppointment(false)
    }
  }, [selectedAppointment, toast, updateAppointmentInState])

  const openReschedulePanel = useCallback(() => {
    if (!selectedAppointment) return
    setRescheduleForm({
      date: toDateInputValue(selectedAppointment.appointmentDate),
      time: '',
    })
    setIsRescheduling(true)
  }, [selectedAppointment])

  const handleSubmitReschedule = useCallback(async (event) => {
    event.preventDefault()
    if (!selectedAppointment || selectedAppointment.status !== 'pending') return

    if (!rescheduleForm.date || !rescheduleForm.time) {
      toast.error('Please select a new appointment date and time.')
      return
    }

    setIsUpdatingAppointment(true)
    try {
      const result = await fdmstApi.rescheduleMyAppointment(selectedAppointment.id, {
        appointmentDate: rescheduleForm.date,
        appointmentTime: rescheduleForm.time,
      })
      if (result.appointment) updateAppointmentInState(result.appointment)
      setIsRescheduling(false)
      setRescheduleForm({ date: '', time: '' })
      toast.success(result.message || 'Appointment request rescheduled successfully.')
    } catch (error) {
      toast.error(error.message || 'Unable to reschedule this appointment request.')
    } finally {
      setIsUpdatingAppointment(false)
    }
  }, [rescheduleForm.date, rescheduleForm.time, selectedAppointment, toast, updateAppointmentInState])

  if (!user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="text-sm font-medium text-slate-500">Loading your dashboard...</p>
      </main>
    )
  }

  return (
    <main className="text-slate-700">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <section className="overflow-hidden rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Patient Portal</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Welcome back, {firstName}!</h1>
              <p className="mt-3 max-w-2xl text-sky-100">
                {formatDateTimeHeader(now)} | {formatClock(now)}
              </p>
            </div>

            <aside className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/10">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
                  <FaRegCalendarAlt className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-sky-100">Next Appointment</p>
                  <p className="mt-1 text-lg font-semibold">{nextAppointment ? formatDate(nextAppointment.appointmentDate) : 'No appointment yet'}</p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-sky-900/50 p-4 text-sm leading-6 text-sky-100">
                {nextAppointment
                  ? `${nextAppointment.appointmentTime} - ${nextAppointment.service || 'Dental Visit'}`
                  : 'Book a visit when you are ready. Your confirmed schedule will appear here.'}
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={FaCalendarCheck} label="Upcoming Appointments" value={upcomingAppointments.length} helper={nextAppointment ? formatDate(nextAppointment.appointmentDate) : 'No active schedule'} />
          <SummaryCard icon={FaCheckCircle} label="Completed Appointments" value={completedCount} helper="Finished clinic visits" tone="emerald" />
          <SummaryCard icon={FaFileMedical} label="Treatment Records" value={records.length} helper="Official dental records" tone="violet" />
          <SummaryCard icon={FaGift} label="Active Promotions" value={activePromotionCount} helper="Current clinic offers" tone="amber" />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Appointment Progress</h2>
                <p className="mt-2 text-sm text-slate-500">Track your nearest active appointment from request to completion.</p>
              </div>
              {activeAppointment ? <AppointmentStatus status={activeAppointment.status} /> : null}
            </div>
            {activeAppointment ? (
              <div className="mt-6">
                <div className="grid gap-3 sm:grid-cols-5">
                  {progressSteps.map((step, index) => {
                    const isActive = index <= currentProgressIndex
                    return (
                      <div key={step} className="min-w-0">
                        <div className={`h-2 rounded-full ${isActive ? 'bg-sky-950' : 'bg-slate-100'}`} />
                        <p className={`mt-2 text-xs font-semibold ${isActive ? 'text-sky-950' : 'text-slate-400'}`}>{formatStatus(step)}</p>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  {activeAppointment.service || 'Dental Visit'} with {activeAppointment.dentistName || 'Any available dentist'} on {formatDate(activeAppointment.appointmentDate)} at {activeAppointment.appointmentTime}.
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No active appointment to track.
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Appointment Reminder</h2>
                <p className="mt-2 text-sm text-slate-500">Your nearest upcoming visit.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <FaClock className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            {nextAppointment ? (
              <div className="mt-5 space-y-3 text-sm">
                <p className="text-lg font-semibold text-sky-950">{nextAppointment.service || 'Dental Visit'}</p>
                <p className="text-slate-500">{formatDate(nextAppointment.appointmentDate)} at {nextAppointment.appointmentTime}</p>
                <p className="text-slate-500">{nextAppointment.dentistName || 'Any available dentist'}</p>
                <AppointmentStatus status={nextAppointment.status} />
                <button type="button" onClick={() => setSelectedAppointment(nextAppointment)} className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900">
                  View Appointment
                </button>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No upcoming appointments.</p>
            )}
          </article>
        </section>

        <section className="mt-10">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Upcoming Appointments</h2>
                <p className="mt-2 text-sm text-slate-500">Your scheduled visits and pending booking requests.</p>
              </div>
              <Link to="/patient/book-appointment" className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900">
                Book Appointment
              </Link>
            </div>
            <div className="mt-6">
              <AppointmentsPreview appointments={upcomingAppointments} isLoading={isLoading} onSelect={setSelectedAppointment} />
            </div>
          </article>
        </section>

      </div>

      {selectedAppointment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Appointment Details</p>
                <h3 className="mt-2 text-2xl font-semibold text-sky-950">{selectedAppointment.service || 'Dental Visit'}</h3>
              </div>
              <button type="button" onClick={closeAppointmentModal} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close appointment details">
                <FaTimes />
              </button>
            </div>
            <div className="p-6 pt-5">
            <dl className="grid gap-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Date</dt><dd className="font-semibold text-sky-950">{formatDate(selectedAppointment.appointmentDate)}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Time</dt><dd className="font-semibold text-sky-950">{selectedAppointment.appointmentTime}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Dentist</dt><dd className="font-semibold text-sky-950">{selectedAppointment.dentistName || 'Any available dentist'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Estimated Duration</dt><dd className="font-semibold text-sky-950">{selectedAppointment.serviceDurationSnapshot ? `${selectedAppointment.serviceDurationSnapshot} minutes` : 'Not specified'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Final Price</dt><dd className="font-semibold text-sky-950">{selectedAppointment.finalPrice !== undefined ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(selectedAppointment.finalPrice) || 0) : 'Not specified'}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Promotion</dt><dd className="font-semibold text-sky-950">{selectedAppointment.promoCode || 'None'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd><AppointmentStatus status={selectedAppointment.status} /></dd></div>
            </dl>
            {selectedAppointment.clinicalRecommendation ? (
              <section className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-sky-950">Dentist Recommendation</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{selectedAppointment.clinicalRecommendation}</p>
              </section>
            ) : null}
            <AppointmentTimeline appointment={selectedAppointment} />
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {selectedAppointment.status === 'pending' ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-sky-950">Pending Request Actions</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">You can reschedule or cancel only before the clinic approves this request.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={openReschedulePanel}
                        disabled={isUpdatingAppointment}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-sky-950 ring-1 ring-slate-200 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAppointment}
                        disabled={isUpdatingAppointment}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel Appointment
                      </button>
                    </div>
                  </div>

                  {isRescheduling ? (
                    <form onSubmit={handleSubmitReschedule} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">New Date</span>
                          <input
                            type="date"
                            min={addDaysInputValue(0)}
                            max={addDaysInputValue(14)}
                            value={rescheduleForm.date}
                            onChange={(event) => setRescheduleForm({ date: event.target.value, time: '' })}
                            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-sky-950 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Time</span>
                          <select
                            value={rescheduleForm.time}
                            onChange={(event) => setRescheduleForm((current) => ({ ...current, time: event.target.value }))}
                            disabled={!rescheduleForm.date || isLoadingRescheduleSlots || !availableRescheduleSlots.length}
                            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-sky-950 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">{isLoadingRescheduleSlots ? 'Loading times...' : 'Select time'}</option>
                            {availableRescheduleSlots.map((slot) => (
                              <option key={slot} value={slot}>{slot}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {rescheduleMessage ? (
                        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">{rescheduleMessage}</p>
                      ) : null}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setIsRescheduling(false)}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          Close
                        </button>
                        <button
                          type="submit"
                          disabled={isUpdatingAppointment || isLoadingRescheduleSlots || !rescheduleForm.date || !rescheduleForm.time}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Save New Schedule
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-500">Cancel and reschedule options are available only while the appointment request is pending clinic approval.</p>
              )}
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default PatientLandingPage
