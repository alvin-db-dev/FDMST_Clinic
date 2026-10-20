import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaChevronDown,
  FaCloudUploadAlt,
  FaClock,
  FaEdit,
  FaEye,
  FaFileAlt,
  FaFileExport,
  FaImage,
  FaNotesMedical,
  FaPaperclip,
  FaPlus,
  FaSearch,
  FaTrash,
  FaTimes,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import DateRangeFilter from '../../components/DateRangeFilter.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'
import { uploadClinicalFile } from '../../utils/imageUpload.js'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const emptyForm = {
  patientName: '',
  appointment: '',
  appointmentDisplay: '',
  service: '',
  dentistName: '',
  visitDate: new Date().toISOString().slice(0, 10),
  noteType: 'Clinical Note',
  clinicalNotes: {
    observation: '',
    assessment: '',
    recommendations: '',
    additionalNotes: '',
  },
  attachments: [],
  followUp: {
    enabled: false,
    date: '',
    time: '',
    reason: '',
  },
  clinicalFollowUp: null,
}

const canEditNote = (note, user) => {
  const userId = String(user?.id || '')
  const email = String(user?.email || '').toLowerCase()
  return String(note?.createdBy || '') === userId || String(note?.createdByEmail || '').toLowerCase() === email
}

const formatAppointmentId = (value) => {
  if (!value) return ''
  const raw = typeof value === 'object' ? value.appointmentId || value.id || value._id : value
  if (!raw) return ''
  const text = String(raw)
  return text.startsWith('APT-') ? text : `APT-${text.slice(-6).toUpperCase()}`
}

const toDateKey = (value) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDaysKey = (days) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

const normalizePatientName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

