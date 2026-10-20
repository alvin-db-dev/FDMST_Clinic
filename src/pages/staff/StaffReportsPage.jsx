import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  FaCalendarAlt,
  FaChartPie,
  FaChevronDown,
  FaFileExport,
  FaFileMedical,
  FaPrint,
  FaSearch,
  FaStethoscope,
  FaUserClock,
  FaUserInjured,
} from 'react-icons/fa'
import { fdmstApi, authStorage } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip)

const STATUS_OPTIONS = [
  ['all', 'All Statuses'],
  ['pending', 'Pending'],
  ['confirmed', 'Confirmed'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['no_show', 'No Show'],
]

const PERIOD_OPTIONS = [
  ['today', 'Today'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['year', 'This Year'],
  ['custom', 'Custom Date Range'],
]

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  no_show: 'bg-slate-100 text-slate-600 ring-slate-200',
  checked_in: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  in_consultation: 'bg-violet-50 text-violet-700 ring-violet-200',
  rescheduled: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
}

const chartColors = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#64748b', '#7c3aed', '#0891b2']
const rowsPerPage = 6

const toDateInput = (date) => {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDateRange = (period, customStart, customEnd) => {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  if (period === 'week') {
    const day = start.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + mondayOffset)
    end.setTime(start.getTime())
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else if (period === 'month') {
    start.setDate(1)
    end.setMonth(start.getMonth() + 1, 0)
  } else if (period === 'year') {
    start.setMonth(0, 1)
    end.setMonth(11, 31)
  } else if (period === 'custom') {
    return {
      startDate: customStart || '',
      endDate: customEnd || '',
    }
  }

  return {
    startDate: toDateInput(start),
    endDate: toDateInput(end),
  }
}

const normalizeStatus = (status) => String(status || 'pending').replaceAll('_', ' ')

const appointmentTimeValue = (appointment) => {
  const raw = String(appointment.appointmentTime || '')
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return 0
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const period = match[3]?.toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

const compareBySchedule = (left, right) => {
  const leftDate = new Date(left.appointmentDate).getTime() || 0
  const rightDate = new Date(right.appointmentDate).getTime() || 0
  return rightDate - leftDate || appointmentTimeValue(right) - appointmentTimeValue(left)
}

const statusBadge = (status) => (
  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
    {normalizeStatus(status)}
  </span>
)

function KpiCard({ icon: Icon, title, value, hint, tone }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    red: 'bg-rose-50 text-rose-700 ring-rose-100',
  }

  return (
    <article className="min-h-[132px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-sky-950">{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-400">{hint}</p>
    </article>
  )
}

function EmptyState({ message }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div>
        <FaFileMedical className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
      <button
        type="button"
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map((item) => (
        <button
          type="button"
          key={item}
          className={`h-9 w-9 rounded-xl text-sm font-semibold transition ${item === page ? 'bg-sky-950 text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
      <button
        type="button"
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  )
}

function StaffReportsPage() {
  const toast = useToast()
  const currentUser = authStorage.getUser()
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [appointmentPage, setAppointmentPage] = useState(1)
  const [recordPage, setRecordPage] = useState(1)
  const [filters, setFilters] = useState({
    period: 'month',
    status: 'all',
    search: '',
    startDate: '',
    endDate: '',
  })

  const dateRange = useMemo(
    () => getDateRange(filters.period, filters.startDate, filters.endDate),
    [filters.period, filters.startDate, filters.endDate],
  )

  const reportFilters = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    status: filters.status,
    search: filters.search.trim(),
  }), [dateRange.endDate, dateRange.startDate, filters.search, filters.status])

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const [appointmentResponse, recordResponse] = await Promise.all([
        fdmstApi.getProviderReportAppointments(reportFilters),
        fdmstApi.getProviderTreatmentRecords({
          startDate: reportFilters.startDate,
          endDate: reportFilters.endDate,
          search: reportFilters.search,
        }),
      ])

      setAppointments((appointmentResponse.data || []).sort(compareBySchedule))
      setRecords(recordResponse.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load reports.')
      setAppointments([])
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [reportFilters, toast])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  useEffect(() => {
    setAppointmentPage(1)
    setRecordPage(1)
  }, [filters])

  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    if (!search) return records
    return records.filter((record) => [
      record.patientName,
      record.servicePerformed,
      record.treatment,
      record.treatmentPerformed,
      record.procedure,
      record.diagnosis,
    ].some((value) => String(value || '').toLowerCase().includes(search)))
  }, [filters.search, records])

  const summary = useMemo(() => {
    const completed = appointments.filter((appointment) => appointment.status === 'completed').length
    const noShow = appointments.filter((appointment) => appointment.status === 'no_show').length
    const activeVisits = appointments.filter((appointment) => ['checked_in', 'in_consultation'].includes(appointment.status)).length

    return [
      { icon: FaCalendarAlt, title: 'Total Appointments', value: appointments.length, hint: 'Within selected filters', tone: 'blue' },
      { icon: FaUserClock, title: 'Active Visits', value: activeVisits, hint: 'Checked in or in consultation', tone: 'green' },
      { icon: FaStethoscope, title: 'Treatment Records', value: filteredRecords.length, hint: 'Personal clinical records', tone: 'amber' },
      { icon: FaChartPie, title: 'Completed / No Show', value: `${completed} / ${noShow}`, hint: 'Final attendance outcomes', tone: 'red' },
    ]
  }, [appointments, filteredRecords.length])

  const appointmentChartData = useMemo(() => {
    const groups = new Map()
    appointments.forEach((appointment) => {
      const date = appointment.appointmentDate ? formatDate(appointment.appointmentDate) : 'Unscheduled'
      groups.set(date, (groups.get(date) || 0) + 1)
    })
    const items = Array.from(groups.entries()).slice(0, 12).reverse()
    return {
      labels: items.map(([label]) => label),
      datasets: [{
        label: 'Appointments',
        data: items.map(([, value]) => value),
        backgroundColor: '#0f4c81',
        borderRadius: 10,
      }],
    }
  }, [appointments])

  const statusChartData = useMemo(() => {
    const labels = ['Completed', 'Pending', 'Confirmed', 'Cancelled', 'No Show']
    const values = ['completed', 'pending', 'confirmed', 'cancelled', 'no_show'].map(
      (status) => appointments.filter((appointment) => appointment.status === status).length,
    )

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: chartColors,
        borderColor: '#ffffff',
        borderWidth: 3,
      }],
    }
  }, [appointments])

  const patientVisits = useMemo(() => {
    const patients = new Map()
    const addVisit = ({ patientName, date, treatment }) => {
      const name = patientName || 'Unknown Patient'
      const current = patients.get(name) || { patientName: name, totalVisits: 0, lastVisitDate: null, lastTreatment: 'No treatment recorded' }
      const visitDate = date ? new Date(date) : null
      current.totalVisits += 1
      if (visitDate && (!current.lastVisitDate || visitDate > new Date(current.lastVisitDate))) {
        current.lastVisitDate = date
        current.lastTreatment = treatment || current.lastTreatment
      }
      patients.set(name, current)
    }

    appointments.forEach((appointment) => addVisit({
      patientName: appointment.patientName,
      date: appointment.appointmentDate,
      treatment: appointment.service,
    }))
    filteredRecords.forEach((record) => addVisit({
      patientName: record.patientName,
      date: record.visitDate || record.createdAt,
      treatment: record.servicePerformed || record.procedure || record.treatment,
    }))

    return Array.from(patients.values())
      .sort((left, right) => (new Date(right.lastVisitDate).getTime() || 0) - (new Date(left.lastVisitDate).getTime() || 0))
      .slice(0, 8)
  }, [appointments, filteredRecords])

  const performanceHighlights = useMemo(() => {
    const treatmentCounts = new Map()
    filteredRecords.forEach((record) => {
      const treatment = record.servicePerformed || record.procedure || record.treatment || 'Dental Treatment'
      treatmentCounts.set(treatment, (treatmentCounts.get(treatment) || 0) + 1)
    })
    const busiestDay = appointments.reduce((acc, appointment) => {
      const day = appointment.appointmentDate
        ? new Date(appointment.appointmentDate).toLocaleDateString(undefined, { weekday: 'long' })
        : 'Unscheduled'
      acc.set(day, (acc.get(day) || 0) + 1)
      return acc
    }, new Map())
    const topTreatment = Array.from(treatmentCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No treatment data'
    const topDay = Array.from(busiestDay.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No appointment data'
    const uniquePatients = new Set(patientVisits.map((patient) => patient.patientName)).size
    const dayCount = Math.max(new Set(appointments.map((appointment) => toDateInput(appointment.appointmentDate))).size, 1)

    return [
      ['Total Patients Treated', uniquePatients],
      ['Most Performed Treatment', topTreatment],
      ['Busiest Appointment Day', topDay],
      ['Average Appointments Per Day', (appointments.length / dayCount).toFixed(1)],
    ]
  }, [appointments, filteredRecords, patientVisits])

  const pagedAppointments = appointments.slice((appointmentPage - 1) * rowsPerPage, appointmentPage * rowsPerPage)
  const pagedRecords = filteredRecords.slice((recordPage - 1) * rowsPerPage, recordPage * rowsPerPage)
  const appointmentPages = Math.max(Math.ceil(appointments.length / rowsPerPage), 1)
  const recordPages = Math.max(Math.ceil(filteredRecords.length / rowsPerPage), 1)

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({ period: 'month', status: 'all', search: '', startDate: '', endDate: '' })
  }

  const handleExportAction = async (action) => {
    setExportOpen(false)
    try {
      await fdmstApi.logReportAction({ action, filters: reportFilters })
    } catch {
      // Reporting should not fail because audit logging was unavailable.
    }
    window.print()
    toast.success(action === 'Report exported' ? 'Preparing report export.' : 'Preparing report for printing.')
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
      tooltip: { enabled: true },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } },
      x: { grid: { display: false } },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((sum, value) => sum + value, 0)
            const value = context.parsed || 0
            const percent = total ? Math.round((value / total) * 100) : 0
            return `${context.label}: ${value} (${percent}%)`
          },
        },
      },
    },
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div>
            <h1 className="text-2xl font-bold text-sky-950">Reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Personal appointment, treatment, and patient visit reports for {currentUser?.firstName || 'your account'}.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[180px_180px_minmax(260px,1fr)_auto_auto]">
          <select className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
            {PERIOD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-500 transition focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-100">
            <FaSearch className="h-4 w-4" />
            <input className="min-w-0 flex-1 bg-transparent font-medium text-slate-700 outline-none" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search patient name or Patient ID" />
          </label>
          <button type="button" className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50" onClick={clearFilters}>Clear Filters</button>
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 lg:w-auto"
              onClick={() => setExportOpen((value) => !value)}
            >
              <FaFileExport className="h-4 w-4" />
              Export
              <FaChevronDown className="h-3 w-3" />
            </button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleExportAction('Report exported')}>
                  <FaFileExport className="h-4 w-4 text-sky-700" /> Export PDF
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleExportAction('Report printed')}>
                  <FaPrint className="h-4 w-4 text-sky-700" /> Print Report
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {filters.period === 'custom' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:w-[420px]">
            <input type="date" className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
            <input type="date" className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} />
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((card) => <KpiCard key={card.title} {...card} />)}
      </section>

      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <article className="flex min-h-[390px] flex-col rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-sky-950">Appointment Analytics</h2>
          <p className="text-sm text-slate-500">Appointment activity within the selected report range.</p>
          <div className="mt-5 min-h-0 flex-1">
            {isLoading ? <EmptyState message="Loading appointment chart..." /> : appointments.length ? <Bar data={appointmentChartData} options={chartOptions} /> : <EmptyState message="No appointment activity for this range." />}
          </div>
        </article>

        <article className="flex min-h-[390px] flex-col rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-sky-950">Appointment Status</h2>
          <p className="text-sm text-slate-500">Personal status distribution.</p>
          <div className="mt-5 min-h-0 flex-1">
            {isLoading ? <EmptyState message="Loading status chart..." /> : appointments.length ? <Doughnut data={statusChartData} options={doughnutOptions} /> : <EmptyState message="No status data available." />}
          </div>
        </article>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-sky-950">Appointment Records</h2>
          <p className="text-sm text-slate-500">Searchable appointment history linked to your account.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Appointment ID</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Time</th>
                <th className="px-5 py-4">Patient Name</th>
                <th className="px-5 py-4">Service</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td className="px-5 py-10 text-center text-slate-500" colSpan="7">Loading appointment records...</td></tr>
              ) : pagedAppointments.length ? pagedAppointments.map((appointment) => (
                <tr key={appointment.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{String(appointment.id).slice(-8).toUpperCase()}</td>
                  <td className="px-5 py-4 text-slate-700">{formatDate(appointment.appointmentDate)}</td>
                  <td className="px-5 py-4 text-slate-700">{appointment.appointmentTime || 'Not set'}</td>
                  <td className="px-5 py-4 font-semibold text-sky-950">{appointment.patientName}</td>
                  <td className="px-5 py-4 text-slate-600">{appointment.service}</td>
                  <td className="px-5 py-4">{statusBadge(appointment.status)}</td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100" onClick={() => setSelectedItem({ type: 'Appointment', data: appointment })}>View Details</button>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-5 py-12 text-center text-slate-500" colSpan="7">No appointment records match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={appointmentPage} totalPages={appointmentPages} onChange={setAppointmentPage} />
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-sky-950">Treatment Records</h2>
          <p className="text-sm text-slate-500">Clinical treatments recorded by you or assigned to you.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Treatment Date</th>
                <th className="px-5 py-4">Patient Name</th>
                <th className="px-5 py-4">Procedure</th>
                <th className="px-5 py-4">Tooth Number</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Notes</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td className="px-5 py-10 text-center text-slate-500" colSpan="7">Loading treatment records...</td></tr>
              ) : pagedRecords.length ? pagedRecords.map((record) => (
                <tr key={record._id || record.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 text-slate-700">{formatDate(record.visitDate || record.createdAt)}</td>
                  <td className="px-5 py-4 font-semibold text-sky-950">{record.patientName}</td>
                  <td className="px-5 py-4 text-slate-600">{record.servicePerformed || record.procedure || record.treatment || 'Dental Treatment'}</td>
                  <td className="px-5 py-4 text-slate-600">{record.toothNumber || '-'}</td>
                  <td className="px-5 py-4">{statusBadge('completed')}</td>
                  <td className="max-w-[260px] truncate px-5 py-4 text-slate-600">{record.notes || record.diagnosis || 'No notes recorded'}</td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100" onClick={() => setSelectedItem({ type: 'Treatment Record', data: record })}>View Details</button>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-5 py-12 text-center text-slate-500" colSpan="7">No treatment records match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={recordPage} totalPages={recordPages} onChange={setRecordPage} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
              <FaUserInjured className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-sky-950">Patient Visit Summary</h2>
              <p className="text-sm text-slate-500">Patients assigned to or treated by you.</p>
            </div>
          </div>
          <div className="space-y-3">
            {patientVisits.length ? patientVisits.map((patient) => (
              <div key={patient.patientName} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-sky-950">{patient.patientName}</p>
                  <p className="text-sm text-slate-500">Last treatment: {patient.lastTreatment || 'No treatment recorded'}</p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p><span className="font-bold text-sky-950">{patient.totalVisits}</span> visits</p>
                  <p>{patient.lastVisitDate ? formatDate(patient.lastVisitDate) : 'No visit date'}</p>
                </div>
              </div>
            )) : <EmptyState message="No patient visit activity yet." />}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-sky-950">Performance Highlights</h2>
          <p className="text-sm text-slate-500">Personal insights only, without clinic-wide comparisons.</p>
          <div className="mt-5 grid gap-3">
            {performanceHighlights.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-sky-950">{value}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div className="w-full max-w-2xl rounded-[1.5rem] bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-slate-400">{selectedItem.type}</p>
                <h3 className="mt-1 text-xl font-bold text-sky-950">{selectedItem.data.patientName || 'Report Details'}</h3>
              </div>
              <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={() => setSelectedItem(null)}>Close</button>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {Object.entries(selectedItem.data).filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object').slice(0, 12).map(([key, value]) => (
                <div key={key} className="rounded-2xl bg-slate-50 p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{key.replaceAll('_', ' ')}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-700">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default StaffReportsPage
