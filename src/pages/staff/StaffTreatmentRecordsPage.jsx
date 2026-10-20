import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaChevronDown,
  FaEdit,
  FaEye,
  FaFileExport,
  FaFileMedicalAlt,
  FaPlus,
  FaPrint,
  FaSearch,
  FaTimes,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import DateRangeFilter from '../../components/DateRangeFilter.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const statusOptions = [
  ['completed', 'Completed'],
  ['in_progress', 'In Progress'],
  ['cancelled', 'Cancelled'],
  ['follow_up_required', 'Follow-up Required'],
]
const emptyForm = {
  patientName: '',
  patientId: '',
  appointment: '',
  visitDate: new Date().toISOString().slice(0, 10),
  procedure: '',
  toothNumber: '',
  diagnosis: '',
  treatmentPerformed: '',
  materialsUsed: '',
  treatmentStatus: 'completed',
  recommendations: '',
  notes: '',
}

const statusClass = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_progress: 'bg-blue-50 text-blue-700 ring-blue-100',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-100',
  follow_up_required: 'bg-amber-50 text-amber-700 ring-amber-100',
}

const statusLabel = (status) => statusOptions.find(([value]) => value === status)?.[1] || 'Completed'

const formatAppointmentId = (value) => {
  if (!value) return ''
  const raw = typeof value === 'object' ? value._id || value.id || value.appointmentId : value
  if (!raw) return ''
  const text = String(raw)
  return text.startsWith('APT-') ? text : `APT-${text.slice(-6).toUpperCase()}`
}

const canEditRecord = (record, user) => {
  const userId = String(user?.id || '')
  const email = String(user?.email || '').toLowerCase()
  return String(record?.createdBy || '') === userId || String(record?.createdByEmail || '').toLowerCase() === email
}

