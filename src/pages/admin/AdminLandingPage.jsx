import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import {
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarPlus,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaFileAlt,
  FaHistory,
  FaSyncAlt,
  FaTimesCircle,
  FaUserClock,
  FaUserMd,
  FaUsers,
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'
import AdminPatientsPage from './AdminPatientsPage.jsx'

ChartJS.register(ArcElement, Legend, Tooltip)

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-100',
  follow_up: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  checked_in: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_consultation: 'bg-violet-50 text-violet-700 ring-violet-100',
  completed: 'bg-teal-50 text-teal-700 ring-teal-100',
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  no_show: 'bg-slate-100 text-slate-700 ring-slate-200',
  rescheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
}

const statusColors = {
  pending: '#f59e0b',
  confirmed: '#2563eb',
  follow_up: '#0891b2',
  checked_in: '#10b981',
  in_consultation: '#7c3aed',
  completed: '#0f766e',
  cancelled: '#dc2626',
  no_show: '#111827',
  rescheduled: '#64748b',
}

const statusOptions = ['pending', 'confirmed', 'follow_up', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show', 'rescheduled']

function appointmentTimeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return Infinity
  const hours = Number(match[1])
  const period = match[3]?.toUpperCase()
  return (period ? hours % 12 + (period === 'PM' ? 12 : 0) : hours) * 60 + Number(match[2])
}

