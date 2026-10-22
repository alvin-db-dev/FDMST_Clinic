import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaFileInvoiceDollar,
  FaRegCalendarAlt,
  FaSearch,
  FaTimes,
  FaTooth,
  FaUserCheck,
  FaUserClock,
  FaUserTimes,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import { inputClass } from '../components/AdminUi.jsx'
import AppointmentReceiptModal from '../components/AppointmentReceiptModal.jsx'
import AppointmentsTable from '../components/AppointmentsTable.jsx'
import DentalChart from '../components/DentalChart.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../utils/auth.js'
import { RecordModal, emptyForm as emptyTreatmentForm, toForm as toTreatmentForm } from './staff/StaffTreatmentRecordsPage.jsx'

const statusBadgeClass = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-100',
  follow_up: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  checked_in: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_consultation: 'bg-violet-50 text-violet-700 ring-violet-100',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  declined: 'bg-red-50 text-red-700 ring-red-100',
  no_show: 'bg-slate-100 text-slate-700 ring-slate-200',
  rescheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
}

const calendarStatusStyles = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-800',
  follow_up: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  checked_in: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  in_consultation: 'border-violet-200 bg-violet-50 text-violet-800',
  completed: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  cancelled: 'border-red-200 bg-red-50 text-red-800',
  declined: 'border-red-200 bg-red-50 text-red-800',
  no_show: 'border-slate-950 bg-slate-900 text-white',
  rescheduled: 'border-slate-200 bg-slate-50 text-slate-700',
}

const calendarLegend = [
  ['pending', '🟡 Pending'],
  ['confirmed', '🔵 Confirmed'],
  ['follow_up', '🩵 Return Appointment'],
  ['checked_in', '🟢 Checked In'],
  ['in_consultation', '🟣 In Consultation'],
  ['completed', '✅ Completed'],
  ['cancelled', '🔴 Cancelled'],
  ['no_show', '⚫ No Show'],
]

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const appointmentTimeMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return Infinity
  const hours = Number(match[1])
  const period = match[3]?.toUpperCase()
  return (period ? hours % 12 + (period === 'PM' ? 12 : 0) : hours) * 60 + Number(match[2])
}

const officialClinicServices = [
  'Dental Radiographs',
  'Oral Surgery',
  'Veneers',
  'Tooth Sealant',
  'Fluoride Treatment',
  'Braces / Orthodontic Treatment',
  'Tooth Extraction',
  'Dental Restoration',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dentures',
  'Oral Prophylaxis / Cleaning',
  'Root Canal Therapy (RCT)',
  'Oral Check-up',
]

const emptyClinicalNoteForm = {
  patientName: '',
  appointment: '',
  appointmentDisplay: '',
  visitDate: new Date().toISOString().slice(0, 10),
  noteType: 'Clinical Note',
  clinicalNotes: {
    observation: '',
    assessment: '',
    recommendations: '',
    additionalNotes: '',
  },
  followUp: {
    enabled: false,
    date: '',
    time: '',
    reason: '',
  },
}

function formatAppointmentDate(value) {
  if (!value) return 'Not scheduled'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled'
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRecordStatus(value, fallback = 'completed') {
  return formatStatus(String(value || fallback))
}

function formatAppointmentStatusLabel(status) {
  return status === 'follow_up' ? 'Confirmed / Return Appointment' : formatStatus(status)
}

function formatAppointmentId(appointment) {
  const raw = appointment?.appointmentId || appointment?.id || appointment
  if (!raw) return ''
  const text = String(raw)
  return text.startsWith('APT-') ? text : `APT-${text.slice(-6).toUpperCase()}`
}

function getRecordPatientId(record, appointment) {
  return appointment?.patientSnapshot?.patientId
    || record?.patientSnapshot?.patientId
    || record?.patientId
    || 'Not recorded'
}

function calculateAge(value) {
  if (!value) return 'Not recorded'
  const birthDate = new Date(value)
  if (Number.isNaN(birthDate.getTime())) return 'Not recorded'
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthOffset = today.getMonth() - birthDate.getMonth()
  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthDate.getDate())) age -= 1
  return age >= 0 ? `${age} years old` : 'Not recorded'
}

