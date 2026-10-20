import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaAllergies,
  FaCalendarCheck,
  FaCapsules,
  FaClipboardList,
  FaFileMedical,
  FaFilter,
  FaNotesMedical,
  FaSearch,
  FaStethoscope,
  FaTooth,
  FaUserMd,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const statusStyles = {
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  declined: 'bg-red-50 text-red-700 ring-red-100',
  no_show: 'bg-red-50 text-red-700 ring-red-100',
  completed: 'bg-sky-50 text-sky-700 ring-sky-100',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  recorded: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
}
const REFERENCE_TIME = Date.now()

function fullName(patient) {
  return [patient?.firstName, patient?.lastName].filter(Boolean).join(' ') || 'Patient'
}

function formatGender(value) {
  const labels = {
    female: 'Female',
    male: 'Male',
    other: 'Other',
    prefer_not_to_say: 'Prefer not to say',
  }

  return labels[value] || 'Not provided'
}

function statusPill(status) {
  const normalized = status || 'recorded'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[normalized] || statusStyles.recorded}`}>
      {normalized === 'recorded' ? 'Recorded' : formatStatus(normalized)}
    </span>
  )
}

function InfoCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 break-words text-sm font-semibold leading-6 text-sky-950">{value || 'Not provided'}</p>
        </div>
      </div>
    </article>
  )
}

function PatientRecordsPage() {
  const toast = useToast()
  const [patient, setPatient] = useState(null)
  const [records, setRecords] = useState([])
  const [appointments, setAppointments] = useState([])
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [treatmentFilter, setTreatmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')
  const [isLoading, setIsLoading] = useState(true)

  const loadRecords = useCallback(() => {
    let isActive = true
    setIsLoading(true)

    fdmstApi.getMyDentalRecords()
      .then((response) => {
        if (!isActive) return
        setPatient(response.patient || null)
        setRecords(Array.isArray(response.data) ? response.data : [])
        setAppointments(Array.isArray(response.appointments) ? response.appointments : [])
      })
      .catch((error) => {
        if (!isActive) return
        toast.error(error.message || 'Unable to load dental records.')
        setPatient(null)
        setRecords([])
        setAppointments([])
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [toast])

  useEffect(() => {
    let cleanup
    queueMicrotask(() => {
      cleanup = loadRecords()
    })
    return () => cleanup?.()
  }, [loadRecords])

  const treatments = useMemo(() => {
    const names = records.map((record) => record.procedure || record.treatment).filter(Boolean)
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }, [records])

  const treatmentRows = useMemo(() => {
    const rows = records.map((record) => ({
      id: record._id,
      appointmentDate: record.visitDate,
      dentistName: record.dentistName || 'Not specified',
      notes: record.treatmentPerformed || record.treatment || record.diagnosis || record.recommendations || 'No treatment summary recorded',
      service: record.servicePerformed || record.procedure || record.treatment || 'Dental Treatment',
      status: 'recorded',
      toothNumber: record.toothNumber || '',
      type: 'record',
    }))

    const normalizedQuery = query.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      const matchesQuery = !normalizedQuery || [row.dentistName, row.service, row.toothNumber, row.notes, row.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
      const matchesTreatment = treatmentFilter === 'all' || row.service === treatmentFilter
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter
      const visitDate = row.appointmentDate ? new Date(row.appointmentDate) : null
      const daysAgo = dateFilter === '30_days' ? 30 : dateFilter === '90_days' ? 90 : dateFilter === '1_year' ? 365 : null
      const cutoffDate = daysAgo ? new Date(REFERENCE_TIME - daysAgo * 24 * 60 * 60 * 1000) : null
      const matchesDate = !daysAgo || (visitDate && !Number.isNaN(visitDate.getTime()) && visitDate >= cutoffDate)

      return matchesQuery && matchesTreatment && matchesStatus && matchesDate
    })

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date_asc') return new Date(a.appointmentDate || 0) - new Date(b.appointmentDate || 0)
      if (sortBy === 'treatment_asc') return a.service.localeCompare(b.service)
      return new Date(b.appointmentDate || 0) - new Date(a.appointmentDate || 0)
    })
  }, [dateFilter, query, records, sortBy, statusFilter, treatmentFilter])

  const appointmentHistory = useMemo(
    () => [...appointments].sort((a, b) => new Date(b.appointmentDate || 0) - new Date(a.appointmentDate || 0)),
    [appointments],
  )
  const lastCompletedAppointment = useMemo(
    () => appointmentHistory.find((appointment) => appointment.status === 'completed') || appointmentHistory[0],
    [appointmentHistory],
  )
  const upcomingFollowUp = useMemo(() => {
    const now = new Date()
    return appointments
      .filter((appointment) => {
        const text = `${appointment.service || ''} ${appointment.reason || ''}`.toLowerCase()
        const appointmentDate = new Date(appointment.appointmentDate || 0)
        return text.includes('follow') && appointmentDate >= now && !['cancelled', 'declined', 'no_show', 'completed'].includes(appointment.status)
      })
      .sort((a, b) => new Date(a.appointmentDate || 0) - new Date(b.appointmentDate || 0))[0]
  }, [appointments])

  const allergies = patient?.allergies?.length ? patient.allergies.join(', ') : 'None recorded'
  const medications = records.flatMap((record) => record.medications || []).filter(Boolean)

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Electronic Health Record</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Dental Records</h1>
              <p className="mt-3 max-w-2xl text-sky-100">
                Review your treatment history, appointment history, notes, diagnoses, prescriptions, and clinical documents.
              </p>
            </div>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
              <FaFileMedical className="h-7 w-7" aria-hidden="true" />
            </span>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard icon={FaClipboardList} label="Total Treatments" value={records.length} tone="amber" />
          <InfoCard icon={FaCalendarCheck} label="Last Visit" value={lastCompletedAppointment?.appointmentDate ? formatDate(lastCompletedAppointment.appointmentDate) : 'No completed visits'} />
          <InfoCard icon={FaUserMd} label="Assigned Dentist" value={patient?.assignedDentistName || lastCompletedAppointment?.dentistName || 'Not assigned'} tone="emerald" />
          <InfoCard icon={FaNotesMedical} label="Upcoming Follow-Up" value={upcomingFollowUp?.appointmentDate ? formatDate(upcomingFollowUp.appointmentDate) : 'None scheduled'} tone="rose" />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard icon={FaTooth} label="Patient" value={fullName(patient)} />
          <InfoCard icon={FaClipboardList} label="Patient ID" value={patient?.patientId} tone="amber" />
          <InfoCard icon={FaCalendarCheck} label="Birth Date" value={patient?.dateOfBirth ? formatDate(patient.dateOfBirth) : 'Not provided'} />
          <InfoCard icon={FaUserMd} label="Gender" value={formatGender(patient?.gender)} tone="emerald" />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <InfoCard icon={FaAllergies} label="Allergies" value={allergies} tone="rose" />
          <InfoCard icon={FaStethoscope} label="Medical Conditions" value={patient?.medicalHistory || 'None recorded'} />
          <InfoCard icon={FaCapsules} label="Current Medications" value={medications.length ? [...new Set(medications)].join(', ') : 'None recorded'} tone="amber" />
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Treatment History</h2>
              <p className="mt-2 text-sm text-slate-500">Search and filter dental treatments recorded by the clinic.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <label className="relative block w-full">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search date, dentist, treatment, notes..." />
            </label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[9.5rem_minmax(12rem,1fr)_9.5rem_10.5rem_auto]">
              <select className={inputClass} value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by date">
                <option value="all">All dates</option>
                <option value="30_days">Last 30 days</option>
                <option value="90_days">Last 90 days</option>
                <option value="1_year">Last year</option>
              </select>
              <select className={inputClass} value={treatmentFilter} onChange={(event) => setTreatmentFilter(event.target.value)} aria-label="Filter by treatment">
                <option value="all">All treatments</option>
                {treatments.map((treatment) => <option key={treatment} value={treatment}>{treatment}</option>)}
              </select>
              <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
                <option value="all">All status</option>
                <option value="recorded">Recorded</option>
              </select>
              <select className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort records">
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="dentist_asc">Dentist A-Z</option>
                <option value="treatment_asc">Treatment A-Z</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setDateFilter('all')
                  setTreatmentFilter('all')
                  setStatusFilter('all')
                  setSortBy('date_desc')
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <FaFilter className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Loading records...</div>
          ) : treatmentRows.length ? (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[50rem] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Appointment Date</th>
                    <th className="px-4 py-3">Dentist</th>
                    <th className="px-4 py-3">Service/Treatment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {treatmentRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-sky-950">{formatDate(row.appointmentDate)}</td>
                      <td className="px-4 py-4">{row.dentistName}</td>
                      <td className="px-4 py-4">{row.service}</td>
                      <td className="px-4 py-4">{statusPill(row.status)}</td>
                      <td className="px-4 py-4 text-slate-500">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
                <FaFileMedical className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-5 text-lg font-semibold text-sky-950">No records available yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Your treatment history, diagnoses, prescriptions, and dental notes will appear here after your first clinic visit.
              </p>
            </div>
          )}
        </section>

        <section className="mt-8">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-semibold text-sky-950">Appointment History</h2>
            <div className="mt-5 grid gap-3">
	                  {appointmentHistory.length ? appointmentHistory.slice(0, 6).map((appointment) => (
	                <div key={appointment._id || appointment.id} className="rounded-2xl bg-slate-50 p-4">
	                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	                    <div>
	                      <p className="font-semibold text-sky-950">{appointment.service || 'Dental Visit'}</p>
	                      <p className="mt-1 text-sm text-slate-500">{formatDate(appointment.appointmentDate)} at {appointment.appointmentTime}</p>
	                    </div>
	                    {statusPill(appointment.status)}
	                  </div>
	                  {appointment.clinicalRecommendation ? (
	                    <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3">
	                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dentist Recommendation</p>
	                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{appointment.clinicalRecommendation}</p>
	                    </div>
	                  ) : null}
	                </div>
	              )) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No appointment history yet.</p>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}

export default PatientRecordsPage