function compareDashboardAppointments(left, right) {
  return appointmentTimeMinutes(left.appointmentTime) - appointmentTimeMinutes(right.appointmentTime)
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

function getDisplayName(user) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return fullName || 'Admin'
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

function EmptyState({ message }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{message}</div>
}

function OverviewCard({ label, value, helper, icon: Icon, tone = 'sky', active, onClick }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  }

  const Tag = onClick ? 'button' : 'article'

  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`rounded-[1.75rem] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'shadow-md' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-sky-950">{value}</p>
          {helper ? <p className="mt-2 text-xs font-medium text-slate-400">{helper}</p> : null}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </Tag>
  )
}

function Panel({ title, subtitle, action, children }) {
  return (
    <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-sky-950">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </article>
  )
}

function AdminLandingPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = authStorage.getUser()
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsRefreshing(true)
    try {
      const data = await fdmstApi.getAdminDashboard()
      setDashboard(data)
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load admin dashboard.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadDashboard)
    const dashboardTimer = setInterval(() => loadDashboard({ silent: true }), 30000)
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => {
      clearInterval(dashboardTimer)
      clearInterval(clockTimer)
    }
  }, [loadDashboard])

  const stats = useMemo(() => dashboard?.stats || {}, [dashboard?.stats])
  const todayStatusCounts = useMemo(() => stats.statusCounts || {}, [stats.statusCounts])
  const cards = useMemo(() => [
    ['all', "Today's Appointments", stats.todaysAppointments || 0, 'Scheduled today', FaCalendarDay, 'amber'],
    ['pending', 'Pending Today', stats.pendingAppointments || 0, 'Awaiting clinic action', FaClock, 'amber'],
    ['confirmed', 'Confirmed Today', todayStatusCounts.confirmed || 0, 'Ready for visit', FaCalendarCheck, 'blue'],
    ['checked_in', 'Checked In Today', todayStatusCounts.checked_in || 0, 'Patients already arrived', FaUserClock, 'emerald'],
    ['in_consultation', 'In Consultation Today', todayStatusCounts.in_consultation || 0, 'Currently being treated', FaUserMd, 'violet'],
    ['completed', 'Completed Today', todayStatusCounts.completed || 0, 'Finished visits', FaCheckCircle, 'emerald'],
    ['cancelled', 'Cancelled Today', todayStatusCounts.cancelled || 0, 'Cancelled visits', FaTimesCircle, 'red'],
    ['no_show', 'No Show Today', todayStatusCounts.no_show || 0, 'Missed visits', FaUserClock, 'slate'],
  ], [stats, todayStatusCounts])
  const todayAppointments = useMemo(
    () => [...(dashboard?.todaysSchedule || [])].sort(compareDashboardAppointments),
    [dashboard?.todaysSchedule],
  )
  const filteredSchedule = useMemo(() => (
    statusFilter === 'all' ? todayAppointments : todayAppointments.filter((appointment) => appointment.status === statusFilter)
  ), [statusFilter, todayAppointments])
  const chartData = useMemo(() => ({
    labels: statusOptions.map((status) => formatStatus(status)),
    datasets: [{
      data: statusOptions.map((status) => todayStatusCounts[status] || 0),
      backgroundColor: statusOptions.map((status) => statusColors[status]),
      borderColor: '#ffffff',
      borderWidth: 3,
    }],
  }), [todayStatusCounts])
  const chartOptions = {
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
  const quickActions = [
    ['Add Appointment', FaCalendarPlus, '/admin/appointments'],
    ['Add Patient', FaUsers, 'add-patient'],
    ['View Patient', FaUsers, '/admin/patients'],
    ['Register Staff', FaUserMd, '/admin/staff'],
    ['View Reports', FaFileAlt, '/admin/reports'],
    ['Open Analytics', FaChartLine, '/admin/analytics'],
  ]

  if (isLoading) {
    return <main className="flex min-h-[60vh] items-center justify-center px-6 text-sm text-slate-500">Loading admin dashboard...</main>
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Clinic Overview</p>
            <h1 className="mt-2 text-3xl font-semibold text-sky-950">{getGreeting()}, {getDisplayName(user)}</h1>
            <p className="mt-2 text-slate-500">{currentTime.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} • {currentTime.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
            <p className="mt-3 text-sm text-slate-600">{stats.todaysAppointments || 0} appointments today · {stats.pendingAppointments || 0} awaiting confirmation</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/admin/appointments?period=past')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-sky-950 transition hover:bg-slate-50">
              <FaHistory className="h-4 w-4" /> Appointment Records
            </button>
            <button type="button" onClick={() => loadDashboard()} disabled={isRefreshing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white transition hover:bg-slate-900 disabled:opacity-60">
              <FaSyncAlt className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh Dashboard
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {cards.map(([filter, label, value, helper, Icon, tone]) => (
          <OverviewCard key={label} active={statusFilter === filter} helper={helper} icon={Icon} label={label} tone={tone} value={value} onClick={() => {
            if (statusOptions.includes(filter)) setStatusFilter(filter)
            else if (filter === 'today' || filter === 'all') setStatusFilter('all')
            else if (filter === 'patients') navigate('/admin/patients')
            else navigate('/admin/appointments')
          }} />
        ))}
      </section>

      <Panel title="Today's Appointment Schedule" subtitle="Appointments scheduled for today at the clinic. Select a row to view its details.">
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', ...statusOptions].map((status) => (
            <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`h-10 rounded-xl px-4 text-sm font-bold transition ${statusFilter === status ? 'bg-sky-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {status === 'all' ? 'All' : formatStatus(status)}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Appointment ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Assigned Dentist</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedule.length ? filteredSchedule.map((appointment) => (
                <tr key={appointment.id} onClick={() => navigate(`/admin/appointments?appointment=${appointment.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/admin/appointments?appointment=${appointment.id}`) }} tabIndex={0} className="cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-slate-50 focus:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-500">{appointment.appointmentId}</td>
                  <td className="px-4 py-3 font-semibold text-sky-950">{appointment.patientName}</td>
                  <td className="px-4 py-3">{formatDate(appointment.appointmentDate)}</td>
                  <td className="px-4 py-3">{appointment.appointmentTime}</td>
                  <td className="px-4 py-3">{appointment.service}</td>
                  <td className="px-4 py-3">{appointment.dentistName || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(appointment.status)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">{statusFilter === 'all' ? 'No appointments scheduled for today.' : `No ${formatStatus(statusFilter).toLowerCase()} appointments scheduled for today.`}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Quick Actions" subtitle="Jump directly to common admin tasks.">
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map(([label, Icon, path]) => (
              <button key={label} type="button" onClick={() => path === 'add-patient' ? setShowAddPatient(true) : navigate(path)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-sm">
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="My Schedule Today" subtitle="Appointments assigned to the logged-in Admin.">
          <div className="grid gap-3">
            {dashboard?.mySchedule?.length ? dashboard.mySchedule.map((appointment) => (
              <div key={appointment.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-bold text-sky-950">{appointment.appointmentTime} • {appointment.patientName}</p><p className="mt-1 text-sm text-slate-500">{appointment.service}</p></div>
                  {statusBadge(appointment.status)}
                </div>
              </div>
            )) : <EmptyState message="No appointments scheduled today." />}
          </div>
        </Panel>
      </section>

      {showAddPatient ? <AdminPatientsPage quickCreate onClose={() => setShowAddPatient(false)} /> : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Clinic Schedule Timeline" subtitle="Chronological view of today's clinic schedule.">
          <div className="grid max-h-96 gap-3 overflow-y-auto pr-1">
            {todayAppointments.length ? todayAppointments.map((appointment) => (
              <div key={appointment.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                <p className="font-bold text-sky-950">{appointment.appointmentTime}</p>
                <div>
                  <p className="font-semibold text-sky-950">{appointment.patientName}</p>
                  <p className="mt-1 text-sm text-slate-500">{appointment.dentistName || 'Unassigned'} • {appointment.service}</p>
                </div>
                {statusBadge(appointment.status)}
              </div>
            )) : <EmptyState message="No clinic schedule for today." />}
          </div>
        </Panel>

        <Panel title="Appointment Status Overview" subtitle="Today's operational status mix.">
          <div className="relative h-72">
            {todayAppointments.length ? <Doughnut data={chartData} options={chartOptions} /> : <EmptyState message="No status data for today." />}
            {todayAppointments.length ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center"><p className="text-3xl font-bold text-sky-950">{todayAppointments.length}</p><p className="text-xs font-semibold uppercase text-slate-400">Total</p></div>
              </div>
            ) : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6">
        <Panel title="Today's Updates" subtitle="Clinic workflow events recorded today.">
          <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
            {dashboard?.recentActivity?.length ? dashboard.recentActivity.map((item) => (
              <div key={item._id} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-700" />
                <div>
                  <p className="font-semibold text-sky-950">{item.action || 'Clinic activity'}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatTime(item.createdAt)} • {item.performedByEmail || 'System'}</p>
                </div>
              </div>
            )) : <EmptyState message="No clinic updates today." />}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Upcoming Appointments" subtitle="Next five scheduled appointments." action={<button onClick={() => navigate('/admin/appointments')} className="rounded-xl bg-sky-950 px-4 py-2 text-sm font-semibold text-white">View All</button>}>
          <div className="grid gap-3">
            {dashboard?.upcomingAppointments?.length ? dashboard.upcomingAppointments.map((appointment) => (
              <div key={appointment.id} className="grid gap-2 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[8rem_1fr]">
                <div className="text-sm font-semibold text-sky-950">{formatDate(appointment.appointmentDate)}<br /><span className="text-slate-500">{appointment.appointmentTime}</span></div>
                <div><p className="font-semibold text-sky-950">{appointment.patientName}</p><p className="mt-1 text-sm text-slate-500">{appointment.dentistName || 'Unassigned'} • {appointment.service}</p></div>
              </div>
            )) : <EmptyState message="No upcoming appointments." />}
          </div>
        </Panel>

        <Panel title="Recent Patient Registrations" subtitle="Newest patient accounts." action={<button onClick={() => navigate('/admin/patients')} className="rounded-xl bg-sky-950 px-4 py-2 text-sm font-semibold text-white">View All Patients</button>}>
          <div className="grid gap-3">
            {dashboard?.recentPatients?.length ? dashboard.recentPatients.map((patient) => (
              <div key={patient.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
                <div><p className="font-semibold text-sky-950">{patient.patientName}</p><p className="text-sm text-slate-500">{formatDate(patient.createdAt)}</p></div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-950">{patient.registrationStatus || 'New'}</span>
              </div>
            )) : <EmptyState message="No recent patient registrations." />}
          </div>
        </Panel>
      </section>

    </main>
  )
}

export default AdminLandingPage
