import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import {
  FaBullhorn,
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaEye,
  FaHistory,
  FaPlay,
  FaSearch,
  FaSyncAlt,
  FaTimes,
  FaUserCheck,
  FaUserClock,
  FaUsers,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'

ChartJS.register(ArcElement, Legend, Tooltip)

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-100',
  checked_in: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_consultation: 'bg-violet-50 text-violet-700 ring-violet-100',
  completed: 'bg-teal-50 text-teal-700 ring-teal-100',
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  no_show: 'bg-slate-100 text-slate-700 ring-slate-200',
  rescheduled: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
}

const statusColors = {
  pending: '#f59e0b',
  confirmed: '#2563eb',
  checked_in: '#10b981',
  in_consultation: '#7c3aed',
  completed: '#0f766e',
  cancelled: '#dc2626',
  no_show: '#111827',
}

const dashboardStatuses = ['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show']
const rowsPerPage = 6

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

function getDisplayName(user) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  if (!fullName) return 'Team'
  return fullName
}

function formatTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function statusBadge(status) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusStyles[status] || statusStyles.pending}`}>
      {formatStatus(status)}
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'shadow-md' : ''}`}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-sky-950">{value}</p>
    </button>
  )
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}

function StaffLandingPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState(null)
  const [promotions, setPromotions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeStatus, setActiveStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const user = authStorage.getUser()
  const dashboardLabel = 'Staff Dashboard'
  const dashboardNoun = 'staff'
  const appointmentsPath = '/staff/appointments'
  const promotionsPath = '/staff/promotions'

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsRefreshing(true)
    try {
      const [data, promotionResponse] = await Promise.all([
        fdmstApi.getStaffDashboard(),
        fdmstApi.list('promotions'),
      ])
      setDashboard(data)
      setPromotions(Array.isArray(promotionResponse.data) ? promotionResponse.data : [])
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || `Failed to load ${dashboardNoun} dashboard.`)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [dashboardNoun, toast])

  useEffect(() => {
    loadDashboard()
    const dashboardTimer = setInterval(() => loadDashboard({ silent: true }), 30000)
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => {
      clearInterval(dashboardTimer)
      clearInterval(clockTimer)
    }
  }, [loadDashboard])

  useEffect(() => {
    setPage(1)
  }, [activeStatus, search])

  const handleRefresh = async () => {
    await loadDashboard()
    toast.success('Dashboard refreshed.')
  }

  const handleQueueAction = async (appointmentId, status) => {
    try {
      await fdmstApi.updateAppointmentStatus(appointmentId, {
        status,
        ...(status === 'cancelled' ? { declineReason: 'Cancelled from dashboard workflow.' } : {}),
      })
      toast.success('Queue updated.')
      loadDashboard({ silent: true })
    } catch (error) {
      toast.error(error.message || 'Unable to update queue.')
    }
  }

  const todayAppointments = useMemo(() => dashboard?.todaysAppointments || [], [dashboard?.todaysAppointments])
  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase()
    return todayAppointments
      .filter((appointment) => activeStatus === 'all' || appointment.status === activeStatus)
      .filter((appointment) => {
        if (!query) return true
        return [
          appointment.appointmentId,
          appointment.patientName,
          appointment.service,
          appointment.dentistName,
          appointment.status,
        ].some((value) => String(value || '').toLowerCase().includes(query))
      })
      .sort((left, right) => String(left.appointmentTime || '').localeCompare(String(right.appointmentTime || '')))
  }, [activeStatus, search, todayAppointments])
  const totalPages = Math.max(Math.ceil(filteredAppointments.length / rowsPerPage), 1)
  const visibleAppointments = filteredAppointments.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const statusCounts = useMemo(() => dashboard?.stats?.statusCounts || {}, [dashboard?.stats?.statusCounts])
  const statusChartData = useMemo(() => {
    const labels = dashboardStatuses.map((status) => formatStatus(status))
    const values = dashboardStatuses.map((status) => statusCounts[status] || 0)
    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: dashboardStatuses.map((status) => statusColors[status]),
        borderColor: '#ffffff',
        borderWidth: 3,
      }],
    }
  }, [statusCounts])
  const statusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((sum, value) => sum + value, 0)
            const value = context.raw || 0
            const percent = total ? Math.round((value / total) * 100) : 0
            return `${context.label}: ${value} (${percent}%)`
          },
        },
      },
    },
  }
  const kpiCards = [
    ['all', FaCalendarCheck, "Today's Appointments", dashboard?.stats?.todaysAppointments || 0, 'bg-blue-50 text-blue-700 ring-blue-100'],
    ['checked_in', FaUserCheck, 'Checked-In Patients', dashboard?.stats?.checkedInPatients || 0, 'bg-emerald-50 text-emerald-700 ring-emerald-100'],
    ['in_consultation', FaPlay, 'In Consultation', dashboard?.stats?.patientsInConsultation || 0, 'bg-violet-50 text-violet-700 ring-violet-100'],
    ['completed', FaCheckCircle, 'Completed Today', dashboard?.stats?.completedToday || 0, 'bg-teal-50 text-teal-700 ring-teal-100'],
    ['cancelled', FaTimes, 'Cancelled Today', dashboard?.stats?.cancelledToday || 0, 'bg-red-50 text-red-700 ring-red-100'],
  ]

  const renderActions = (appointment) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" onClick={() => setSelectedAppointment(appointment)}>View</button>
      {appointment.status === 'pending' ? <button type="button" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700" onClick={() => handleQueueAction(appointment.id, 'confirmed')}>Confirm</button> : null}
      {appointment.status === 'pending' ? <button type="button" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100" onClick={() => handleQueueAction(appointment.id, 'cancelled')}>Cancel</button> : null}
      {appointment.status === 'confirmed' ? <button type="button" className="rounded-xl bg-sky-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900" onClick={() => handleQueueAction(appointment.id, 'checked_in')}>Check In</button> : null}
      {appointment.status === 'checked_in' ? <button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700" onClick={() => handleQueueAction(appointment.id, 'in_consultation')}>Start</button> : null}
      {appointment.status === 'in_consultation' ? <button type="button" className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700" onClick={() => handleQueueAction(appointment.id, 'completed')}>Complete</button> : null}
      {['confirmed', 'checked_in', 'in_consultation'].includes(appointment.status) ? <button type="button" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100" onClick={() => handleQueueAction(appointment.id, 'rescheduled')}>Reschedule</button> : null}
    </div>
  )

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm font-medium text-slate-500">Loading {dashboardNoun} dashboard...</p>
      </main>
    )
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">{dashboardLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold text-sky-950">{getGreeting()}, {getDisplayName(user)}</h1>
            <p className="mt-2 text-slate-500">
              {currentTime.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} • {currentTime.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              You have <span className="font-bold text-sky-950">{dashboard?.stats?.todaysAppointments || 0}</span> appointments scheduled today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`${appointmentsPath}?period=past`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-sky-950 transition hover:bg-slate-50">
              <FaHistory className="h-4 w-4" /> Appointment Records
            </Link>
            <button type="button" onClick={handleRefresh} disabled={isRefreshing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white transition hover:bg-slate-900 disabled:opacity-60">
              <FaSyncAlt className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Dashboard
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map(([status, Icon, label, value, tone]) => (
          <KpiCard key={label} icon={Icon} label={label} value={value} tone={tone} active={activeStatus === status} onClick={() => setActiveStatus(status)} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Today&apos;s Queue</h2>
              <p className="mt-1 text-sm text-slate-500">Patients are ordered by appointment time.</p>
            </div>
            <span className="text-sm font-semibold text-slate-500">{dashboard?.todaysQueue?.length || 0} queued</span>
          </div>
          <div className="mt-4 grid max-h-[34rem] gap-3 overflow-y-auto pr-1">
            {dashboard?.todaysQueue?.length ? dashboard.todaysQueue.map((appointment, index) => (
              <div key={appointment.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[4rem_1fr_auto] lg:items-center">
                <div className="text-sm font-semibold text-sky-950">#{String(index + 1).padStart(2, '0')}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sky-950">{appointment.patientName}</p>
                    {statusBadge(appointment.status)}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{appointment.appointmentTime} • {appointment.service} • {appointment.dentistName || 'Any dentist'}</p>
                </div>
                {renderActions(appointment)}
              </div>
            )) : <EmptyState message="No patients in today's queue." />}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-sky-950">Appointment Status Overview</h2>
          <p className="mt-1 text-sm text-slate-500">Today&apos;s appointment distribution.</p>
          <div className="relative mt-5 h-72">
            {todayAppointments.length ? <Doughnut data={statusChartData} options={statusChartOptions} /> : <EmptyState message="No status data available today." />}
            {todayAppointments.length ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-sky-950">{todayAppointments.length}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total</p>
                </div>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-sky-950">Today&apos;s Appointments</h2>
            <p className="mt-1 text-sm text-slate-500">Search, filter, and open appointment details.</p>
          </div>
          <label className="relative block lg:w-[24rem]">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-sky-900 focus:ring-4 focus:ring-sky-100" placeholder="Search today's appointments..." />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Appointment ID</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Service</th>
                <th className="px-4 py-3 font-semibold">Assigned Dentist</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.length ? visibleAppointments.map((appointment) => (
                <tr key={appointment.id} className="border-b border-gray-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-500">{appointment.appointmentId}</td>
                  <td className="px-4 py-3 font-semibold text-sky-950">{appointment.appointmentTime}</td>
                  <td className="px-4 py-3">{appointment.patientName}</td>
                  <td className="px-4 py-3">{appointment.service}</td>
                  <td className="px-4 py-3">{appointment.dentistName || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(appointment.status)}</td>
                  <td className="px-4 py-3">{renderActions(appointment)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">No appointments match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {visibleAppointments.length ? (page - 1) * rowsPerPage + 1 : 0}-{Math.min(page * rowsPerPage, filteredAppointments.length)} of {filteredAppointments.length}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button>
            <span className="font-semibold text-sky-950">Page {page} of {totalPages}</span>
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>Next</button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Upcoming Appointments</h2>
              <p className="mt-1 text-sm text-slate-500">Next five scheduled appointments after today.</p>
            </div>
            <Link to={appointmentsPath} className="rounded-xl bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">View All</Link>
          </div>
          <div className="mt-5 grid gap-3">
            {dashboard?.upcomingAppointments?.length ? dashboard.upcomingAppointments.slice(0, 5).map((appointment) => (
              <div key={appointment.id} className="grid gap-2 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[8rem_1fr]">
                <div className="text-sm font-semibold text-sky-950">{formatDate(appointment.appointmentDate)}<br /><span className="text-slate-500">{appointment.appointmentTime}</span></div>
                <div>
                  <p className="font-semibold text-sky-950">{appointment.patientName}</p>
                  <p className="mt-1 text-sm text-slate-500">{appointment.service} • {appointment.dentistName || 'Any dentist'}</p>
                </div>
              </div>
            )) : <EmptyState message="No upcoming appointments." />}
          </div>
        </article>

        <div className="grid gap-6">
          <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-sky-950">Next Appointment</h2>
            {dashboard?.nextAppointment ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">{dashboard.nextAppointment.appointmentTime}</p>
                <h3 className="mt-1 text-lg font-bold text-sky-950">{dashboard.nextAppointment.patientName}</h3>
                <p className="mt-1 text-sm text-slate-500">{dashboard.nextAppointment.service} • {dashboard.nextAppointment.dentistName || 'Any dentist'}</p>
                <div className="mt-3">{statusBadge(dashboard.nextAppointment.status)}</div>
              </div>
            ) : <EmptyState message="No next appointment for today." />}
          </article>
          <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-sky-950">Waiting Patients</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                <FaUserClock className="h-5 w-5" />
                <p className="mt-3 text-sm font-semibold">Currently Waiting</p>
                <p className="text-2xl font-bold">{dashboard?.stats?.waitingPatients || 0}</p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
                <FaClock className="h-5 w-5" />
                <p className="mt-3 text-sm font-semibold">Average Wait</p>
                <p className="text-2xl font-bold">{dashboard?.stats?.averageWaitingTime || 0} min</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
              <FaUsers />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Today's Updates</h2>
              <p className="mt-1 text-sm text-slate-500">Workflow events recorded today.</p>
            </div>
          </div>
          <div className="mt-5 grid max-h-80 gap-3 overflow-y-auto pr-1">
            {dashboard?.recentActivity?.length ? dashboard.recentActivity.map((activity) => (
              <div key={activity._id} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-700" />
                <div>
                  <p className="font-semibold text-sky-950">{activity.action || 'Workflow updated'}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTime(activity.createdAt)} • {activity.performedByEmail || 'System'}</p>
                </div>
              </div>
            )) : <EmptyState message="No workflow updates today." />}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <FaBullhorn aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Clinic Promotions</h2>
                <p className="mt-1 text-sm text-slate-500">Active offers visible to portal users.</p>
              </div>
            </div>
            <Link to={promotionsPath} className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-900">
              View All
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {promotions.slice(0, 3).length ? promotions.slice(0, 3).map((promotion) => (
              <article key={promotion._id} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[5rem_1fr]">
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-2xl bg-white">
                  {promotion.imageUrl || promotion.bannerUrl ? <img src={promotion.imageUrl || promotion.bannerUrl} alt="" className="h-full w-full object-cover" /> : <FaBullhorn className="h-6 w-6 text-amber-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-600">{promotion.discountLabel || promotion.promoCode || 'Clinic Offer'}</p>
                  <h3 className="mt-1 font-semibold text-sky-950">{promotion.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{promotion.description || 'No additional details.'}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-400">Valid until {formatDate(promotion.endDate)}</p>
                </div>
              </article>
            )) : <EmptyState message="No active promotions right now." />}
          </div>
        </article>
      </section>

      {selectedAppointment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{selectedAppointment.appointmentId}</p>
                <h2 className="mt-1 text-xl font-semibold text-sky-950">{selectedAppointment.patientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedAppointment.service}</p>
              </div>
              <button type="button" onClick={() => setSelectedAppointment(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                <FaTimes />
              </button>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-slate-600">
              <p>Date: <span className="font-semibold text-sky-950">{formatDate(selectedAppointment.appointmentDate)}</span></p>
              <p>Time: <span className="font-semibold text-sky-950">{selectedAppointment.appointmentTime}</span></p>
              <p>Dentist: <span className="font-semibold text-sky-950">{selectedAppointment.dentistName || 'Any dentist'}</span></p>
              <p>Status: {statusBadge(selectedAppointment.status)}</p>
              <p>Reason: <span className="font-semibold text-sky-950">{selectedAppointment.reason || 'Not recorded'}</span></p>
            </div>
            <div className="mt-6 flex justify-end">
              <Link to={appointmentsPath} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white hover:bg-slate-900">
                <FaEye /> Open Appointments
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default StaffLandingPage
