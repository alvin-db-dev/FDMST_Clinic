import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaCamera,
  FaChevronDown,
  FaCloudUploadAlt,
  FaEdit,
  FaExpand,
  FaExternalLinkAlt,
  FaEye,
  FaFileAlt,
  FaFileExport,
  FaFileMedicalAlt,
  FaImage,
  FaPaperclip,
  FaPlus,
  FaPrint,
  FaSearch,
  FaTimes,
  FaTooth,
  FaTrash,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import ClinicalAttachmentUrl from '../../components/ClinicalAttachmentUrl.jsx'
import DateRangeFilter from '../../components/DateRangeFilter.jsx'
import DentalChart, { DENTAL_COLORS } from '../../components/DentalChart.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'
import { uploadClinicalFile } from '../../utils/imageUpload.js'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const textareaClass = 'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const statusOptions = [
  ['completed', 'Completed'],
  ['in_progress', 'In Progress'],
  ['cancelled', 'Cancelled'],
  ['follow_up_required', 'Return Appointment'],
]
const emptyForm = {
  patientName: '',
  patientId: '',
  appointment: '',
  visitDate: new Date().toISOString().slice(0, 10),
  procedure: '',
  toothNumber: '',
  allergies: '',
  toothColorMap: {},
  diagnosis: '',
  treatmentPerformed: '',
  materialsUsed: '',
  treatmentStatus: 'completed',
  recommendations: '',
  notes: '',
  attachments: [],
  treatmentPlan: {
    enabled: false,
    title: '',
    notes: '',
    steps: [],
  },
}

const statusClass = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_progress: 'bg-blue-50 text-blue-700 ring-blue-100',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-100',
  follow_up_required: 'bg-amber-50 text-amber-700 ring-amber-100',
}

const statusLabel = (status) => statusOptions.find(([value]) => value === status)?.[1] || 'Completed'

const getPatientId = (patient) => (
  typeof patient === 'object' && patient
    ? patient.id || patient._id || ''
    : patient || ''
)