function RecordModal({ mode, form, setForm, onClose, onSubmit, isSaving, canEdit, onAddClinicalNote }) {
  const isReadonly = mode === 'view' || !canEdit
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [lookupStatus, setLookupStatus] = useState('loading')

  useEffect(() => {
    if (mode !== 'create') return
    let active = true
    const loadAppointments = async () => {
      const first = await fdmstApi.getAppointments({ period: 'all', limit: 100 })
      const remaining = await Promise.all(Array.from({ length: (first.pagination?.pages || 1) - 1 }, (_, index) =>
        fdmstApi.getAppointments({ period: 'all', limit: 100, page: index + 2 })))
      return { data: [first, ...remaining].flatMap((response) => response.data || []) }
    }
    Promise.all([fdmstApi.list('patients'), loadAppointments()])
      .then(([patientResponse, appointmentResponse]) => {
        if (!active) return
        setPatients(patientResponse.data || [])
        setAppointments((appointmentResponse.data || []).sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate)))
        setLookupStatus('ready')
      })
      .catch(() => { if (active) setLookupStatus('error') })
    return () => { active = false }
  }, [mode])

  const patientName = (patient) => [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
  const matches = patients.filter((patient) => patientName(patient).toLowerCase().includes(form.patientName.trim().toLowerCase()))
  const patientAppointments = appointments.filter((appointment) => {
    const patientId = appointment.patientSnapshot?.id || appointment.patient?._id || appointment.patient
    return form.patient && String(patientId) === String(form.patient)
  })
  const selectPatient = (patient) => {
    const appointment = appointments.find((item) => String(item.patientSnapshot?.id || item.patient?._id || item.patient) === String(patient._id))
    setForm((current) => ({
      ...current,
      patientName: patientName(patient),
      patient: patient._id,
      patientId: patient.patientId || '',
      appointment: appointment?.id || '',
      appointmentDisplay: '',
    }))
    setSearchOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[1.5rem] bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{mode === 'create' ? 'New Treatment Record' : mode === 'edit' ? 'Edit Treatment Record' : 'Treatment Record Details'}</p>
            <h2 className="mt-1 text-xl font-bold text-sky-950">{form.patientName || 'Treatment Record'}</h2>
            <p className="mt-1 text-sm text-slate-500">Official patient treatment history, separate from private clinical notes.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-3">
          <div className="relative grid gap-2 text-sm font-bold text-slate-600">
            <label htmlFor="treatment-patient-name">Patient Name</label>
            <input id="treatment-patient-name" className={inputClass} value={form.patientName} disabled={mode !== 'create'} autoComplete="off" onFocus={() => setSearchOpen(true)} onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setSearchOpen(false) }} onChange={(event) => {
              setForm((current) => ({ ...current, patientName: event.target.value, patient: '', patientId: '', appointment: '', appointmentDisplay: '' }))
              setSearchOpen(true)
            }} placeholder="Search patient name" />
            {mode === 'create' && searchOpen && form.patientName.trim() ? (
              <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {lookupStatus !== 'ready' ? <p className="p-3 text-xs">{lookupStatus === 'error' ? 'Unable to load patients. Close and reopen to retry.' : 'Loading patients...'}</p> : matches.length ? matches.map((patient) => (
                  <button key={patient._id} type="button" className="block w-full px-4 py-3 text-left hover:bg-sky-50 focus:bg-sky-50" onMouseDown={(event) => event.preventDefault()} onClick={() => selectPatient(patient)}>
                    {patientName(patient)}<span className="block text-xs font-normal text-slate-500">{patient.patientId || patient.email || 'No Patient ID'}</span>
                  </button>
                )) : <p className="p-3 text-xs">No matching patients.</p>}
              </div>
            ) : null}
          </div>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Patient ID
            <input className={inputClass} value={form.patientId || 'Not recorded'} disabled placeholder="Patient ID" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Appointment ID
            {mode === 'create' ? (
              <select className={inputClass} value={form.appointment} disabled={isReadonly || !patientAppointments.length} onChange={(event) => update('appointment', event.target.value)}>
                <option value="">{form.patient ? 'No appointment selected' : 'Select a patient first'}</option>
                {patientAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.appointmentId || formatAppointmentId(appointment.id)} — {formatDate(appointment.appointmentDate)} ({appointment.status})</option>)}
              </select>
            ) : <input className={inputClass} value={form.appointmentDisplay || form.appointment} disabled />}
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Treatment Date
            <input className={inputClass} type="date" value={form.visitDate} disabled={isReadonly} onChange={(event) => update('visitDate', event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Procedure / Service
            <input className={inputClass} value={form.procedure} disabled={isReadonly} onChange={(event) => update('procedure', event.target.value)} placeholder="Procedure or service" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Treatment Status
            <select className={inputClass} value={form.treatmentStatus} disabled={isReadonly} onChange={(event) => update('treatmentStatus', event.target.value)}>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Diagnosis
            <textarea className={textareaClass} value={form.diagnosis} disabled={isReadonly} onChange={(event) => update('diagnosis', event.target.value)} placeholder="Diagnosis" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Treatment Description
            <textarea className={textareaClass} value={form.treatmentPerformed} disabled={isReadonly} onChange={(event) => update('treatmentPerformed', event.target.value)} placeholder="Treatment performed" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Materials Used
            <textarea className={textareaClass} value={form.materialsUsed} disabled={isReadonly} onChange={(event) => update('materialsUsed', event.target.value)} placeholder="Optional materials used" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Follow-up Notes
            <textarea className={textareaClass} value={form.recommendations} disabled={isReadonly} onChange={(event) => update('recommendations', event.target.value)} placeholder="Follow-up notes or recommendations" />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
          <button type="button" className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>{mode === 'view' ? 'Back' : 'Cancel'}</button>
          {mode === 'view' && onAddClinicalNote ? (
            <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900" onClick={onAddClinicalNote}>
              Add Clinical Note
            </button>
          ) : null}
          {mode !== 'view' && canEdit ? (
            <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60" disabled={isSaving} onClick={onSubmit}>
              {isSaving ? 'Saving...' : mode === 'create' ? 'Create Treatment Record' : 'Save Changes'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function StaffTreatmentRecordsPage() {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = authStorage.getUser()
  const isAdmin = currentUser?.role === 'admin'
  const isStaff = currentUser?.role === 'staff'
  const appointmentOpenRef = useRef('')
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState({ total: 0, completed: 0, followUps: 0, inProgress: 0 })
  const [filterOptions, setFilterOptions] = useState({ procedures: [], providers: [] })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [filters, setFilters] = useState({
    scope: 'mine',
    search: '',
    provider: '',
    procedure: 'all',
    status: 'all',
    startDate: '',
    endDate: '',
    page: 1,
  })
  const appointmentRecordId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('appointment') || ''
  }, [location.search])

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fdmstApi.getTreatmentRecords({
        ...filters,
        scope: isAdmin ? filters.scope : 'mine',
        limit: 10,
      })
      setRecords(response.data || [])
      setSummary(response.summary || { total: 0, completed: 0, followUps: 0, inProgress: 0 })
      setFilterOptions(response.filters || { procedures: [], providers: [] })
      setPagination(response.pagination || { page: 1, pages: 1, total: 0 })
    } catch (error) {
      toast.error(error.message || 'Unable to load treatment records.')
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [filters, isAdmin, toast])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const cards = useMemo(() => [
    ['Total Treatments', summary.total, 'bg-blue-50 text-blue-700 ring-blue-100'],
    ['Completed', summary.completed, 'bg-emerald-50 text-emerald-700 ring-emerald-100'],
    ['Follow-ups', summary.followUps, 'bg-amber-50 text-amber-700 ring-amber-100'],
    ['In Progress', summary.inProgress, 'bg-violet-50 text-violet-700 ring-violet-100'],
  ], [summary])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : 1 }))
  }

  const clearFilters = () => setFilters({ scope: 'mine', search: '', provider: '', procedure: 'all', status: 'all', startDate: '', endDate: '', page: 1 })

  const openCreate = () => {
    setForm({ ...emptyForm, visitDate: new Date().toISOString().slice(0, 10) })
    setModal({ mode: 'create', record: null })
  }

  const toForm = (record) => ({
    ...emptyForm,
    ...record,
    appointment: record.appointment || '',
    appointmentDisplay: record.appointmentSnapshot?.appointmentId || formatAppointmentId(record.appointment),
    patientId: record.patientId || record.patientSnapshot?.patientId || '',
    visitDate: record.visitDate ? new Date(record.visitDate).toISOString().slice(0, 10) : emptyForm.visitDate,
    procedure: record.procedure || record.servicePerformed || '',
    treatmentPerformed: record.treatmentPerformed || '',
    recommendations: record.recommendations || record.nextVisitRecommendation || '',
  })

  const openView = useCallback(async (record) => {
    try {
      await fdmstApi.viewTreatmentRecord(record.id, { scope: isAdmin && filters.scope === 'all' ? 'all' : 'mine' })
    } catch {
      // Viewing should still work if audit logging fails.
    }
    setForm(toForm(record))
    setModal({ mode: 'view', record })
  }, [filters.scope, isAdmin])

  useEffect(() => {
    if (!appointmentRecordId || appointmentOpenRef.current === appointmentRecordId) return

    let isMounted = true
    appointmentOpenRef.current = appointmentRecordId

    const openAppointmentTreatmentRecord = async () => {
      try {
        const response = await fdmstApi.getTreatmentRecords({
          appointment: appointmentRecordId,
          scope: isAdmin ? 'all' : 'mine',
          limit: 1,
        })
        const record = (response.data || [])[0]

        if (!isMounted) return

        if (!record) {
          toast.info('Treatment record is still being prepared for this appointment.')
          return
        }

        await openView(record)
      } catch (error) {
        if (!isMounted) return
        toast.error(error.message || 'Unable to open the treatment record for this appointment.')
      }
    }

    openAppointmentTreatmentRecord()

    return () => {
      isMounted = false
    }
  }, [appointmentRecordId, isAdmin, openView, toast])

  const openEdit = (record) => {
    setForm(toForm(record))
    setModal({ mode: 'edit', record })
  }

  const saveRecord = async () => {
    setIsSaving(true)
    try {
      if (modal.mode === 'create') {
        await fdmstApi.createTreatmentRecord(form)
        toast.success('Treatment record created.')
      } else {
        await fdmstApi.updateTreatmentRecord(modal.record.id, form)
        toast.success('Treatment record updated.')
      }
      setModal(null)
      await loadRecords()
    } catch (error) {
      toast.error(error.message || 'Unable to save treatment record.')
    } finally {
      setIsSaving(false)
    }
  }

  const exportRecords = async () => {
    setExportOpen(false)
    try {
      await fdmstApi.exportTreatmentRecords({ filters })
    } catch {
      // Export logging should not block printing.
    }
    window.print()
    toast.success('Preparing treatment records export.')
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <FaFileMedicalAlt />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-sky-950">Treatment Records</h1>
            <p className="mt-1 text-sm text-slate-500">Official patient treatment history and provider treatment summaries.</p>
          </div>
        </div>

        <div className={`mt-6 grid gap-3 ${isAdmin ? 'xl:grid-cols-[minmax(360px,1fr)_auto]' : 'xl:grid-cols-1'} xl:items-center`}>
          <label className="relative block">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-11`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search patient, provider, procedure, or diagnosis..." />
          </label>
          {isAdmin ? (
            <div className="flex flex-col gap-3 sm:flex-row xl:flex-nowrap">
              <button type="button" className="inline-flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900" onClick={openCreate}>
                <FaPlus /> Create Record
              </button>
              <div className="relative">
                <button type="button" className="inline-flex h-11 w-full whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900 sm:w-auto" onClick={() => setExportOpen((value) => !value)}>
                  <FaFileExport /> Export <FaChevronDown className="h-3 w-3" />
                </button>
                {exportOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={exportRecords}><FaFileExport className="text-sky-700" /> Export PDF</button>
                    <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={exportRecords}><FaPrint className="text-sky-700" /> Print Records</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className={`mt-4 grid items-center gap-3 ${isAdmin ? 'md:grid-cols-2 xl:grid-cols-[140px_170px_170px_150px_250px_auto]' : 'md:grid-cols-2 xl:grid-cols-[170px_170px_250px_auto_auto]'}`}>
          {isAdmin ? (
            <select className={inputClass} value={filters.scope} onChange={(event) => updateFilter('scope', event.target.value)}>
              <option value="mine">My Records</option>
              <option value="all">All Records</option>
            </select>
          ) : null}
          {isAdmin ? (
            <select className={inputClass} value={filters.provider} onChange={(event) => updateFilter('provider', event.target.value)}>
              <option value="">All Providers</option>
              {(filterOptions.providers || []).map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          ) : null}
          <select className={inputClass} value={filters.procedure} onChange={(event) => updateFilter('procedure', event.target.value)}>
            <option value="all">All Procedures</option>
            {(filterOptions.procedures || []).map((procedure) => <option key={procedure} value={procedure}>{procedure}</option>)}
          </select>
          <select className={inputClass} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="all">All Status</option>
            {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <DateRangeFilter startDate={filters.startDate} endDate={filters.endDate} onChange={updateFilter} />
          <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={clearFilters}>
            <FaTimes /> Clear
          </button>
          {!isAdmin ? (
            <div className="flex flex-col gap-3 sm:flex-row xl:flex-nowrap">
              {!isStaff ? (
                <button type="button" className="inline-flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900" onClick={openCreate}>
                  <FaPlus /> Create Record
                </button>
              ) : null}
              <div className="relative">
                <button type="button" className="inline-flex h-11 w-full whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900 sm:w-auto" onClick={() => setExportOpen((value) => !value)}>
                  <FaFileExport /> Export <FaChevronDown className="h-3 w-3" />
                </button>
                {exportOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={exportRecords}><FaFileExport className="text-sky-700" /> Export PDF</button>
                    <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={exportRecords}><FaPrint className="text-sky-700" /> Print Records</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${tone}`}><FaFileMedicalAlt /></span>
            <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-sky-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-bold text-sky-950">Treatment Records Table</h2>
          <p className="mt-1 text-sm text-slate-500">{pagination.total} records found.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Treatment Date</th>
                <th className="px-5 py-4">Patient Name</th>
                <th className="px-5 py-4">Provider Name</th>
                <th className="px-5 py-4">Procedure</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td className="px-5 py-10 text-center text-slate-500" colSpan="6">Loading treatment records...</td></tr>
              ) : records.length ? records.map((record) => (
                <tr key={record.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 text-slate-600"><span className="inline-flex items-center gap-2"><FaCalendarAlt className="text-slate-300" />{formatDate(record.visitDate || record.createdAt)}</span></td>
                  <td className="px-5 py-4 font-bold text-sky-950">{record.patientName}</td>
                  <td className="px-5 py-4 text-slate-600">{record.createdByName || record.dentistName || 'Unknown provider'}</td>
                  <td className="px-5 py-4 text-slate-600">{record.procedure || 'Dental Treatment'}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass[record.treatmentStatus] || statusClass.completed}`}>{statusLabel(record.treatmentStatus)}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100" title="View details" onClick={() => openView(record)}><FaEye /></button>
                      {!isStaff && canEditRecord(record, currentUser) ? (
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100" title="Edit record" onClick={() => openEdit(record)}><FaEdit /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-5 py-14 text-center text-slate-500" colSpan="6">No treatment records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button type="button" className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-50" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)}>Previous</button>
            <button type="button" className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-50" disabled={filters.page >= pagination.pages} onClick={() => updateFilter('page', filters.page + 1)}>Next</button>
          </div>
        </div>
      </section>

      {modal ? (
        <RecordModal
          mode={modal.mode}
          form={form}
          setForm={setForm}
          onClose={() => setModal(null)}
          onSubmit={saveRecord}
          isSaving={isSaving}
          canEdit={modal.mode === 'create' || canEditRecord(modal.record, currentUser)}
          onAddClinicalNote={
            modal.mode === 'view' && form.appointment && !isStaff
              ? () => navigate('/admin/clinical-notes?appointment=' + form.appointment)
              : null
          }
        />
      ) : null}
    </main>
  )
}

export default StaffTreatmentRecordsPage