function toDateKey(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysKey(days) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

function SummaryCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-sky-950">{value}</p>
        </div>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function AppointmentsPage({ allowApproval = false }) {
  const toast = useToast()
  const location = useLocation()
  const requestedPeriod = new URLSearchParams(location.search).get('period')
  const requestedAppointmentId = new URLSearchParams(location.search).get('appointment')
  const currentUser = authStorage.getUser()
  const isAdmin = currentUser?.role === 'admin'
  const isStaff = currentUser?.role === 'staff'
  const [appointments, setAppointments] = useState([])
  const [serviceOptions, setServiceOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [view, setView] = useState('table')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [filters, setFilters] = useState({
    date: '',
    dentist: 'all',
    status: 'all',
    patient: '',
    search: '',
    service: 'all',
    period: requestedPeriod === 'past' ? 'past' : 'default',
    startDate: '',
    endDate: '',
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 })
  const [declineTarget, setDeclineTarget] = useState(null)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null)
  const [quickActionModal, setQuickActionModal] = useState(null)
  const [documentationPrompt, setDocumentationPrompt] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineError, setDeclineError] = useState('')
  const [outcomeTarget, setOutcomeTarget] = useState(null)
  const [clinicalNoteModal, setClinicalNoteModal] = useState(null)
  const [clinicalNoteForm, setClinicalNoteForm] = useState(emptyClinicalNoteForm)
  const [isSavingClinicalNote, setIsSavingClinicalNote] = useState(false)
  const [followUpSlots, setFollowUpSlots] = useState([])
  const [followUpAvailabilityMessage, setFollowUpAvailabilityMessage] = useState('')
  const [isLoadingFollowUpSlots, setIsLoadingFollowUpSlots] = useState(false)
  const [receiptAppointment, setReceiptAppointment] = useState(null)
  const [treatmentModal, setTreatmentModal] = useState(null)
  const [treatmentForm, setTreatmentForm] = useState(emptyTreatmentForm)
  const [isSavingTreatment, setIsSavingTreatment] = useState(false)

  const openTreatmentModal = async (appointment) => {
    if (!appointment) return

    let existingRecord = appointment.treatmentRecord
    try {
      // Appointment summaries omit attachments; load the complete record before opening the editor.
      const response = await fdmstApi.getTreatmentRecords({
        appointment: appointment.id,
        scope: isAdmin ? 'all' : 'mine',
        limit: 1,
      })
      if (response.data?.length) {
        existingRecord = response.data[0]
      }
    } catch (err) {
      console.warn('Unable to load the complete treatment record:', err)
    }

    if (existingRecord) {
      setTreatmentForm(toTreatmentForm(existingRecord))
      setTreatmentModal({ mode: 'edit', record: existingRecord })
    } else {
      setTreatmentForm({
        ...emptyTreatmentForm,
        patientName: appointment.patientName || '',
        patient: appointment.patientSnapshot?.id || appointment.patient?._id || appointment.patient || '',
        patientId: appointment.patientSnapshot?.patientId || '',
        appointment: appointment.id,
        appointmentDisplay: appointment.appointmentId || `APT-${String(appointment.id).slice(-6).toUpperCase()}`,
        procedure: appointment.service || '',
        treatmentStatus: 'completed',
        visitDate: appointment.appointmentDate ? new Date(appointment.appointmentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      })
      setTreatmentModal({ mode: 'create', record: null })
    }
  }

  const saveTreatmentRecord = async (finalData) => {
    setIsSavingTreatment(true)
    const payload = finalData && typeof finalData === 'object' && finalData.patientName ? finalData : treatmentForm
    try {
      let savedData = null
      if (treatmentModal?.mode === 'edit' && (treatmentModal?.record?.id || treatmentModal?.record?._id)) {
        const recordId = treatmentModal.record.id || treatmentModal.record._id
        const res = await fdmstApi.updateTreatmentRecord(recordId, payload)
        savedData = res.data
        toast.success('Treatment record updated successfully.')
      } else {
        const res = await fdmstApi.createTreatmentRecord(payload)
        savedData = res.data
        toast.success('Treatment record created successfully.')
      }

      const appointmentId = payload.appointment || treatmentForm.appointment
      if (appointmentId) {
        setAppointments((prev) =>
          prev.map((apt) =>
            String(apt.id) === String(appointmentId)
              ? { ...apt, status: 'completed', hasTreatmentRecord: true, treatmentRecord: savedData || apt.treatmentRecord }
              : apt
          )
        )
        setSelectedAppointment((prev) =>
          prev && String(prev.id) === String(appointmentId)
            ? { ...prev, status: 'completed', hasTreatmentRecord: true, treatmentRecord: savedData || prev.treatmentRecord }
            : prev
        )
      }

      setTreatmentModal(null)
      setTreatmentForm(emptyTreatmentForm)
      loadAppointments({ silent: true })
    } catch (error) {
      if (error.data?.id || error.status === 409) {
        toast.error('A Treatment Record already exists. Loading existing record...')
        try {
          const recordId = error.data?.id
          if (recordId) {
            const rec = await fdmstApi.viewTreatmentRecord(recordId)
            if (rec?.data) {
              setTreatmentForm(toTreatmentForm(rec.data))
              setTreatmentModal({ mode: 'edit', record: rec.data })
              return
            }
          }
        } catch {
          // ignore
        }
      }
      toast.error(error.message || 'Unable to save treatment record.')
    } finally {
      setIsSavingTreatment(false)
    }
  }

  const loadAppointments = useCallback(async ({ silent = false } = {}) => {
    try {
      const appointmentResponse = await fdmstApi.getAppointments({
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      })
      setAppointments(appointmentResponse.data || [])
      setPagination((current) => ({
        ...current,
        ...(appointmentResponse.pagination || {}),
      }))
      setServiceOptions([...new Set([...officialClinicServices, ...(appointmentResponse.filters?.services || [])])])
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load appointments.')
    } finally {
      setIsLoading(false)
    }
  }, [filters, pagination.page, pagination.limit, toast])

  useEffect(() => {
    Promise.resolve().then(loadAppointments)
    const timer = setInterval(() => loadAppointments({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadAppointments])

  useEffect(() => {
    if (!requestedAppointmentId) return undefined
    let active = true
    fdmstApi.getAppointment(requestedAppointmentId)
      .then((response) => { if (active) setSelectedAppointment(response.appointment || null) })
      .catch((error) => { if (active) toast.error(error.message || 'Unable to open appointment details.') })
    return () => { active = false }
  }, [requestedAppointmentId, toast])

  useEffect(() => {
    if (!filters.date) return
    const selectedDate = new Date(`${filters.date}T00:00:00`)
    if (!Number.isNaN(selectedDate.getTime())) setCalendarMonth(selectedDate)
  }, [filters.date])

  useEffect(() => {
    const followUp = clinicalNoteForm.followUp || {}
    const service = clinicalNoteModal?.appointment?.service
    const dentistName = clinicalNoteModal?.appointment?.dentistName

    if (!followUp.enabled || !followUp.date || !service) {
      setFollowUpSlots([])
      setFollowUpAvailabilityMessage('')
      setIsLoadingFollowUpSlots(false)
      return
    }

    let isMounted = true
    setIsLoadingFollowUpSlots(true)
    setFollowUpAvailabilityMessage('Loading available appointments...')

    const timer = window.setTimeout(async () => {
      try {
        const response = await fdmstApi.getAppointmentAvailability({
          date: followUp.date,
          dentistName,
          service,
        })
        if (!isMounted) return

        const slots = Array.isArray(response.slots) ? response.slots : []
        setFollowUpSlots(slots)
        setFollowUpAvailabilityMessage(slots.length ? '' : (response.message || 'No available appointments for this date. Please select another date.'))
        setClinicalNoteForm((current) => (
          current.followUp?.time && !slots.includes(current.followUp.time)
            ? { ...current, followUp: { ...current.followUp, time: '' } }
            : current
        ))
      } catch (error) {
        if (!isMounted) return
        setFollowUpSlots([])
        setFollowUpAvailabilityMessage(error.message || 'Unable to load available appointments. Please try again.')
        setClinicalNoteForm((current) => (
          current.followUp?.time
            ? { ...current, followUp: { ...current.followUp, time: '' } }
            : current
        ))
      } finally {
        if (isMounted) setIsLoadingFollowUpSlots(false)
      }
    }, 180)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [
    clinicalNoteForm.followUp,
    clinicalNoteModal?.appointment?.dentistName,
    clinicalNoteModal?.appointment?.service,
  ])

  const calendarData = useMemo(() => {
    const anchor = filters.date
      ? new Date(`${filters.date}T00:00:00`)
      : calendarMonth
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - monthStart.getDay())
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()))
    const grouped = appointments.reduce((groups, appointment) => {
      const key = toDateKey(appointment.appointmentDate)
      if (!key) return groups
      return { ...groups, [key]: [...(groups[key] || []), appointment] }
    }, {})
    const days = []
    const cursor = new Date(gridStart)

    while (cursor <= gridEnd) {
      const key = toDateKey(cursor)
      days.push({
        date: new Date(cursor),
        key,
        inMonth: cursor.getMonth() === monthStart.getMonth(),
        appointments: (grouped[key] || []).sort((left, right) => appointmentTimeMinutes(left.appointmentTime) - appointmentTimeMinutes(right.appointmentTime)),
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    return {
      days,
      title: monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    }
  }, [appointments, calendarMonth, filters.date])

  const summary = useMemo(() => {
    const today = new Date()
    const todayKey = today.toISOString().slice(0, 10)
    const countStatus = (status) => appointments.filter((appointment) => appointment.status === status).length

    return {
      today: appointments.filter((appointment) => appointment.appointmentDate?.slice(0, 10) === todayKey).length,
      pending: countStatus('pending'),
      confirmed: countStatus('confirmed'),
      checkedIn: countStatus('checked_in'),
      completed: countStatus('completed'),
      noShow: countStatus('no_show'),
      cancelled: countStatus('cancelled'),
    }
  }, [appointments])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPagination((current) => ({ ...current, page: 1 }))
  }

  const handleCalendarDayCountClick = (day) => {
    if (!day.appointments.length) return
    if (day.appointments.length === 1) {
      openAppointmentDetails(day.appointments[0])
      return
    }
    setSelectedCalendarDay(day)
  }

  const goToPage = (page) => {
    setPagination((current) => ({
      ...current,
      page: Math.min(Math.max(page, 1), current.pages || 1),
    }))
  }

  const moveCalendarMonth = (offset) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  const showCurrentCalendarMonth = () => {
    setCalendarMonth(new Date())
  }

  const openAppointmentDetails = (appointment) => {
    setSelectedCalendarDay(null)
    setSelectedAppointment(appointment)
  }

  const closeAppointmentDetails = () => {
    setSelectedAppointment(null)
    setQuickActionModal(null)
  }

  const openQuickActionModal = async (type) => {
    if (!selectedAppointment) return

    const titles = {
      profile: 'Patient Profile',
      treatments: 'Treatment Records',
      clinical: 'Clinical Notes',
    }

    if (type === 'profile') {
      setQuickActionModal({ type, title: titles[type], appointment: selectedAppointment, isLoading: false, data: selectedAppointment, error: '' })
      return
    }

    setQuickActionModal({ type, title: titles[type], appointment: selectedAppointment, isLoading: true, data: [], error: '' })

    const patientReference = selectedAppointment.patientSnapshot?.id
      || (typeof selectedAppointment.patient === 'string' ? selectedAppointment.patient : selectedAppointment.patient?._id)
    const patientName = selectedAppointment.patientName?.trim()

    const fetchRecords = (filters) => (
      type === 'treatments'
        ? fdmstApi.getTreatmentRecords(filters)
        : fdmstApi.getClinicalNotes(filters)
    )

    try {
      const scope = isAdmin ? 'all' : 'mine'
      let data = []

      if (!data.length && patientReference) {
        const patientResponse = await fetchRecords({
          patient: patientReference,
          scope,
          limit: 20,
        })
        data = Array.isArray(patientResponse.data) ? patientResponse.data : []
      }

      if (!data.length && patientName) {
        const patientResponse = await fetchRecords({
          patientName,
          scope,
          limit: 20,
        })
        data = Array.isArray(patientResponse.data) ? patientResponse.data : []
      }

      if (!data.length) {
        const directResponse = await fetchRecords({
          appointment: selectedAppointment.id,
          scope,
          limit: 20,
        })
        data = Array.isArray(directResponse.data) ? directResponse.data : []
      }

      setQuickActionModal({ type, title: titles[type], appointment: selectedAppointment, isLoading: false, data, error: '' })
    } catch (error) {
      const message = error.message || `Unable to load ${titles[type].toLowerCase()}.`
      setQuickActionModal({
        type,
        title: titles[type],
        appointment: selectedAppointment,
        isLoading: false,
        data: [],
        error: message === 'Something went wrong. Please try again.' ? '' : message,
      })
    }
  }

  const openClinicalNoteModal = (appointment, note = null) => {
    setClinicalNoteForm({
      ...emptyClinicalNoteForm,
      patientName: note?.patientName || appointment?.patientName || '',
      appointment: note?.appointment?._id || note?.appointment?.id || note?.appointment || appointment?.id || '',
      appointmentDisplay: note?.appointmentSnapshot?.appointmentId || formatAppointmentId(appointment),
      visitDate: note?.visitDate ? new Date(note.visitDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      noteType: note?.noteType || 'Clinical Note',
      clinicalNotes: { ...emptyClinicalNoteForm.clinicalNotes, ...(note?.clinicalNotes || {}) },
    })
    setClinicalNoteModal({ appointment, note })
    setDocumentationPrompt(null)
  }

  const updateClinicalNoteField = (key, value) => {
    setClinicalNoteForm((current) => ({ ...current, [key]: value }))
  }

  const updateClinicalNoteContent = (key, value) => {
    setClinicalNoteForm((current) => ({
      ...current,
      clinicalNotes: { ...current.clinicalNotes, [key]: value },
    }))
  }

  const updateClinicalNoteFollowUp = (key, value) => {
    setClinicalNoteForm((current) => ({
      ...current,
      followUp: { ...(current.followUp || emptyClinicalNoteForm.followUp), [key]: value },
    }))
  }

  const closeClinicalNoteModal = () => {
    if (isSavingClinicalNote) return
    setClinicalNoteModal(null)
    setClinicalNoteForm(emptyClinicalNoteForm)
    setFollowUpSlots([])
    setFollowUpAvailabilityMessage('')
  }

  const saveClinicalNote = async () => {
    if (!clinicalNoteForm.patientName.trim()) {
      toast.error('Patient name is required.')
      return
    }
    if (clinicalNoteForm.followUp?.enabled && (!clinicalNoteForm.followUp.date || !clinicalNoteForm.followUp.time)) {
      toast.error('Follow-up date and time are required.')
      return
    }

    setIsSavingClinicalNote(true)
    try {
      const payload = {
        patientName: clinicalNoteForm.patientName,
        appointment: clinicalNoteForm.appointment,
        visitDate: clinicalNoteForm.visitDate,
        noteType: clinicalNoteForm.noteType,
        clinicalNotes: clinicalNoteForm.clinicalNotes,
        followUp: clinicalNoteForm.followUp,
      }
      const response = clinicalNoteModal?.note
        ? await fdmstApi.updateClinicalNote(clinicalNoteModal.note.id || clinicalNoteModal.note._id, payload)
        : await fdmstApi.createClinicalNote(payload)
      toast.success(response.message || 'Clinical note created.')
      if (response.warning) toast.error(response.warning)
      if (clinicalNoteModal?.note && response.data) {
        setQuickActionModal((current) => current?.type === 'clinical'
          ? {
              ...current,
              data: current.data.map((note) => (
                String(note.id || note._id) === String(response.data.id || response.data._id)
                  ? response.data
                  : note
              )),
            }
          : current)
      }
      setClinicalNoteModal(null)
      setClinicalNoteForm(emptyClinicalNoteForm)
    } catch (error) {
      toast.error(error.message || 'Unable to save clinical note.')
    } finally {
      setIsSavingClinicalNote(false)
    }
  }

  const handleUpdateStatus = async (appointmentId, status) => {
    if (status === 'declined') {
      const appointment = appointments.find((item) => item.id === appointmentId)
      setDeclineTarget(appointment || { id: appointmentId })
      setDeclineReason('')
      setDeclineError('')
      return
    }

    if (status === 'completed' || status === 'no_show') {
      const appointment = appointments.find((item) => item.id === appointmentId)
      setOutcomeTarget({ appointment: appointment || { id: appointmentId }, status })
      return
    }

    setUpdatingId(appointmentId)
    try {
      const response = await fdmstApi.updateAppointmentStatus(appointmentId, { status })
      toast.success(response.message || 'Appointment status updated.')
      setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, ...response.appointment } : appointment))
      setSelectedAppointment((current) => (
        current?.id === appointmentId ? { ...current, ...response.appointment } : current
      ))
    } catch (updateError) {
      toast.error(updateError.message || 'Unable to update appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  const closeOutcomeModal = () => {
    if (updatingId) return
    setOutcomeTarget(null)
  }

  const confirmOutcome = async () => {
    if (!outcomeTarget) return

    const { appointment, status } = outcomeTarget
    setUpdatingId(appointment.id)

    try {
      const payload = { status }
      const response = await fdmstApi.updateAppointmentStatus(appointment.id, payload)
      toast.success(response.message || 'Appointment status updated.', { duration: 5000 })
      if (status === 'completed' && response.treatmentRecordMessage) {
        toast.success(response.treatmentRecordMessage, { duration: 5000 })
      }
      setAppointments((current) => current.map((item) => (
        item.id === appointment.id ? { ...item, ...response.appointment } : item
      )))
      setOutcomeTarget(null)
      if (status === 'completed') {
        setDocumentationPrompt(response.appointment)
      }
      loadAppointments({ silent: true })
    } catch (updateError) {
      toast.error(updateError.message || 'Unable to update appointment.', { duration: 5000 })
    } finally {
      setUpdatingId(null)
    }
  }

  const closeDeclineModal = () => {
    if (updatingId) return
    setDeclineTarget(null)
    setDeclineReason('')
    setDeclineError('')
  }

  const getWorkflowActions = (appointment) => {
    if (!appointment) return []

    const scheduledDate = appointment.appointmentDate ? new Date(appointment.appointmentDate) : null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (scheduledDate && !Number.isNaN(scheduledDate.getTime())) scheduledDate.setHours(0, 0, 0, 0)
    const isFutureDate = scheduledDate && scheduledDate > today

    const actionsByStatus = {
      confirmed: [
        ['checked_in', 'Check In', 'primary'],
        ['no_show', 'No Show', 'danger'],
        ['rescheduled', 'Skip', 'warning'],
      ],
      follow_up: [
        ['checked_in', 'Check In', 'primary'],
        ['no_show', 'No Show', 'danger'],
        ['rescheduled', 'Skip', 'warning'],
      ],
      checked_in: [
        ['in_consultation', 'Start Consultation', 'primary'],
        ['no_show', 'No Show', 'danger'],
        ['rescheduled', 'Skip', 'warning'],
      ],
      in_consultation: [
        ['completed', 'Complete Treatment', 'success'],
        ['rescheduled', 'Skip', 'warning'],
      ],
    }

    return (actionsByStatus[appointment.status] || []).filter(([nextStatus]) => {
      if (isFutureDate && ['checked_in', 'no_show', 'rescheduled'].includes(nextStatus)) return false
      return true
    })
  }

  const confirmDecline = async () => {
    const reason = declineReason.trim()

    if (!reason) {
      setDeclineError('Please enter a reason for declining this appointment.')
      return
    }

    setUpdatingId(declineTarget.id)
    try {
      const response = await fdmstApi.updateAppointmentStatus(declineTarget.id, {
        status: 'declined',
        declineReason: reason,
      })
      toast.success(response.message || 'Appointment declined.')
      setAppointments((current) => current.map((appointment) => (
        appointment.id === declineTarget.id
          ? { ...appointment, status: response.appointment.status, declineReason: response.appointment.declineReason }
          : appointment
      )))
      setSelectedAppointment((current) => (
        current?.id === declineTarget.id ? { ...current, ...response.appointment } : current
      ))
      closeDeclineModal()
    } catch (updateError) {
      setDeclineError(updateError.message || 'Unable to decline appointment.')
      toast.error(updateError.message || 'Unable to decline appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <SummaryCard icon={FaRegCalendarAlt} label="Today" value={isLoading ? '...' : summary.today} />
        <SummaryCard icon={FaUserClock} label="Pending" value={isLoading ? '...' : summary.pending} tone="amber" />
        <SummaryCard icon={FaCalendarAlt} label="Confirmed" value={isLoading ? '...' : summary.confirmed} tone="blue" />
        <SummaryCard icon={FaUserCheck} label="Checked In" value={isLoading ? '...' : summary.checkedIn} tone="emerald" />
        <SummaryCard icon={FaCheckCircle} label="Completed" value={isLoading ? '...' : summary.completed} tone="emerald" />
        <SummaryCard icon={FaUserTimes} label="No Show" value={isLoading ? '...' : summary.noShow} tone="slate" />
        <SummaryCard icon={FaTimes} label="Cancelled" value={isLoading ? '...' : summary.cancelled} tone="red" />
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative block min-w-0 flex-1">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} w-full pl-11`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder={isAdmin ? 'Search patient, appointment ID, service, or dentist...' : 'Search patient, appointment ID, or service...'} />
          </label>
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:w-auto">
            <button type="button" onClick={() => setView('table')} className={`h-10 rounded-lg px-4 text-sm font-bold transition ${view === 'table' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500 hover:text-sky-950'}`}>List View</button>
            <button type="button" onClick={() => setView('calendar')} className={`h-10 rounded-lg px-4 text-sm font-bold transition ${view === 'calendar' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500 hover:text-sky-950'}`}>Calendar View</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select className={`${inputClass} min-w-[11rem] flex-1 xl:flex-none`} value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
            <option value="default">Current and upcoming</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past Appointments</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All Appointments</option>
          </select>
          <select className={`${inputClass} min-w-[14rem] flex-1 xl:flex-none`} value={filters.service} onChange={(event) => updateFilter('service', event.target.value)}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select>
          <select className={`${inputClass} min-w-[11rem] flex-1 xl:flex-none`} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="follow_up">Return Appointment</option><option value="checked_in">Checked In</option><option value="in_consultation">In Consultation</option><option value="completed">Completed</option><option value="no_show">No Show</option><option value="cancelled">Cancelled</option><option value="declined">Declined</option><option value="rescheduled">Rescheduled</option></select>
          <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} title="Exact appointment date" />
          <button type="button" onClick={() => { setFilters({ date: '', dentist: 'all', status: 'all', patient: '', search: '', service: 'all', period: 'default', startDate: '', endDate: '' }); setPagination((current) => ({ ...current, page: 1 })) }} className="inline-flex h-12 min-w-[8rem] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 sm:flex-none">
            <FaTimes className="h-4 w-4" />
            Clear
          </button>
          {filters.period === 'custom' ? (
            <>
              <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} title="Start date" />
              <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} title="End date" />
            </>
          ) : null}
          <select className={`${inputClass} min-w-[9rem] flex-1 xl:flex-none`} value={pagination.limit} onChange={(event) => setPagination((current) => ({ ...current, page: 1, limit: Number(event.target.value) }))}>
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </section>

      {isLoading ? <p className="mt-8 text-sm text-slate-500">Loading appointments...</p> : view === 'table' ? (
        <AppointmentsTable appointments={appointments} showActions={allowApproval} onUpdateStatus={handleUpdateStatus} onRowClick={openAppointmentDetails} onReceiptClick={setReceiptAppointment} onRecordTreatment={openTreatmentModal} updatingId={updatingId} />
      ) : (
        <section className="grid gap-5">
          <div className="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-sky-950">{calendarData.title}</h2>
                <p className="mt-1 text-sm text-slate-500">Click any appointment to view details.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                  <button type="button" onClick={() => moveCalendarMonth(-1)} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Previous</button>
                  <button type="button" onClick={showCurrentCalendarMonth} className="h-9 rounded-lg px-3 text-xs font-bold text-sky-950 transition hover:bg-sky-50">Today</button>
                  <button type="button" onClick={() => moveCalendarMonth(1)} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Next</button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {calendarLegend.map(([status, label]) => (
                <span key={status} className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${calendarStatusStyles[status]}`}>
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[920px] overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-7 bg-slate-50">
                  {weekdayLabels.map((day) => (
                    <div key={day} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500 last:border-r-0">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarData.days.map((day) => (
                    <div key={day.key} className={`min-h-36 border-r border-t border-slate-200 p-2 last:border-r-0 ${day.inMonth ? 'bg-white' : 'bg-slate-50/70'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${day.key === toDateKey(new Date()) ? 'bg-sky-950 text-white' : day.inMonth ? 'text-sky-950' : 'text-slate-400'}`}>{day.date.getDate()}</span>
                        {day.appointments.length ? (
                          <button
                            type="button"
                            onClick={() => handleCalendarDayCountClick(day)}
                            className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.65rem] font-bold text-sky-800 ring-1 ring-sky-100 transition hover:bg-sky-100"
                            title={day.appointments.length === 1 ? 'Open appointment details' : `Show ${day.appointments.length} appointments on this date`}
                          >
                            {day.appointments.length}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {day.appointments.slice(0, 2).map((appointment) => (
                          <button
                            type="button"
                            onClick={() => openAppointmentDetails(appointment)}
                            key={appointment.id}
                            className={`min-w-0 rounded-xl border px-2 py-1.5 text-left text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm ${calendarStatusStyles[appointment.status] || calendarStatusStyles.pending}`}
                            title={`${appointment.appointmentTime} • ${appointment.patientName} • ${formatStatus(appointment.status)}`}
                          >
                            <span className="block truncate">{appointment.appointmentTime} • {appointment.patientName}</span>
                            <span className="block truncate text-[0.65rem] opacity-80">{appointment.service}</span>
                          </button>
                        ))}
                        {day.appointments.length > 2 ? (
                          <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-left text-xs font-bold text-slate-600 transition hover:bg-slate-200" onClick={() => setSelectedCalendarDay(day)}>
                            +{day.appointments.length - 2} more
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedCalendarDay ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-sky-950/20">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Calendar Appointments</p>
                <h2 className="mt-1 text-xl font-semibold text-sky-950">
                  {selectedCalendarDay.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCalendarDay.appointments.length} appointment{selectedCalendarDay.appointments.length === 1 ? '' : 's'} scheduled
                </p>
              </div>
              <button type="button" onClick={() => setSelectedCalendarDay(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close day appointments">
                <FaTimes />
              </button>
            </div>
            <div className="p-5">
              <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
                {selectedCalendarDay.appointments.map((appointment) => (
                  <button
                    type="button"
                    key={appointment.id}
                    onClick={() => openAppointmentDetails(appointment)}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-sky-950">{appointment.appointmentTime} • {appointment.patientName}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{appointment.service} • {appointment.dentistName || 'Any available dentist'}</p>
                    </div>
                    <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusBadgeClass[appointment.status] || statusBadgeClass.pending}`}>
                      {formatStatus(appointment.status)}
                    </span>
                    {appointment.status === 'follow_up' ? (
                      <span className="inline-flex w-fit whitespace-nowrap rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 ring-1 ring-cyan-100">
                        Return appointment
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading ? (
        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing page <span className="font-semibold text-sky-950">{pagination.page}</span> of <span className="font-semibold text-sky-950">{pagination.pages}</span>
            {' '}• <span className="font-semibold text-sky-950">{pagination.total}</span> appointment{pagination.total === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(pagination.pages || 1, 5) }, (_, index) => {
              const start = Math.max(Math.min((pagination.page || 1) - 2, Math.max((pagination.pages || 1) - 4, 1)), 1)
              const pageNumber = start + index
              if (pageNumber > (pagination.pages || 1)) return null
              return (
                <button
                  type="button"
                  key={pageNumber}
                  onClick={() => goToPage(pageNumber)}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition ${
                    pagination.page === pageNumber ? 'bg-sky-950 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {pageNumber}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}

      {selectedAppointment ? (
        <div className="fixed inset-0 z-[70]">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeAppointmentDetails} aria-label="Close appointment details" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{selectedAppointment.appointmentId || `APT-${String(selectedAppointment.id).slice(-6).toUpperCase()}`}</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">{selectedAppointment.patientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedAppointment.service} • {formatAppointmentDate(selectedAppointment.appointmentDate)} at {selectedAppointment.appointmentTime}</p>
                {selectedAppointment.status === 'follow_up' ? (
                  <span className="mt-3 inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-700 ring-1 ring-cyan-100">
                    Return appointment
                  </span>
                ) : null}
              </div>
              <button type="button" onClick={closeAppointmentDetails} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close drawer">
                <FaTimes />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:order-1">
                  <h3 className="font-semibold text-sky-950">Patient Information</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Name: {selectedAppointment.patientName}</p>
                    <p>Age: {calculateAge(selectedAppointment.patientSnapshot?.dateOfBirth)}</p>
                    <p>Gender: {(selectedAppointment.patientSnapshot?.gender || 'Not recorded').replaceAll('_', ' ')}</p>
                    <p>Contact: {selectedAppointment.contactNumber || 'Not provided'}</p>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:order-3 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Medical Information</h3>
                  <div className="mt-3 grid gap-3 text-sm text-slate-600">
                    <p className="rounded-xl bg-white p-3">Allergies<br /><span className="font-semibold text-sky-950">{selectedAppointment.patientSnapshot?.allergies?.length ? selectedAppointment.patientSnapshot.allergies.join(', ') : 'No allergies recorded'}</span></p>
                    <p className="rounded-xl bg-white p-3">Medical Conditions<br /><span className="font-semibold text-sky-950">{selectedAppointment.patientSnapshot?.medicalConditions || 'No medical conditions recorded'}</span></p>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:order-2">
                  <h3 className="font-semibold text-sky-950">Appointment Information</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>ID: {selectedAppointment.appointmentId || `APT-${String(selectedAppointment.id).slice(-6).toUpperCase()}`}</p>
                    <p>Dentist: {selectedAppointment.dentistName || 'Any available dentist'}</p>
                    <p>Status: <span className={`ml-1 inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusBadgeClass[selectedAppointment.status] || statusBadgeClass.pending}`}>{formatAppointmentStatusLabel(selectedAppointment.status)}</span></p>
                    {selectedAppointment.status === 'follow_up' ? (
                      <p>Type: <span className="ml-1 font-semibold text-cyan-700">Return appointment</span></p>
                    ) : null}
                  </div>
                </section>
                <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 md:order-4 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Booked Appointment Time</h3>
                  <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <p className="rounded-xl bg-white p-3 ring-1 ring-sky-100">Date<br /><span className="font-semibold text-sky-950">{formatAppointmentDate(selectedAppointment.appointmentDate)}</span></p>
                    <p className="rounded-xl bg-white p-3 ring-1 ring-sky-100">Time<br /><span className="font-semibold text-sky-950">{selectedAppointment.appointmentTime || 'Not scheduled'}</span></p>
                    <p className="rounded-xl bg-white p-3 ring-1 ring-sky-100">Service<br /><span className="font-semibold text-sky-950">{selectedAppointment.service || 'Not recorded'}</span></p>
                    <p className="rounded-xl bg-white p-3 ring-1 ring-sky-100">Selected Dentist<br /><span className="font-semibold text-sky-950">{selectedAppointment.dentistName || 'Any available dentist'}</span></p>
                  </div>
                </section>
                {selectedAppointment.reason ? (
                  <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 md:order-5 md:col-span-2">
                    <h3 className="font-semibold text-sky-950">Reason for Visit by Patient</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{selectedAppointment.reason}</p>
                  </section>
                ) : null}
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:order-6 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Quick Actions</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <button type="button" onClick={() => openQuickActionModal('profile')} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 hover:bg-sky-50">View Patient Profile</button>
                    <button type="button" onClick={() => openQuickActionModal('clinical')} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 hover:bg-sky-50">View Clinical Notes</button>
                    <button type="button" onClick={() => setReceiptAppointment(selectedAppointment)} className="h-11 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 transition inline-flex items-center justify-center gap-2"><FaFileInvoiceDollar className="text-emerald-700" /> Create / View Receipt</button>
                    {['confirmed', 'follow_up', 'checked_in', 'in_consultation', 'completed'].includes(selectedAppointment.status) ? (
                      <button
                        type="button"
                        onClick={() => openTreatmentModal(selectedAppointment)}
                        className={`h-11 rounded-xl border px-3 text-sm font-bold transition inline-flex items-center justify-center gap-2 ${
                          selectedAppointment.hasTreatmentRecord
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
                            : 'border-violet-200 bg-violet-50/70 text-violet-900 hover:bg-violet-100'
                        }`}
                      >
                        <FaTooth className={selectedAppointment.hasTreatmentRecord ? 'text-emerald-600' : 'text-violet-700'} />
                        {selectedAppointment.hasTreatmentRecord ? 'Treatment Recorded' : 'Record Treatment'}
                      </button>
                    ) : null}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:order-7 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Appointment Timeline</h3>
                  <div className="mt-4 grid gap-3">
                    {[
                      { action: 'Appointment Created', status: 'pending', recordedAt: selectedAppointment.requestSubmittedAt || selectedAppointment.createdAt },
                      ...(selectedAppointment.timeline || []),
                    ].filter((item) => item.recordedAt || item.action).map((item, index) => (
                      <div key={`${item.action}-${item.recordedAt || index}`} className="flex gap-3">
                        <span className="mt-1 flex h-3 w-3 shrink-0 rounded-full bg-sky-700" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-sky-950">{item.action || `Appointment ${formatStatus(item.status)}`}</p>
                          <p className="text-xs text-slate-500">{item.recordedAt ? new Date(item.recordedAt).toLocaleString() : 'Timestamp unavailable'}{item.performedByEmail && item.action !== 'Appointment Notes Added' ? ` • ${item.performedByEmail}` : ''}</p>
                          {item.note ? <p className="mt-1 text-sm text-slate-600">{item.note}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                {allowApproval && selectedAppointment.status === 'pending' ? (
                  <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:order-9 md:col-span-2">
                    <h3 className="font-semibold text-sky-950">Appointment Review</h3>
                    <p className="mt-1 text-sm text-slate-500">Review the patient details and reason for visit before approving or declining this request.</p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selectedAppointment.id, 'declined')}
                        disabled={updatingId === selectedAppointment.id}
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-red-50 px-5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selectedAppointment.id, 'confirmed')}
                        disabled={updatingId === selectedAppointment.id}
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === selectedAppointment.id ? 'Saving...' : 'Approve'}
                      </button>
                    </div>
                  </section>
                ) : null}
                {allowApproval && getWorkflowActions(selectedAppointment).length ? (
                  <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:order-9 md:col-span-2">
                    <h3 className="font-semibold text-sky-950">Workflow Actions</h3>
                    <p className="mt-1 text-sm text-slate-500">Update this appointment based on the patient visit progress.</p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      {getWorkflowActions(selectedAppointment).map(([nextStatus, label, tone]) => (
                        <button
                          type="button"
                          key={nextStatus}
                          onClick={() => handleUpdateStatus(selectedAppointment.id, nextStatus)}
                          disabled={updatingId === selectedAppointment.id}
                          className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            tone === 'success'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : tone === 'danger'
                                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                : tone === 'warning'
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'bg-sky-950 text-white hover:bg-slate-900'
                          }`}
                        >
                          {updatingId === selectedAppointment.id ? 'Saving...' : label}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {quickActionModal ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className={`max-h-[88vh] w-full ${quickActionModal.type === 'treatments' ? 'max-w-4xl' : 'max-w-2xl'} overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-sky-950/20`}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Appointment Data</p>
                <h2 className="mt-1 text-xl font-semibold text-sky-950">{quickActionModal.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                {quickActionModal.type === 'clinical' ? (
                  <button
                    type="button"
                    onClick={() => openClinicalNoteModal(quickActionModal.appointment)}
                    className="h-10 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900"
                  >
                    Add Clinical Note
                  </button>
                ) : null}
                <button type="button" onClick={() => setQuickActionModal(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close quick action modal">
                  <FaTimes />
                </button>
              </div>
            </div>
            <div className="max-h-[76vh] overflow-y-auto p-5">
              {quickActionModal.isLoading ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Loading data...</p>
              ) : quickActionModal.error ? (
                <p className="rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">{quickActionModal.error}</p>
              ) : quickActionModal.type === 'profile' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <h3 className="font-semibold text-sky-950">Personal Information</h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <p>Name: <span className="font-semibold text-sky-950">{quickActionModal.appointment?.patientName || 'Not recorded'}</span> <span className="text-slate-400">•</span> Patient ID: <span className="font-semibold text-sky-950">{getRecordPatientId(null, quickActionModal.appointment)}</span></p>
                      <p>Age: <span className="font-semibold text-sky-950">{calculateAge(quickActionModal.appointment?.patientSnapshot?.dateOfBirth)}</span></p>
                      <p>Gender: <span className="font-semibold text-sky-950">{(quickActionModal.appointment?.patientSnapshot?.gender || 'Not recorded').replaceAll('_', ' ')}</span></p>
                      <p>Contact: <span className="font-semibold text-sky-950">{quickActionModal.appointment?.contactNumber || 'Not provided'}</span></p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <h3 className="font-semibold text-sky-950">Medical Information</h3>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <p>Allergies: <span className="font-semibold text-sky-950">{quickActionModal.appointment?.patientSnapshot?.allergies?.length ? quickActionModal.appointment.patientSnapshot.allergies.join(', ') : 'No allergies recorded'}</span></p>
                      <p>Conditions: <span className="font-semibold text-sky-950">{quickActionModal.appointment?.patientSnapshot?.medicalConditions || 'No medical conditions recorded'}</span></p>
                    </div>
                  </div>
                </div>
              ) : quickActionModal.type === 'treatments' ? (
                <div className="grid gap-4">
                  {/* Dental Chart showing treatment status and tooth procedures */}
                  <DentalChart
                    records={Array.isArray(quickActionModal.data) ? quickActionModal.data : []}
                    initialToothColors={Array.isArray(quickActionModal.data) && quickActionModal.data[0]?.toothColorMap ? quickActionModal.data[0].toothColorMap : null}
                    interactive={false}
                    title={`Patient Dental Chart — ${quickActionModal.appointment?.patientName || 'Patient'}`}
                  />

                  {Array.isArray(quickActionModal.data) && quickActionModal.data.length ? quickActionModal.data.map((record, index) => (
                    <article key={record.id || index} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-sky-950">{record.procedure || record.servicePerformed || 'Dental Treatment'}</h3>
                            {record.toothNumber ? (
                              <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
                                Tooth: #{record.toothNumber}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {record.patientName || quickActionModal.appointment?.patientName || 'Patient not recorded'} • {getRecordPatientId(record, quickActionModal.appointment)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(record.visitDate || record.createdAt)} • {record.createdByName || record.dentistName || 'Provider not recorded'}</p>
                        </div>
                        <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">{formatRecordStatus(record.treatmentStatus)}</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Appointment Data</h4>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <p>Date: <span className="font-semibold text-sky-950">{formatAppointmentDate(record.appointmentSnapshot?.appointmentDate || record.visitDate)}</span></p>
                            <p>Time: <span className="font-semibold text-sky-950">{record.appointmentSnapshot?.appointmentTime || 'Not recorded'}</span></p>
                            <p>Duration: <span className="font-semibold text-sky-950">{record.appointmentSnapshot?.estimatedDuration ? `${record.appointmentSnapshot.estimatedDuration} minutes` : 'Not recorded'}</span></p>
                            <p>Final Price: <span className="font-semibold text-sky-950">{Number.isFinite(Number(record.appointmentSnapshot?.finalPrice)) ? `₱${Number(record.appointmentSnapshot.finalPrice).toLocaleString()}` : 'Not recorded'}</span></p>
                            <p>Promo Code: <span className="font-semibold text-sky-950">{record.appointmentSnapshot?.promoCode || 'None'}</span></p>
                          </div>
                        </div>
                        {record.toothNumber ? (
                          <p>Treated Teeth: <span className="font-semibold text-sky-950">#{record.toothNumber}</span></p>
                        ) : null}
                        <p>Diagnosis: <span className="font-semibold text-sky-950">{record.diagnosis || 'Not recorded'}</span></p>
                        <p>Treatment: <span className="font-semibold text-sky-950">{record.treatmentPerformed || 'Not recorded'}</span></p>
                        <p>Notes: <span className="font-semibold text-sky-950">{record.notes || record.recommendations || 'No notes recorded'}</span></p>
                      </div>
                    </article>
                  )) : (
                    <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No treatment records found for this patient.</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  {Array.isArray(quickActionModal.data) && quickActionModal.data.length ? quickActionModal.data.map((note, index) => (
                    <article key={note.id || index} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-sky-950">{note.noteType || 'Clinical Note'}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {note.patientName || quickActionModal.appointment?.patientName || 'Patient not recorded'} • {getRecordPatientId(note, quickActionModal.appointment)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(note.visitDate || note.createdAt)} • {note.createdByName || note.dentistName || 'Provider not recorded'}</p>
                        </div>
                        {String(note.createdBy?.id || note.createdBy?._id || note.createdBy || '') === String(currentUser?.id || currentUser?._id || '')
                          || String(note.createdByEmail || '').toLowerCase() === String(currentUser?.email || '').toLowerCase() ? (
                            <button
                              type="button"
                              onClick={() => openClinicalNoteModal(quickActionModal.appointment, note)}
                              className="h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-bold text-sky-950 hover:bg-sky-50"
                            >
                              Edit Note
                            </button>
                          ) : null}
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <p>Observation: <span className="font-semibold text-sky-950">{note.clinicalNotes?.observation || 'Not recorded'}</span></p>
                        <p>Assessment: <span className="font-semibold text-sky-950">{note.clinicalNotes?.assessment || 'Not recorded'}</span></p>
                        <p>Recommendations: <span className="font-semibold text-sky-950">{note.clinicalNotes?.recommendations || 'Not recorded'}</span></p>
                        {note.clinicalFollowUp?.enabled ? (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                            <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Return Appointment Booking</h4>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <p>Appointment ID: <span className="font-semibold text-sky-950">{note.clinicalFollowUp.appointmentId || formatAppointmentId(note.clinicalFollowUp.appointment) || 'Not recorded'}</span></p>
                              <p>Date: <span className="font-semibold text-sky-950">{note.clinicalFollowUp.date ? formatDate(note.clinicalFollowUp.date) : 'Not recorded'}</span></p>
                              <p>Time: <span className="font-semibold text-sky-950">{note.clinicalFollowUp.time || 'Not recorded'}</span></p>
                              <p>Reason: <span className="font-semibold text-sky-950">{note.clinicalFollowUp.reason || 'Return appointment recommended.'}</span></p>
                            </div>
                          </div>
                        ) : null}
                        <p>Additional Notes: <span className="font-semibold text-sky-950">{note.clinicalNotes?.additionalNotes || 'Not recorded'}</span></p>
                      </div>
                    </article>
                  )) : (
                    <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No clinical notes found for this patient.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {declineTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Decline Appointment</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Add a clear reason before declining {declineTarget.patientName ? `${declineTarget.patientName}'s` : 'this'} appointment.
              </p>
            </div>

            <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-600">
              Reason
              <textarea
                className={`${inputClass} min-h-28 resize-none py-3 leading-6`}
                value={declineReason}
                onChange={(event) => {
                  setDeclineReason(event.target.value)
                  setDeclineError('')
                }}
                placeholder="Example: Dentist is unavailable for the selected schedule."
                maxLength={300}
              />
            </label>
            {declineError ? <p className="mt-2 text-sm font-medium text-red-600">{declineError}</p> : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeclineModal}
                disabled={updatingId === declineTarget.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDecline}
                disabled={updatingId === declineTarget.id}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingId === declineTarget.id ? 'Declining...' : 'Decline Appointment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {outcomeTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <h2 className="text-xl font-semibold text-sky-950">
              {outcomeTarget.status === 'completed' ? 'Confirm Appointment Completion' : 'Confirm No-Show Status'}
            </h2>
            {outcomeTarget.status === 'completed' ? (
              <>
                <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-medium leading-6 text-sky-800">
                  <p>
                    You are about to mark {outcomeTarget.appointment.patientName ? `${outcomeTarget.appointment.patientName}'s` : "this patient's"} appointment as Completed.
                  </p>
                  <p className="mt-3">
                    This action confirms that the scheduled dental service has been successfully performed. The appointment will be recorded as completed, the patient will be notified, and an official Treatment Record will be created automatically from the appointment details.
                  </p>
                  <p className="mt-3">
                    Related Analytics, Reports, My Records, and the appointment activity history will also be updated. Private Clinical Notes remain separate and can be added manually after completion.
                  </p>
                  <p className="mt-3">
                    This action cannot be undone without administrative intervention.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">
                <p>
                  You are about to mark {outcomeTarget.appointment.patientName ? `${outcomeTarget.appointment.patientName}'s` : "this patient's"} appointment as No Show.
                </p>
                <p className="mt-3">
                  This action confirms that the patient did not attend the scheduled appointment. The appointment status will be updated, the patient will be notified, and the record will be included in the clinic's attendance statistics, Analytics, and Reports. No estimated revenue will be recorded for this appointment.
                </p>
                <p className="mt-3">
                  This action cannot be undone without administrative intervention.
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeOutcomeModal}
                disabled={updatingId === outcomeTarget.appointment.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOutcome}
                disabled={updatingId === outcomeTarget.appointment.id}
                className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  outcomeTarget.status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {updatingId === outcomeTarget.appointment.id ? 'Saving...' : outcomeTarget.status === 'completed' ? 'Completed' : 'No Show'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {documentationPrompt ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <FaCheckCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Appointment Completed</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Would you like to complete the patient's clinical documentation?</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => { setDocumentationPrompt(null); openTreatmentModal(documentationPrompt); }}
                className={`h-12 rounded-xl px-5 text-sm font-bold text-white inline-flex items-center justify-center gap-2 ${
                  documentationPrompt.hasTreatmentRecord
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                <FaTooth />
                {documentationPrompt.hasTreatmentRecord ? 'Treatment Recorded (View/Edit)' : 'Record Treatment'}
              </button>
              {!isStaff ? (
                <button type="button" onClick={() => openClinicalNoteModal(documentationPrompt)} className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900">Add Clinical Note</button>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Clinical documentation is restricted to the Admin account.</p>
              )}
              <button type="button" onClick={() => setDocumentationPrompt(null)} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50">Finish</button>
            </div>
          </div>
        </div>
      ) : null}

      {clinicalNoteModal ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={closeClinicalNoteModal}>
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[1.5rem] bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{clinicalNoteModal.note ? 'Edit Clinical Note' : 'New Clinical Note'}</p>
                <h2 className="mt-1 text-xl font-bold text-sky-950">{clinicalNoteForm.patientName || 'Clinical Note'}</h2>
                <p className="mt-1 text-sm text-slate-500">Private internal documentation. Patients cannot view this note.</p>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={closeClinicalNoteModal} aria-label="Close clinical note modal">
                <FaTimes />
              </button>
            </div>

            <div className="grid gap-5 p-6 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-slate-600">
                Patient Name
                <input className={inputClass} value={clinicalNoteForm.patientName} disabled onChange={(event) => updateClinicalNoteField('patientName', event.target.value)} placeholder="Enter patient name" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-600">
                Appointment ID
                <input className={inputClass} value={clinicalNoteForm.appointmentDisplay || formatAppointmentId(clinicalNoteForm.appointment)} disabled onChange={(event) => updateClinicalNoteField('appointment', event.target.value)} placeholder="Optional appointment ID" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-600">
                Date
                <input className={inputClass} type="date" value={clinicalNoteForm.visitDate} onChange={(event) => updateClinicalNoteField('visitDate', event.target.value)} />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
                Observations
                <textarea className={`${inputClass} min-h-24 py-3`} value={clinicalNoteForm.clinicalNotes.observation} onChange={(event) => updateClinicalNoteContent('observation', event.target.value)} placeholder="Document observations from the visit..." />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
                Assessment
                <textarea className={`${inputClass} min-h-24 py-3`} value={clinicalNoteForm.clinicalNotes.assessment} onChange={(event) => updateClinicalNoteContent('assessment', event.target.value)} placeholder="Document clinical assessment..." />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
                Recommendations
                <textarea className={`${inputClass} min-h-24 py-3`} value={clinicalNoteForm.clinicalNotes.recommendations} onChange={(event) => updateClinicalNoteContent('recommendations', event.target.value)} placeholder="Document recommendations or follow-up instructions..." />
              </label>
              {!clinicalNoteModal.note ? <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 lg:col-span-3">
                <label className="flex items-center gap-3 text-sm font-bold text-sky-950">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-sky-300 text-sky-700 focus:ring-sky-200"
                    checked={Boolean(clinicalNoteForm.followUp?.enabled)}
                    onChange={(event) => updateClinicalNoteFollowUp('enabled', event.target.checked)}
                  />
                  Book return appointment and notify patient
                </label>
                {clinicalNoteForm.followUp?.enabled ? (
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch">
                    <div className="grid gap-3 md:w-64 md:shrink-0">
                      <label className="grid gap-2 text-sm font-bold text-slate-600">
                        Return Date
                        <span className="relative block">
                          <FaRegCalendarAlt className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            className={`${inputClass} pl-11`}
                            type="date"
                            min={addDaysKey(0)}
                            max={addDaysKey(14)}
                            value={clinicalNoteForm.followUp?.date || ''}
                            onChange={(event) => updateClinicalNoteFollowUp('date', event.target.value)}
                          />
                        </span>
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-600">
                        Time
                        <span className="relative block">
                          <FaUserClock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <select
                            className={`${inputClass} pl-11`}
                            value={clinicalNoteForm.followUp?.time || ''}
                            onChange={(event) => updateClinicalNoteFollowUp('time', event.target.value)}
                            disabled={!clinicalNoteForm.followUp?.date || isLoadingFollowUpSlots || !followUpSlots.length}
                          >
                            <option value="">
                              {isLoadingFollowUpSlots ? 'Loading available appointments...' : 'Select a time'}
                            </option>
                            {followUpSlots.map((slot) => (
                              <option key={slot} value={slot}>{slot}</option>
                            ))}
                          </select>
                        </span>
                      </label>
                    </div>
                    <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold text-slate-600">
                      Reason
                      <textarea className={`${inputClass} min-h-[7.75rem] py-3`} value={clinicalNoteForm.followUp?.reason || ''} onChange={(event) => updateClinicalNoteFollowUp('reason', event.target.value)} placeholder="Return appointment reason" />
                    </label>
                    {followUpAvailabilityMessage && clinicalNoteForm.followUp?.date ? (
                      <div className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-500 md:basis-full">
                        {followUpAvailabilityMessage}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section> : (
                <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900 lg:col-span-3">
                  Editing this note will not change an existing return appointment booking.
                </p>
              )}
              <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
                Additional Notes
                <textarea className={`${inputClass} min-h-24 py-3`} value={clinicalNoteForm.clinicalNotes.additionalNotes} onChange={(event) => updateClinicalNoteContent('additionalNotes', event.target.value)} placeholder="Internal reminders or supporting context..." />
              </label>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
              <button type="button" className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60" disabled={isSavingClinicalNote} onClick={closeClinicalNoteModal}>Cancel</button>
              <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60" disabled={isSavingClinicalNote} onClick={saveClinicalNote}>
                {isSavingClinicalNote ? 'Saving...' : clinicalNoteModal.note ? 'Save Changes' : 'Create Clinical Note'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {receiptAppointment ? (
        <AppointmentReceiptModal
          appointment={receiptAppointment}
          onClose={() => setReceiptAppointment(null)}
        />
      ) : null}

      {treatmentModal ? (
        <RecordModal
          mode={treatmentModal.mode}
          form={treatmentForm}
          setForm={setTreatmentForm}
          onClose={() => { setTreatmentModal(null); setTreatmentForm(emptyTreatmentForm); }}
          onSubmit={saveTreatmentRecord}
          isSaving={isSavingTreatment}
          canEdit={true}
          xrayOnlyUpload
          canEditPatientAllergies={isAdmin}
        />
      ) : null}
    </main>
  )
}

export default AppointmentsPage