const formatFileSize = (bytes) => {
  if (!bytes || Number.isNaN(Number(bytes))) return ''
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

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

const toForm = (record) => ({
  ...emptyForm,
  ...record,
  appointment: record?.appointment || '',
  appointmentDisplay: record?.appointmentSnapshot?.appointmentId || formatAppointmentId(record?.appointment),
  patientId: record?.patientId || record?.patientSnapshot?.patientId || '',
  allergies: Array.isArray(record?.patient?.allergies)
    ? record.patient.allergies.join(', ')
    : String(record?.patient?.allergies || ''),
  visitDate: record?.visitDate ? new Date(record.visitDate).toISOString().slice(0, 10) : emptyForm.visitDate,
  procedure: record?.procedure || record?.servicePerformed || '',
  toothColorMap: record?.toothColorMap || {},
  treatmentPerformed: record?.treatmentPerformed || '',
  recommendations: record?.recommendations || record?.nextVisitRecommendation || '',
  attachments: Array.isArray(record?.attachments) ? record.attachments : [],
  treatmentPlan: record?.treatmentPlan && typeof record.treatmentPlan === 'object'
    ? {
        enabled: Boolean(record.treatmentPlan.enabled),
        title: record.treatmentPlan.title || '',
        notes: record.treatmentPlan.notes || '',
        steps: Array.isArray(record.treatmentPlan.steps)
          ? record.treatmentPlan.steps.map((s, idx) => ({
              stepNumber: s.stepNumber || idx + 1,
              procedure: s.procedure || '',
              targetDate: s.targetDate ? new Date(s.targetDate).toISOString().slice(0, 10) : '',
              toothNumber: s.toothNumber || '',
              notes: s.notes || '',
              status: s.status || 'pending',
            }))
          : [],
      }
    : { enabled: false, title: '', notes: '', steps: [] },
})

export { emptyForm, toForm }

export function RecordModal({ mode, form, setForm, onClose, onSubmit, isSaving, canEdit, onAddClinicalNote, xrayOnlyUpload = false, hideTreatmentPlan = false, canEditPatientAllergies = false }) {
  const isReadonly = mode === 'view' || !canEdit
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [lookupStatus, setLookupStatus] = useState('loading')
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [isAllergyPasswordOpen, setIsAllergyPasswordOpen] = useState(false)
  const [allergyAdminPassword, setAllergyAdminPassword] = useState('')
  const [isSavingAllergies, setIsSavingAllergies] = useState(false)
  const [isLoadingPatientAllergies, setIsLoadingPatientAllergies] = useState(
    Boolean(canEditPatientAllergies && getPatientId(form.patient)),
  )
  const [patientAllergiesLoadError, setPatientAllergiesLoadError] = useState('')
  const [activeLightbox, setActiveLightbox] = useState(null)
  const allergiesEditedRef = useRef(false)
  const savedAllergiesRef = useRef(form.allergies || '')
  const xrayInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const toast = useToast()

  const addAttachments = (fileList, category = 'file') => {
    if (isReadonly) return
    const files = Array.from(fileList || [])
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    const availableSlots = Math.max(8 - (form.attachments || []).length - pendingAttachments.length, 0)
    if (!availableSlots) {
      toast.error('A treatment record can contain up to 8 attachments.')
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
    setPendingAttachments((current) => current.filter((item) => {
      if (item.localId !== localId) return true
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return false
    }))
  }

  const removeStoredAttachment = (indexOrPath) => {
    setForm((current) => ({
      ...current,
      attachments: (current.attachments || []).filter((item, idx) => {
        const itemIdentifier = item.id || item._id || item.path || idx
        return itemIdentifier !== indexOrPath
      }),
    }))
  }

  const handleModalSubmit = async () => {
    if (isSaving || isUploadingFiles) return
    const patientId = getPatientId(form.patient)
    const allergiesChanged = Boolean(
      canEditPatientAllergies
      && patientId
      && String(form.allergies || '').trim() !== String(savedAllergiesRef.current || '').trim(),
    )
    if (allergiesChanged && (isLoadingPatientAllergies || patientAllergiesLoadError)) {
      toast.error(patientAllergiesLoadError || 'Wait for the current patient allergies to finish loading before saving.')
      return
    }
    if (allergiesChanged && !isAllergyPasswordOpen) {
      setIsAllergyPasswordOpen(true)
      return
    }

    const updatePatientAllergies = async () => {
      if (!allergiesChanged) return
      await fdmstApi.update('patients', patientId, {
        allergies: String(form.allergies || '').trim(),
        adminPassword: allergyAdminPassword,
      })
      savedAllergiesRef.current = String(form.allergies || '').trim()
      allergiesEditedRef.current = false
      setIsAllergyPasswordOpen(false)
      setAllergyAdminPassword('')
    }

    if (!pendingAttachments.length) {
      if (allergiesChanged) {
        setIsSavingAllergies(true)
        try {
          await updatePatientAllergies()
          onSubmit(form)
        } catch (error) {
          toast.error(error.message || 'Unable to update patient allergies.')
        } finally {
          setIsSavingAllergies(false)
        }
      } else {
        onSubmit(form)
      }
      return
    }

    setIsUploadingFiles(true)
    let uploadedList = []
    try {
      uploadedList = await Promise.all(
        pendingAttachments.map(async (item) => {
          const res = await uploadClinicalFile(item.file)
          return {
            ...res,
            category: item.category,
          }
        })
      )

      const mergedAttachments = [...(form.attachments || []), ...uploadedList]
      await updatePatientAllergies()
      pendingAttachments.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      })
      setPendingAttachments([])
      setForm((current) => ({ ...current, attachments: mergedAttachments }))
      onSubmit({ ...form, attachments: mergedAttachments })
    } catch (err) {
      if (uploadedList.length) {
        await Promise.allSettled(uploadedList.map((item) => fdmstApi.deleteClinicalFile(item)))
      }
      toast.error(err.message || 'Failed to upload attachments. Please try again.')
    } finally {
      setIsUploadingFiles(false)
    }
  }

  const confirmAllergyUpdate = async (event) => {
    event.preventDefault()
    if (!allergyAdminPassword || isSavingAllergies) return
    setIsSavingAllergies(true)
    try {
      await handleModalSubmit()
    } finally {
      setIsSavingAllergies(false)
    }
  }

  // Derive procedures from toothColorMap
  const derivedProcedures = useMemo(() => {
    const colorMap = form.toothColorMap || {}
    const usedColorIds = new Set(Object.values(colorMap))
    return DENTAL_COLORS.filter((c) => usedColorIds.has(c.id))
  }, [form.toothColorMap])

  // Build grouped summary: which teeth belong to which procedure
  const procedureGroups = useMemo(() => {
    const colorMap = form.toothColorMap || {}
    const groups = {}
    Object.entries(colorMap).forEach(([toothId, colorId]) => {
      if (!groups[colorId]) groups[colorId] = []
      groups[colorId].push(toothId)
    })
    return groups
  }, [form.toothColorMap])

  const handleToothColorsChange = useCallback((newColorMap) => {
    if (isReadonly) return
    const usedColorIds = new Set(Object.values(newColorMap))
    const procedureLabels = DENTAL_COLORS
      .filter((c) => usedColorIds.has(c.id))
      .map((c) => c.label)
    setForm((current) => ({
      ...current,
      toothColorMap: newColorMap,
      procedure: procedureLabels.join(', '),
    }))
  }, [isReadonly, setForm])

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

  const patientProfileId = getPatientId(form.patient)
  useEffect(() => {
    if (!canEditPatientAllergies || !patientProfileId) {
      setIsLoadingPatientAllergies(false)
      return undefined
    }
    let active = true
    setIsLoadingPatientAllergies(true)
    setPatientAllergiesLoadError('')
    fdmstApi.getById('patients', patientProfileId)
      .then((patient) => {
        if (!active) return
        const allergies = Array.isArray(patient.allergies) ? patient.allergies.join(', ') : String(patient.allergies || '')
        savedAllergiesRef.current = allergies
        setIsLoadingPatientAllergies(false)
        if (!allergiesEditedRef.current) {
          setForm((current) => ({ ...current, allergies }))
        }
      })
      .catch((error) => {
        if (active) {
          console.error('Unable to load patient allergies:', error)
          setPatientAllergiesLoadError(error.message || 'Unable to load current patient allergies.')
          setIsLoadingPatientAllergies(false)
          toast.error(error.message || 'Unable to load patient allergies.')
        }
      })
    return () => { active = false }
  }, [canEditPatientAllergies, patientProfileId, setForm, toast])

  const patientName = (patient) => [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
  const matches = patients.filter((patient) => patientName(patient).toLowerCase().includes(form.patientName.trim().toLowerCase()))
  const patientAppointments = appointments.filter((appointment) => {
    const patientId = appointment.patientSnapshot?.id || appointment.patient?._id || appointment.patient
    return form.patient && String(patientId) === String(form.patient)
  })
  const selectPatient = (patient) => {
    const appointment = appointments.find((item) => String(item.patientSnapshot?.id || item.patient?._id || item.patient) === String(patient._id))
    const allergies = Array.isArray(patient.allergies) ? patient.allergies.join(', ') : String(patient.allergies || '')
    allergiesEditedRef.current = false
    savedAllergiesRef.current = allergies
    setIsLoadingPatientAllergies(true)
    setPatientAllergiesLoadError('')
    setForm((current) => ({
      ...current,
      patientName: patientName(patient),
      patient: patient._id,
      patientId: patient.patientId || '',
      allergies,
      appointment: appointment?.id || '',
      appointmentDisplay: appointment?.appointmentId || '',
      procedure: current.procedure || appointment?.service || '',
    }))
    setSearchOpen(false)
  }

  const handleSelectAppointment = (appointmentId) => {
    const apt = appointments.find((item) => String(item.id) === String(appointmentId))
    setForm((current) => ({
      ...current,
      appointment: appointmentId,
      appointmentDisplay: apt?.appointmentId || '',
      procedure: current.procedure || apt?.service || '',
    }))
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
              <select className={inputClass} value={form.appointment} disabled={isReadonly || !patientAppointments.length} onChange={(event) => handleSelectAppointment(event.target.value)}>
                <option value="">{form.patient ? 'No appointment selected' : 'Select a patient first'}</option>
                {patientAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.appointmentId || formatAppointmentId(appointment.id)} — {formatDate(appointment.appointmentDate)} ({appointment.status})</option>)}
              </select>
            ) : <input className={inputClass} value={form.appointmentDisplay || form.appointment} disabled />}
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Treatment Date
            <input className={inputClass} type="date" value={form.visitDate} disabled={isReadonly} onChange={(event) => update('visitDate', event.target.value)} />
          </label>
          <div className="grid gap-2 text-sm font-bold text-slate-600">
            <span>Procedure / Service <span className="text-[10px] font-medium text-slate-400">(auto-detected from dental chart)</span></span>
            {derivedProcedures.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {derivedProcedures.map((c) => {
                  const teethInGroup = (procedureGroups[c.id] || []).sort((a, b) => Number(a) - Number(b))
                  return (
                    <div key={c.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${c.borderClass}`}>
                      <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-white" style={{ backgroundColor: c.hex }} />
                      <span>{c.label}</span>
                      {teethInGroup.length > 0 ? (
                        <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold">Teeth: {teethInGroup.join(', ')}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-400">
                {isReadonly ? (form.procedure || 'No procedure recorded') : 'Select teeth on the dental chart below to auto-assign procedures'}
              </div>
            )}
          </div>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Tooth Number(s)
            <input className={inputClass} value={form.toothNumber || ''} disabled={isReadonly} onChange={(event) => update('toothNumber', event.target.value)} placeholder="e.g. 14, 15 (or select from chart below)" />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Treatment Status
            <select className={inputClass} value={form.treatmentStatus} disabled={isReadonly} onChange={(event) => update('treatmentStatus', event.target.value)}>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {canEditPatientAllergies ? (
            <label className="order-1 grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
              Patient Allergies
              <textarea
                className={textareaClass}
                value={form.allergies || ''}
                disabled={isReadonly || !patientProfileId || isLoadingPatientAllergies || Boolean(patientAllergiesLoadError)}
                onChange={(event) => {
                  allergiesEditedRef.current = true
                  update('allergies', event.target.value)
                }}
                placeholder={patientProfileId ? 'Enter allergies, separated by commas (optional)' : 'Select a patient to edit allergies'}
              />
              <span className="text-xs font-medium text-slate-500">
                {patientAllergiesLoadError || (isLoadingPatientAllergies
                  ? 'Loading current patient allergies...'
                  : 'Saved to the patient profile and used for future visits. Admin password confirmation is required when changed.')}
              </span>
            </label>
          ) : null}

          <div className="order-1 lg:col-span-3">
            <DentalChart
              selectedTooth={form.toothNumber}
              initialProcedure={form.procedure}
              initialToothColors={form.toothColorMap}
              records={form.toothNumber && form.procedure ? [{ toothNumber: form.toothNumber, procedure: form.procedure, treatmentStatus: form.treatmentStatus }] : []}
              onSelectTooth={(nextToothStr) => {
                if (isReadonly) return
                update('toothNumber', nextToothStr)
              }}
              onToothColorsChange={handleToothColorsChange}
              interactive={!isReadonly}
              title="Interactive Dental Odontogram (Click tooth to select/deselect)"
            />
          </div>
          <label className="order-1 grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Diagnosis
            <textarea className={textareaClass} value={form.diagnosis} disabled={isReadonly} onChange={(event) => update('diagnosis', event.target.value)} placeholder="Diagnosis" />
          </label>
          <label className="order-1 grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Treatment Description
            <textarea className={textareaClass} value={form.treatmentPerformed} disabled={isReadonly} onChange={(event) => update('treatmentPerformed', event.target.value)} placeholder="Treatment performed" />
          </label>
          <label className="order-1 grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Materials Used
            <textarea className={textareaClass} value={form.materialsUsed} disabled={isReadonly} onChange={(event) => update('materialsUsed', event.target.value)} placeholder="Optional materials used" />
          </label>
          <label className="order-1 grid gap-2 text-sm font-bold text-slate-600 lg:col-span-3">
            Follow-up Notes
            <textarea className={textareaClass} value={form.recommendations} disabled={isReadonly} onChange={(event) => update('recommendations', event.target.value)} placeholder="Follow-up notes or recommendations" />
          </label>

          {!hideTreatmentPlan ? (
          <>
          {/* Treatment Plan / Patient Roadmap Option */}
          <div className="order-1 lg:col-span-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.treatmentPlan?.enabled)}
                  disabled={isReadonly}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setForm((current) => ({
                      ...current,
                      treatmentPlan: {
                        ...(current.treatmentPlan || {}),
                        enabled: checked,
                        title: current.treatmentPlan?.title || `${current.patientName || 'Patient'} Treatment Roadmap`,
                        steps: current.treatmentPlan?.steps?.length
                          ? current.treatmentPlan.steps
                          : (checked ? [{ stepNumber: 1, procedure: '', targetDate: '', toothNumber: '', notes: '', status: 'pending' }] : []),
                      },
                    }))
                  }}
                  className="h-5 w-5 rounded border-slate-300 text-sky-950 focus:ring-sky-500"
                />
                <div>
                  <p className="text-sm font-bold text-sky-950">Patient Treatment Plan / Roadmap</p>
                  <p className="text-xs text-slate-500">Enable to outline planned upcoming treatments & target dates for the patient to follow and schedule.</p>
                </div>
              </label>

              {form.treatmentPlan?.enabled && !isReadonly ? (
                <button
                  type="button"
                  onClick={() => {
                    setForm((c) => ({
                      ...c,
                      treatmentPlan: {
                        ...c.treatmentPlan,
                        steps: [
                          ...(c.treatmentPlan?.steps || []),
                          {
                            stepNumber: (c.treatmentPlan?.steps?.length || 0) + 1,
                            procedure: '',
                            targetDate: '',
                            toothNumber: '',
                            notes: '',
                            status: 'pending',
                          },
                        ],
                      },
                    }))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-950 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-900 transition self-start sm:self-auto"
                >
                  <FaPlus className="h-3 w-3" /> Add Planned Step
                </button>
              ) : null}
            </div>

            {form.treatmentPlan?.enabled ? (
              <div className="mt-4 space-y-3 border-t border-sky-100 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                    Plan / Roadmap Title
                    <input
                      className={inputClass}
                      value={form.treatmentPlan.title || ''}
                      disabled={isReadonly}
                      onChange={(e) => setForm((c) => ({ ...c, treatmentPlan: { ...c.treatmentPlan, title: e.target.value } }))}
                      placeholder="e.g. Orthodontic Roadmap, Wisdom Tooth & Braces Plan"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-slate-600">
                    General Roadmap Notes
                    <input
                      className={inputClass}
                      value={form.treatmentPlan.notes || ''}
                      disabled={isReadonly}
                      onChange={(e) => setForm((c) => ({ ...c, treatmentPlan: { ...c.treatmentPlan, notes: e.target.value } }))}
                      placeholder="e.g. Sequential stages to be booked by patient"
                    />
                  </label>
                </div>

                <div className="space-y-2.5 pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Planned Steps & Schedules</p>

                  {form.treatmentPlan.steps?.map((step, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-950">
                          Step {idx + 1}
                        </span>
                        {!isReadonly ? (
                          <button
                            type="button"
                            onClick={() => {
                              setForm((c) => ({
                                ...c,
                                treatmentPlan: {
                                  ...c.treatmentPlan,
                                  steps: c.treatmentPlan.steps
                                    .filter((_, i) => i !== idx)
                                    .map((s, i) => ({ ...s, stepNumber: i + 1 })),
                                },
                              }))
                            }}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition"
                          >
                            ✕ Remove Step
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="grid gap-1 text-[11px] font-bold text-slate-600">
                          Procedure / Treatment
                          <input
                            className={inputClass}
                            value={step.procedure || ''}
                            disabled={isReadonly}
                            onChange={(e) => {
                              const val = e.target.value
                              setForm((c) => ({
                                ...c,
                                treatmentPlan: {
                                  ...c.treatmentPlan,
                                  steps: c.treatmentPlan.steps.map((s, i) => i === idx ? { ...s, procedure: val } : s),
                                },
                              }))
                            }}
                            placeholder="e.g. Tooth Extraction, Braces"
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] font-bold text-slate-600">
                          Target Schedule Date
                          <input
                            type="date"
                            className={inputClass}
                            value={step.targetDate || ''}
                            disabled={isReadonly}
                            onChange={(e) => {
                              const val = e.target.value
                              setForm((c) => ({
                                ...c,
                                treatmentPlan: {
                                  ...c.treatmentPlan,
                                  steps: c.treatmentPlan.steps.map((s, i) => i === idx ? { ...s, targetDate: val } : s),
                                },
                              }))
                            }}
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] font-bold text-slate-600">
                          Tooth Number(s) (Optional)
                          <input
                            className={inputClass}
                            value={step.toothNumber || ''}
                            disabled={isReadonly}
                            onChange={(e) => {
                              const val = e.target.value
                              setForm((c) => ({
                                ...c,
                                treatmentPlan: {
                                  ...c.treatmentPlan,
                                  steps: c.treatmentPlan.steps.map((s, i) => i === idx ? { ...s, toothNumber: val } : s),
                                },
                              }))
                            }}
                            placeholder="e.g. 14, 24 or Upper Arch"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1 text-[11px] font-bold text-slate-600">
                        Step Details / Instructions for Patient
                        <input
                          className={inputClass}
                          value={step.notes || ''}
                          disabled={isReadonly}
                          onChange={(e) => {
                            const val = e.target.value
                            setForm((c) => ({
                              ...c,
                              treatmentPlan: {
                                ...c.treatmentPlan,
                                steps: c.treatmentPlan.steps.map((s, i) => i === idx ? { ...s, notes: val } : s),
                              },
                            }))
                          }}
                          placeholder="e.g. Fast 2 hours prior, soft diet after"
                        />
                      </label>
                    </div>
                  ))}

                  {!form.treatmentPlan.steps?.length ? (
                    <p className="rounded-xl border border-dashed border-sky-200 bg-white p-3 text-center text-xs text-slate-400">
                      No planned steps added yet. Click "+ Add Planned Step" above.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          </>
          ) : null}

          {/* X-rays and Clinical Photos Section */}
          <section className="lg:col-span-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-sky-950">
                  <FaCamera className="text-sky-700" /> X-rays & Clinical Photos
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Attach patient dental X-rays, intraoral photos, and clinical documents. Patients can review these in their electronic health record.
                </p>
              </div>

              {!isReadonly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={xrayInputRef}
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => {
                      addAttachments(e.target.files, 'xray')
                      e.target.value = ''
                    }}
                  />
                  {!xrayOnlyUpload ? (
                    <input
                      ref={fileInputRef}
                      className="hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      onChange={(e) => {
                        addAttachments(e.target.files, 'file')
                        e.target.value = ''
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => xrayInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 text-xs font-bold text-sky-900 shadow-2xs hover:bg-sky-50 transition"
                  >
                    <FaImage className="text-sky-600" />
                    + Add Dental X-ray
                  </button>
                  {!xrayOnlyUpload ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-950 px-3 text-xs font-bold text-white shadow-2xs hover:bg-sky-900 transition"
                    >
                      <FaCloudUploadAlt className="text-amber-400" />
                      + Add Photo / File
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {(form.attachments || []).length || pendingAttachments.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Saved attachments */}
                {(form.attachments || []).map((attachment, idx) => {
                  const attachmentIdentifier = attachment.id || attachment._id || attachment.path || idx
                  const isImage = String(attachment.mimeType || '').startsWith('image/')
                  const isXray = attachment.category === 'xray'
                  return (
                    <ClinicalAttachmentUrl key={attachmentIdentifier} attachment={attachment}>
                      {(attachmentUrl, attachmentError) => (
                        <article className="group relative flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-sky-300 hover:shadow-xs">
                      {isImage && attachmentUrl ? (
                        <button
                          type="button"
                          onClick={() => setActiveLightbox({ ...attachment, url: attachmentUrl, title: isXray ? 'Dental X-ray' : 'Clinical Photo' })}
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 group-hover:ring-2 group-hover:ring-sky-400"
                          title="Click to view full image"
                        >
                          <img
                            src={attachmentUrl}
                            alt={attachment.name || 'Treatment X-ray'}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <FaExpand className="h-3 w-3 text-white" />
                          </span>
                        </button>
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700">
                          <FaFileAlt className="h-6 w-6" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        {attachmentUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isImage) {
                                setActiveLightbox({ ...attachment, url: attachmentUrl, title: isXray ? 'Dental X-ray' : 'Clinical Photo' })
                              } else {
                                window.open(attachmentUrl, '_blank')
                              }
                            }}
                            className="block w-full truncate text-left text-xs font-bold text-sky-950 hover:text-sky-700 hover:underline"
                            title={attachment.name || 'Attachment'}
                          >
                            {attachment.name || 'Treatment attachment'}
                          </button>
                        ) : (
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-700" title={attachment.name}>
                              {attachment.name || 'Treatment attachment'}
                            </p>
                            {attachmentError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{attachmentError}</p> : null}
                          </div>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isXray ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isXray ? 'Dental X-ray' : 'Document'}
                          </span>
                          {attachment.size ? (
                            <span className="text-[11px] font-medium text-slate-400">
                              {formatFileSize(attachment.size)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {!isReadonly ? (
                        <button
                          type="button"
                          onClick={() => removeStoredAttachment(attachmentIdentifier)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Remove attachment"
                        >
                          <FaTrash className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                        </article>
                      )}
                    </ClinicalAttachmentUrl>
                  )
                })}

                {/* Pending attachments */}
                {pendingAttachments.map((item) => {
                  const isImage = item.file.type.startsWith('image/')
                  const isXray = item.category === 'xray'
                  return (
                    <article
                      key={item.localId}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/70 p-3 shadow-2xs"
                    >
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt="Pending upload preview"
                          className="h-14 w-14 shrink-0 rounded-lg object-cover border border-sky-200"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white text-sky-700">
                          <FaFileAlt className="h-6 w-6" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-sky-950" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isXray ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isXray ? 'Dental X-ray' : 'File'}
                          </span>
                          <span className="text-[11px] font-semibold text-sky-600">
                            Ready ({formatFileSize(item.file.size)})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePendingAttachment(item.localId)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Remove selected file"
                      >
                        <FaTrash className="h-3.5 w-3.5" />
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs font-medium text-slate-400">
                {!isReadonly ? 'No X-rays or photos attached yet. Click "+ Add Dental X-ray" above to upload.' : 'No X-rays or files attached to this record.'}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
          <button type="button" className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>{mode === 'view' ? 'Back' : 'Cancel'}</button>
          {mode === 'view' && onAddClinicalNote ? (
            <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900" onClick={onAddClinicalNote}>
              Add Clinical Note
            </button>
          ) : null}
          {mode !== 'view' && canEdit ? (
            <button type="button" className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60" disabled={isSaving || isUploadingFiles || isLoadingPatientAllergies || isSavingAllergies} onClick={handleModalSubmit}>
              {isSaving || isUploadingFiles || isSavingAllergies ? 'Saving...' : mode === 'create' ? 'Create Treatment Record' : 'Save Changes'}
            </button>
          ) : null}
        </div>
      </section>

      {isAllergyPasswordOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="allergy-password-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="allergy-password-title" className="text-lg font-bold text-sky-950">Confirm Patient Allergy Changes</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Enter your admin password to save these allergies to the patient profile.</p>
            <form className="mt-5 space-y-4" onSubmit={confirmAllergyUpdate}>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Admin Password
                <input
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                  value={allergyAdminPassword}
                  onChange={(event) => setAllergyAdminPassword(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  disabled={isSavingAllergies}
                  onClick={() => {
                    setIsAllergyPasswordOpen(false)
                    setAllergyAdminPassword('')
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="h-10 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60" disabled={isSavingAllergies}>
                  {isSavingAllergies ? 'Saving...' : 'Verify and Save'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* Lightbox Image Preview Modal */}
      {activeLightbox ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setActiveLightbox(null)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-sky-950 p-1.5 text-amber-400">
                  <FaImage className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-sky-950">{activeLightbox.name || activeLightbox.title || 'Image Preview'}</h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {activeLightbox.category === 'xray' ? 'Dental Radiograph / X-ray' : 'Clinical Photograph'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeLightbox.url ? (
                  <a
                    href={activeLightbox.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  >
                    <FaExternalLinkAlt className="h-3 w-3" /> Full Size
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setActiveLightbox(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 transition"
                >
                  <FaTimes className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center overflow-auto bg-slate-950 p-4">
              <img
                src={activeLightbox.url}
                alt={activeLightbox.name || 'Clinical Image'}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      ) : null}
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
  const [selectedChartRecord, setSelectedChartRecord] = useState(null)
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

        if (record) {
          await openView(record)
          return
        }

        // If no treatment record exists yet, load the appointment and open Create Record with details prefilled
        try {
          const aptResponse = await fdmstApi.getAppointments({ period: 'all', limit: 100 })
          const allApts = aptResponse.data || []
          const apt = allApts.find((item) => String(item.id) === String(appointmentRecordId))
          if (apt && isMounted) {
            const patientId = apt.patientSnapshot?.patientId || apt.patientSnapshot?.id || apt.patient?._id || apt.patient || ''
            setForm({
              ...emptyForm,
              patientName: apt.patientName || '',
              patient: apt.patient?._id || apt.patient || '',
              patientId: apt.patientSnapshot?.patientId || patientId,
              appointment: apt.id,
              appointmentDisplay: apt.appointmentId || formatAppointmentId(apt.id),
              procedure: apt.service || '',
              treatmentStatus: 'completed',
              visitDate: apt.appointmentDate ? new Date(apt.appointmentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            })
            setModal({ mode: 'create', record: null })
            toast.info(`Recording treatment for ${apt.patientName}.`)
            return
          }
        } catch {
          // ignore fallback error
        }

        toast.info('Treatment record is still being prepared for this appointment.')
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

  const saveRecord = async (finalData) => {
    setIsSaving(true)
    const payload = finalData && typeof finalData === 'object' && finalData.patientName ? finalData : form
    try {
      if (modal.mode === 'create') {
        await fdmstApi.createTreatmentRecord(payload)
        toast.success('Treatment record created.')
      } else {
        await fdmstApi.updateTreatmentRecord(modal.record.id, payload)
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

      {selectedChartRecord ? (
        <section className="overflow-hidden rounded-[1.75rem] border border-sky-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-950 text-white"><FaTooth /></span>
              <div>
                <p className="text-sm font-bold text-sky-950">Dental Chart — {selectedChartRecord.patientName}</p>
                <p className="text-xs text-slate-500">{formatDate(selectedChartRecord.visitDate || selectedChartRecord.createdAt)} • {selectedChartRecord.procedure || 'Treatment'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedChartRecord(null)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
              <FaTimes className="h-3 w-3" /> Close
            </button>
          </div>
          <div className="p-6">
            <DentalChart
              records={[selectedChartRecord]}
              selectedTooth={selectedChartRecord.toothNumber || ''}
              initialToothColors={selectedChartRecord.toothColorMap || null}
              interactive={false}
              title={`Treatment Chart — ${selectedChartRecord.patientName} — ${formatDate(selectedChartRecord.visitDate || selectedChartRecord.createdAt)}`}
            />
          </div>
        </section>
      ) : null}

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
              ) : records.length ? records.map((record) => {
                const isChartActive = selectedChartRecord?.id === record.id
                return (
                <tr key={record.id} className={`transition cursor-pointer ${isChartActive ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : 'hover:bg-slate-50'}`} onClick={() => setSelectedChartRecord(isChartActive ? null : record)}>
                  <td className="px-5 py-4 text-slate-600"><span className="inline-flex items-center gap-2"><FaCalendarAlt className="text-slate-300" />{formatDate(record.visitDate || record.createdAt)}</span></td>
                  <td className="px-5 py-4 font-bold text-sky-950">{record.patientName}</td>
                  <td className="px-5 py-4 text-slate-600">{record.createdByName || record.dentistName || 'Unknown provider'}</td>
                  <td className="px-5 py-4 text-slate-600">
                    <p className="font-semibold text-slate-800">{record.procedure || 'Dental Treatment'}</p>
                    {record.attachments?.length ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-850 ring-1 ring-sky-200">
                        <FaCamera className="h-2.5 w-2.5 text-sky-600" />
                        {record.attachments.length} {record.attachments.length === 1 ? 'file / X-ray' : 'files / X-rays'}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass[record.treatmentStatus] || statusClass.completed}`}>{statusLabel(record.treatmentStatus)}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className={`grid h-9 w-9 place-items-center rounded-xl transition ${isChartActive ? 'bg-sky-950 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`} title={isChartActive ? 'Hide dental chart' : 'View dental chart'} onClick={(e) => { e.stopPropagation(); setSelectedChartRecord(isChartActive ? null : record) }}><FaTooth /></button>
                      <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100" title="View details" onClick={(e) => { e.stopPropagation(); openView(record) }}><FaEye /></button>
                      {!isStaff && canEditRecord(record, currentUser) ? (
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100" title="Edit record" onClick={(e) => { e.stopPropagation(); openEdit(record) }}><FaEdit /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}) : (
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
          canEditPatientAllergies={isAdmin}
        />
      ) : null}
    </main>
  )
}

export default StaffTreatmentRecordsPage