const appointmentTimestamp = (appointment) => {
  const parsed = new Date(appointment?.appointmentDate || appointment?.createdAt || 0)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function NoteModal({
  mode,
  note,
  form,
  setForm,
  onClose,
  onSubmit,
  isSaving,
  canEdit,
  followUpSlots = [],
  isLoadingFollowUpSlots = false,
  followUpAvailabilityMessage = '',
  isAdmin = false,
  pendingAttachments = [],
  onAddAttachments,
  onRemovePendingAttachment,
  isFindingAppointment = false,
  appointmentLookupMessage = '',
  onPatientNameChange,
}) {
  const isReadonly = mode === 'view' || !canEdit
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const updateNote = (key, value) => setForm((current) => ({
    ...current,
    clinicalNotes: { ...current.clinicalNotes, [key]: value },
  }))
  const updateFollowUp = (key, value) => setForm((current) => ({
    ...current,
    followUp: { ...(current.followUp || emptyForm.followUp), [key]: value },
  }))
  const xrayInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const removeStoredAttachment = (attachmentId) => setForm((current) => ({
    ...current,
    attachments: (current.attachments || []).filter((attachment) => String(attachment.id || attachment._id) !== String(attachmentId)),
  }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[1.5rem] bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{mode === 'create' ? 'New Note Clinical Note' : mode === 'edit' ? 'Edit Note' : 'Clinical Note Details'}</p>
            <h2 className="mt-1 text-xl font-bold text-sky-950">{form.patientName || note?.patientName || 'Clinical Note'}</h2>
            <p className="mt-1 text-sm text-slate-500">Private internal documentation. Patients cannot view this note.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Patient Name
            <input className={inputClass} value={form.patientName} disabled={mode !== 'create'} onChange={(event) => onPatientNameChange(event.target.value)} placeholder="Enter patient name" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Appointment ID
            <input className={inputClass} value={form.appointmentDisplay || formatAppointmentId(form.appointment)} disabled placeholder={isFindingAppointment ? 'Finding appointment...' : 'Auto-filled from patient record'} />
            {mode === 'create' && appointmentLookupMessage ? <span className={`text-xs font-semibold ${form.appointment ? 'text-emerald-600' : 'text-slate-400'}`}>{appointmentLookupMessage}</span> : null}
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Date
            <input className={inputClass} type="date" value={form.visitDate} disabled={isReadonly} onChange={(event) => update('visitDate', event.target.value)} />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Observations
            <textarea className={textareaClass} value={form.clinicalNotes.observation} disabled={isReadonly} onChange={(event) => updateNote('observation', event.target.value)} placeholder="Document observations from the visit..." />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Assessment
            <textarea className={textareaClass} value={form.clinicalNotes.assessment} disabled={isReadonly} onChange={(event) => updateNote('assessment', event.target.value)} placeholder="Document clinical assessment..." />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Recommendations
            <textarea className={textareaClass} value={form.clinicalNotes.recommendations} disabled={isReadonly} onChange={(event) => updateNote('recommendations', event.target.value)} placeholder="Document recommendations or follow-up instructions..." />
          </label>
          {mode === 'view' && form.clinicalFollowUp?.enabled ? (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">Follow-up Booking</h3>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">Created from this clinical recommendation.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 shadow-sm">
                  {form.clinicalFollowUp.status === 'not_scheduled' ? 'Not Scheduled' : 'Booked'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Appointment ID</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{form.clinicalFollowUp.appointmentId || formatAppointmentId(form.clinicalFollowUp.appointment) || 'Not recorded'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Date</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{form.clinicalFollowUp.date ? formatDate(form.clinicalFollowUp.date) : 'Not recorded'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Time</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{form.clinicalFollowUp.time || 'Not recorded'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Reason</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{form.clinicalFollowUp.reason || 'Follow-up appointment recommended.'}</p>
                </div>
              </div>
            </section>
          ) : null}
          {mode !== 'view' ? (
            <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 lg:col-span-3">
              <label className="flex items-center gap-3 text-sm font-bold text-sky-950">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-sky-300 text-sky-700 focus:ring-sky-200"
                  checked={Boolean(form.followUp?.enabled)}
                  onChange={(event) => updateFollowUp('enabled', event.target.checked)}
                />
                Book follow-up appointment and notify patient
              </label>
              {form.followUp?.enabled ? (
                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch">
                  <div className="grid gap-3 md:w-64 md:shrink-0">
                    <label className="grid gap-2 text-sm font-bold text-slate-600">
                      Follow-up Date
                      <span className="relative block">
                        <FaCalendarAlt className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className={`${inputClass} pl-11`}
                          type="date"
                          min={addDaysKey(0)}
                          max={addDaysKey(14)}
                          value={form.followUp?.date || ''}
                          onChange={(event) => updateFollowUp('date', event.target.value)}
                        />
                      </span>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-slate-600">
                      Time
                      <span className="relative block">
                        <FaClock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          className={`${inputClass} pl-11`}
                          value={form.followUp?.time || ''}
                          onChange={(event) => updateFollowUp('time', event.target.value)}
                          disabled={!form.followUp?.date || isLoadingFollowUpSlots || !followUpSlots.length}
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
                    <textarea className={`${textareaClass} min-h-[7.75rem]`} value={form.followUp?.reason || ''} onChange={(event) => updateFollowUp('reason', event.target.value)} placeholder="Follow-up reason" />
                  </label>
                  {followUpAvailabilityMessage && form.followUp?.date ? (
                    <div className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-slate-500 md:basis-full">
                      {followUpAvailabilityMessage}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          <label className="grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Additional Notes
            <textarea className={textareaClass} value={form.clinicalNotes.additionalNotes} disabled={isReadonly} onChange={(event) => updateNote('additionalNotes', event.target.value)} placeholder="Internal reminders or supporting context..." />
          </label>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-sky-950">
                  <FaPaperclip className="text-sky-700" /> X-rays and Files
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">Secure clinical attachments. JPG, PNG, WebP, or PDF, up to 5 MB each.</p>
              </div>
              {!isReadonly && isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <input ref={xrayInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { onAddAttachments(event.target.files, 'xray'); event.target.value = '' }} />
                  <input ref={fileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => { onAddAttachments(event.target.files, 'file'); event.target.value = '' }} />
                  <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-xs font-bold text-sky-800 hover:bg-sky-50" onClick={() => xrayInputRef.current?.click()}>
                    <FaImage /> Add X-ray Photo
                  </button>
                  <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-950 px-4 text-xs font-bold text-white hover:bg-sky-900" onClick={() => fileInputRef.current?.click()}>
                    <FaCloudUploadAlt /> Add File
                  </button>
                </div>
              ) : null}
            </div>

            {(form.attachments || []).length || pendingAttachments.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(form.attachments || []).map((attachment) => {
                  const attachmentId = attachment.id || attachment._id
                  const isImage = String(attachment.mimeType || '').startsWith('image/')
                  return (
                    <article key={attachmentId || attachment.path} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      {isImage && attachment.url ? <img className="h-12 w-12 shrink-0 rounded-lg object-cover" src={attachment.url} alt="Clinical attachment" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"><FaFileAlt /></span>}
                      <div className="min-w-0 flex-1">
                        {attachment.url ? <a className="block truncate text-xs font-bold text-sky-900 hover:underline" href={attachment.url} target="_blank" rel="noreferrer">{attachment.name || 'Clinical attachment'}</a> : <p className="truncate text-xs font-bold text-slate-700">{attachment.name || 'Clinical attachment'}</p>}
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{attachment.category === 'xray' ? 'X-ray photo' : 'File'}</p>
                      </div>
                      {!isReadonly && isAdmin ? <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" title="Remove attachment" onClick={() => removeStoredAttachment(attachmentId)}><FaTrash /></button> : null}
                    </article>
                  )
                })}
                {pendingAttachments.map((attachment) => (
                  <article key={attachment.localId} className="flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-3">
                    {attachment.previewUrl ? <img className="h-12 w-12 shrink-0 rounded-lg object-cover" src={attachment.previewUrl} alt="Selected X-ray preview" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-sky-700"><FaFileAlt /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-sky-950">{attachment.file.name}</p>
                      <p className="mt-1 text-[11px] font-semibold text-sky-700">Ready to upload</p>
                    </div>
                    <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" title="Remove selected file" onClick={() => onRemovePendingAttachment(attachment.localId)}><FaTrash /></button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-400">
                {isAdmin && !isReadonly ? 'No files selected.' : 'No X-rays or files attached.'}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
          <button type="button" className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>Cancel</button>
          {mode !== 'view' && canEdit ? (
            <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60" disabled={isSaving || (mode === 'create' && isFindingAppointment)} onClick={onSubmit}>
              {isSaving ? 'Saving...' : mode === 'create' && isFindingAppointment ? 'Finding Appointment...' : mode === 'create' ? 'Create Clinical Note' : 'Save Changes'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function StaffClinicalNotesPage() {
  const toast = useToast()
  const location = useLocation()
  const currentUser = authStorage.getUser()
  const isAdmin = currentUser?.role === 'admin'
  const currentUserName = currentUser?.name || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim()
  const appointmentPrefillRef = useRef('')
  const [notes, setNotes] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [providerOptions, setProviderOptions] = useState([])
  const [followUpSlots, setFollowUpSlots] = useState([])
  const [followUpAvailabilityMessage, setFollowUpAvailabilityMessage] = useState('')
  const [isLoadingFollowUpSlots, setIsLoadingFollowUpSlots] = useState(false)
  const [isFindingAppointment, setIsFindingAppointment] = useState(false)
  const [appointmentLookupMessage, setAppointmentLookupMessage] = useState('')
  const [filters, setFilters] = useState({
    scope: 'mine',
    search: '',
    provider: '',
    appointment: '',
    startDate: '',
    endDate: '',
    page: 1,
  })
  const followUpEnabled = Boolean(form.followUp?.enabled)
  const followUpDate = form.followUp?.date || ''
  const appointmentPrefillId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('appointment') || ''
  }, [location.search])

  const loadNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fdmstApi.getClinicalNotes({
        ...filters,
        scope: isAdmin ? filters.scope : 'mine',
        limit: 10,
      })
      setNotes(response.data || [])
      setPagination(response.pagination || { page: 1, pages: 1, total: 0 })
    } catch (error) {
      toast.error(error.message || 'Unable to load clinical notes.')
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }, [filters, isAdmin, toast])

  useEffect(() => {
    const timer = window.setTimeout(loadNotes, 0)
    return () => window.clearTimeout(timer)
  }, [loadNotes])

  useEffect(() => {
    let isMounted = true
    const timer = window.setTimeout(async () => {
      if (!followUpEnabled || !followUpDate || !form.service) {
        setFollowUpSlots([])
        setFollowUpAvailabilityMessage('')
        setIsLoadingFollowUpSlots(false)
        return
      }

      setIsLoadingFollowUpSlots(true)
      setFollowUpAvailabilityMessage('Loading available appointments...')
      try {
        const response = await fdmstApi.getAppointmentAvailability({
          date: followUpDate,
          dentistName: form.dentistName,
          service: form.service,
        })
        if (!isMounted) return

        const slots = Array.isArray(response.slots) ? response.slots : []
        setFollowUpSlots(slots)
        setFollowUpAvailabilityMessage(slots.length ? '' : (response.message || 'No available appointments for this date. Please select another date.'))
        setForm((current) => (
          current.followUp?.time && !slots.includes(current.followUp.time)
            ? { ...current, followUp: { ...current.followUp, time: '' } }
            : current
        ))
      } catch (error) {
        if (!isMounted) return
        setFollowUpSlots([])
        setFollowUpAvailabilityMessage(error.message || 'Unable to load available appointments. Please try again.')
        setForm((current) => (
          current.followUp?.time
            ? { ...current, followUp: { ...current.followUp, time: '' } }
            : current
        ))
      } finally {
        if (isMounted) setIsLoadingFollowUpSlots(false)
      }
    }, followUpEnabled && followUpDate && form.service ? 180 : 0)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [followUpDate, followUpEnabled, form.dentistName, form.service])

  useEffect(() => {
    if (modal?.mode !== 'create' || form.appointment) return

    const patientName = form.patientName.trim()
    let isMounted = true
    const timer = window.setTimeout(async () => {
      if (patientName.length < 2) {
        setIsFindingAppointment(false)
        setAppointmentLookupMessage(patientName ? 'Enter the full patient name to find an appointment.' : '')
        return
      }

      setIsFindingAppointment(true)
      setAppointmentLookupMessage('Finding the patient appointment...')
      try {
        const response = await fdmstApi.getAppointments({ period: 'all', search: patientName, limit: 100 })
        if (!isMounted) return
        const normalizedName = normalizePatientName(patientName)
        const exactMatches = (response.data || [])
          .filter((appointment) => normalizePatientName(appointment.patientName) === normalizedName)
          .sort((left, right) => appointmentTimestamp(right) - appointmentTimestamp(left))
        const appointment = exactMatches.find((item) => item.status === 'completed') || exactMatches[0]

        if (!appointment) {
          setAppointmentLookupMessage('No appointment record found for this exact patient name.')
          return
        }

        setForm((current) => {
          if (normalizePatientName(current.patientName) !== normalizedName || current.appointment) return current
          return {
            ...current,
            appointment: appointment.id,
            appointmentDisplay: appointment.appointmentId || formatAppointmentId(appointment.id),
            service: appointment.service || '',
            dentistName: appointment.dentistName || '',
            visitDate: toDateKey(appointment.appointmentDate) || current.visitDate,
          }
        })
        setAppointmentLookupMessage(`${appointment.appointmentId || formatAppointmentId(appointment.id)} linked automatically.`)
      } catch (error) {
        if (isMounted) setAppointmentLookupMessage(error.message || 'Unable to find an appointment for this patient.')
      } finally {
        if (isMounted) setIsFindingAppointment(false)
      }
    }, 450)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [form.appointment, form.patientName, modal?.mode])

  useEffect(() => {
    if (!isAdmin) return

    let isMounted = true
    fdmstApi.getStaff()
      .then((response) => {
        if (!isMounted) return
        const options = (response.data || [])
          .filter((user) => ['admin', 'staff'].includes(user.role))
          .map((user) => [user.firstName, user.lastName].filter(Boolean).join(' ').trim())
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right))
        setProviderOptions([...new Set([currentUserName, ...options].filter(Boolean))])
      })
      .catch(() => {
        if (isMounted) setProviderOptions([])
      })

    return () => {
      isMounted = false
    }
  }, [currentUserName, isAdmin])

  useEffect(() => {
    if (!appointmentPrefillId || appointmentPrefillRef.current === appointmentPrefillId) return

    let isMounted = true
    appointmentPrefillRef.current = appointmentPrefillId

    const prefillClinicalNote = async () => {
      try {
        const response = await fdmstApi.getAppointment(appointmentPrefillId)
        const appointment = response.appointment || response.data || response

        if (!isMounted) return

        setForm({
          ...emptyForm,
          patientName: appointment.patientName || '',
          appointment: appointment.id || appointmentPrefillId,
          appointmentDisplay: appointment.appointmentId || formatAppointmentId(appointment.id || appointmentPrefillId),
          service: appointment.service || '',
          dentistName: appointment.dentistName || '',
          visitDate: new Date().toISOString().slice(0, 10),
          noteType: 'Clinical Note',
        })
        setAppointmentLookupMessage(`${appointment.appointmentId || formatAppointmentId(appointment.id || appointmentPrefillId)} linked automatically.`)
        setModal({ mode: 'create', note: null })
      } catch (error) {
        if (!isMounted) return
        toast.error(error.message || 'Unable to load appointment details for this clinical note.')
      }
    }

    prefillClinicalNote()

    return () => {
      isMounted = false
    }
  }, [appointmentPrefillId, toast])

  const providers = useMemo(() => (
    (providerOptions.length ? providerOptions : [...new Set(notes.map((note) => note.createdByName || note.dentistName).filter(Boolean))])
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
  ), [notes, providerOptions])

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      })
      return []
    })
  }, [])

  const closeModal = () => {
    clearPendingAttachments()
    setModal(null)
  }

  const changePatientName = (value) => {
    const shouldFindAppointment = value.trim().length >= 2
    setIsFindingAppointment(shouldFindAppointment)
    setAppointmentLookupMessage(shouldFindAppointment ? 'Finding the patient appointment...' : '')
    setForm((current) => ({
      ...current,
      patientName: value,
      appointment: '',
      appointmentDisplay: '',
      service: '',
      dentistName: '',
    }))
  }

  const addAttachments = (fileList, category) => {
    if (!isAdmin) return
    const files = Array.from(fileList || [])
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    const availableSlots = Math.max(8 - (form.attachments || []).length - pendingAttachments.length, 0)
    if (!availableSlots) {
      toast.error('A clinical note can contain up to 8 attachments.')
      return
    }

    const validFiles = []
    for (const file of files.slice(0, availableSlots)) {
      if (!acceptedTypes.has(file.type)) {
        toast.error(`${file.name} is not a supported JPG, PNG, WebP, or PDF file.`)
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5 MB.`)
        continue
      }
      validFiles.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        category,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      })
    }

    if (files.length > availableSlots) toast.error('Only the first available attachments were added. The maximum is 8.')
    setPendingAttachments((current) => [...current, ...validFiles])
  }

  const removePendingAttachment = (localId) => {
    setPendingAttachments((current) => current.filter((attachment) => {
      if (attachment.localId !== localId) return true
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      return false
    }))
  }

  const openCreate = () => {
    clearPendingAttachments()
    setAppointmentLookupMessage('')
    setIsFindingAppointment(false)
    setForm(emptyForm)
    setModal({ mode: 'create', note: null })
  }

  const openView = async (note) => {
    let selectedNote = note
    try {
      const response = await fdmstApi.viewClinicalNote(note.id, { scope: isAdmin && filters.scope === 'all' ? 'all' : 'mine' })
      selectedNote = response.data || note
    } catch {
      // Viewing should still work if audit logging fails.
    }
    clearPendingAttachments()
    setForm({
      ...emptyForm,
      ...selectedNote,
      appointment: selectedNote.appointment || '',
      appointmentDisplay: selectedNote.appointmentSnapshot?.appointmentId || formatAppointmentId(selectedNote.appointment),
      visitDate: selectedNote.visitDate ? new Date(selectedNote.visitDate).toISOString().slice(0, 10) : emptyForm.visitDate,
      clinicalNotes: { ...emptyForm.clinicalNotes, ...(selectedNote.clinicalNotes || {}) },
      clinicalFollowUp: selectedNote.clinicalFollowUp || null,
    })
    setModal({ mode: 'view', note: selectedNote })
  }

  const openEdit = (note) => {
    clearPendingAttachments()
    setForm({
      ...emptyForm,
      ...note,
      appointment: note.appointment || '',
      appointmentDisplay: note.appointmentSnapshot?.appointmentId || formatAppointmentId(note.appointment),
      visitDate: note.visitDate ? new Date(note.visitDate).toISOString().slice(0, 10) : emptyForm.visitDate,
      clinicalNotes: { ...emptyForm.clinicalNotes, ...(note.clinicalNotes || {}) },
      clinicalFollowUp: note.clinicalFollowUp || null,
    })
    setModal({ mode: 'edit', note })
  }

  const saveNote = async () => {
    if (modal.mode === 'create' && isFindingAppointment) {
      toast.error('Please wait while the patient appointment is being linked.')
      return
    }
    if (form.followUp?.enabled && (!form.followUp.date || !form.followUp.time)) {
      toast.error('Follow-up date and time are required.')
      return
    }
    if (!Object.values(form.clinicalNotes || {}).some((value) => String(value || '').trim())) {
      toast.error('Enter at least one clinical note field.')
      return
    }

    setIsSaving(true)
    let uploadedAttachments = []
    try {
      uploadedAttachments = isAdmin && pendingAttachments.length
        ? await Promise.all(pendingAttachments.map(async (attachment) => ({
            ...(await uploadClinicalFile(attachment.file)),
            category: attachment.category,
          })))
        : []
      const payload = {
        patientName: form.patientName,
        appointment: form.appointment,
        visitDate: form.visitDate,
        noteType: form.noteType,
        clinicalNotes: form.clinicalNotes,
        followUp: form.followUp,
        ...(isAdmin ? { attachments: [...(form.attachments || []), ...uploadedAttachments] } : {}),
      }
      if (modal.mode === 'create') {
        const response = await fdmstApi.createClinicalNote(payload)
        toast.success(response.message || 'Clinical note created.')
        if (response.warning) toast.error(response.warning)
      } else {
        await fdmstApi.updateClinicalNote(modal.note.id, payload)
        toast.success('Clinical note updated.')
      }
      closeModal()
      await loadNotes()
    } catch (error) {
      if (uploadedAttachments.length) {
        await Promise.allSettled(uploadedAttachments.map((attachment) => fdmstApi.deleteClinicalFile(attachment)))
      }
      toast.error(error.message || 'Unable to save clinical note.')
    } finally {
      setIsSaving(false)
    }
  }

  const exportNotes = async () => {
    if (!isAdmin) return
    setExportOpen(false)
    try {
      await fdmstApi.exportClinicalNotes({ filters })
    } catch {
      // Export logging should not block printing.
    }
    window.print()
    toast.success('Preparing clinical notes export.')
  }

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : 1 }))
  }

  const clearFilters = () => setFilters({ scope: 'mine', search: '', provider: '', appointment: '', startDate: '', endDate: '', page: 1 })

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-100">
              <FaNotesMedical />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-sky-950">Clinical Notes</h1>
              <p className="mt-1 text-sm text-slate-500">Private observations, assessments, recommendations, and internal reminders.</p>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="mt-6 w-full max-w-full xl:w-[70rem]">
            <label className="relative block">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-11`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search patient, provider, or note content..." />
            </label>
          </div>
        ) : null}

        <div className={`${isAdmin ? 'mt-4' : 'mt-6'} grid items-center gap-3 ${isAdmin ? 'md:grid-cols-2 xl:grid-cols-[140px_160px_250px_auto_auto]' : 'md:grid-cols-2 xl:grid-cols-[minmax(320px,1fr)_250px_auto_auto]'}`}>
          {!isAdmin ? (
            <label className="relative block">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-11`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search clinical notes..." />
            </label>
          ) : null}
          {isAdmin ? (
            <select className={inputClass} value={filters.scope} onChange={(event) => updateFilter('scope', event.target.value)}>
              <option value="mine">My Notes</option>
              <option value="all">All Notes</option>
            </select>
          ) : null}
          {isAdmin ? (
            <select className={inputClass} value={filters.provider} onChange={(event) => updateFilter('provider', event.target.value)}>
              <option value="">All Providers</option>
              {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          ) : null}
          <DateRangeFilter startDate={filters.startDate} endDate={filters.endDate} onChange={updateFilter} />
          <button type="button" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 xl:w-auto" onClick={clearFilters}>
            <FaTimes /> Clear
          </button>
          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:flex-nowrap">
            <button type="button" className="inline-flex h-11 w-full whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900 sm:w-auto" onClick={openCreate}>
              <FaPlus /> Create Note
            </button>
            {isAdmin ? (
              <div className="relative w-full sm:w-auto">
                <button
                  type="button"
                  className="inline-flex h-11 w-full whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-900 sm:w-auto"
                  onClick={() => setExportOpen((value) => !value)}
                >
                  <FaFileExport className="h-4 w-4" />
                  Export
                  <FaChevronDown className="h-3 w-3" />
                </button>
                {exportOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={exportNotes}
                    >
                      <FaFileExport className="h-4 w-4 text-sky-700" />
                      Export PDF
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={exportNotes}
                    >
                      <FaFileExport className="h-4 w-4 text-sky-700" />
                      Print Notes
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-bold text-sky-950">Clinical Notes Table</h2>
          <p className="mt-1 text-sm text-slate-500">{pagination.total} private notes found.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Patient</th>
                <th className="px-5 py-4">Provider</th>
                <th className="px-5 py-4">Note Type</th>
                <th className="px-5 py-4">Last Updated</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td className="px-5 py-10 text-center text-slate-500" colSpan="6">Loading clinical notes...</td></tr>
              ) : notes.length ? notes.map((note) => (
                <tr key={note.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 text-slate-600"><span className="inline-flex items-center gap-2"><FaCalendarAlt className="text-slate-300" />{formatDate(note.visitDate || note.createdAt)}</span></td>
                  <td className="px-5 py-4 font-bold text-sky-950">{note.patientName}</td>
                  <td className="px-5 py-4 text-slate-600">{note.createdByName || note.dentistName || 'Unknown provider'}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-700 ring-1 ring-fuchsia-100">{note.noteType || 'Clinical Note'}</span></td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(note.updatedAt || note.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100" title="View details" onClick={() => openView(note)}><FaEye /></button>
                      {canEditNote(note, currentUser) ? (
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100" title="Edit note" onClick={() => openEdit(note)}><FaEdit /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-5 py-14 text-center text-slate-500" colSpan="6">No clinical notes found.</td></tr>
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
      <NoteModal
        mode={modal.mode}
        note={modal.note}
        form={form}
        setForm={setForm}
        onClose={closeModal}
        onSubmit={saveNote}
        isSaving={isSaving}
        canEdit={modal.mode === 'create' || canEditNote(modal.note, currentUser)}
        followUpSlots={followUpSlots}
        isLoadingFollowUpSlots={isLoadingFollowUpSlots}
        followUpAvailabilityMessage={followUpAvailabilityMessage}
        isAdmin={isAdmin}
        pendingAttachments={pendingAttachments}
        onAddAttachments={addAttachments}
        onRemovePendingAttachment={removePendingAttachment}
        isFindingAppointment={isFindingAppointment}
        appointmentLookupMessage={appointmentLookupMessage}
        onPatientNameChange={changePatientName}
      />
      ) : null}
    </main>
  )
}

export default StaffClinicalNotesPage
