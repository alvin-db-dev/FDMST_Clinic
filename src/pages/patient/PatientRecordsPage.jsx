import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FaAllergies,
  FaArrowRight,
  FaCalendarAlt,
  FaCalendarCheck,
  FaCalendarPlus,
  FaCamera,
  FaCapsules,
  FaCheckCircle,
  FaClipboardList,
  FaExpand,
  FaExternalLinkAlt,
  FaEye,
  FaFileAlt,
  FaFileInvoiceDollar,
  FaFileMedical,
  FaFilter,
  FaImage,
  FaNotesMedical,
  FaRoute,
  FaSearch,
  FaStethoscope,
  FaTooth,
  FaTimes,
  FaUserMd,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import AppointmentReceiptModal from '../../components/AppointmentReceiptModal.jsx'
import ClinicalAttachmentUrl from '../../components/ClinicalAttachmentUrl.jsx'
import DentalChart from '../../components/DentalChart.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'
import { RecordModal, emptyForm as emptyTreatmentForm, toForm as toTreatmentForm } from '../staff/StaffTreatmentRecordsPage.jsx'

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

function formatDateKey(dateValue) {
  if (!dateValue) return ''
  try {
    const d = new Date(dateValue)
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch {}
  return String(dateValue).slice(0, 10)
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
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [treatmentRecordForm, setTreatmentRecordForm] = useState(emptyTreatmentForm)
  const [isTreatmentRecordOpen, setIsTreatmentRecordOpen] = useState(false)
  const [receiptAppointment, setReceiptAppointment] = useState(null)
  const [lightboxAttachment, setLightboxAttachment] = useState(null)

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
      toothColorMap: record.toothColorMap || {},
      attachments: Array.isArray(record.attachments) ? record.attachments : [],
      diagnosis: record.diagnosis || '',
      treatmentPerformed: record.treatmentPerformed || record.treatment || '',
      materialsUsed: record.materialsUsed || '',
      recommendations: record.recommendations || record.nextVisitRecommendation || '',
      type: 'record',
      _raw: record,
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

  const openTreatmentRecord = (record) => {
    setTreatmentRecordForm(toTreatmentForm(record))
    setIsTreatmentRecordOpen(true)
  }
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

  const treatmentPlans = useMemo(() => {
    return records
      .filter((record) => record.treatmentPlan?.enabled && Array.isArray(record.treatmentPlan?.steps) && record.treatmentPlan.steps.length > 0)
      .map((record) => ({
        ...record.treatmentPlan,
        steps: record.treatmentPlan.steps.map((step) => {
          const targetDate = formatDateKey(step.targetDate)
          const hasCompletedAppointment = appointments.some((appointment) => (
            targetDate
            && String(appointment.status || '').trim().toLowerCase() === 'completed'
            && formatDateKey(appointment.appointmentDate) === targetDate
          ))
          return {
            ...step,
            status: step.status === 'completed' || hasCompletedAppointment ? 'completed' : step.status,
          }
        }),
        recordId: record._id,
        dentistName: record.dentistName || 'Clinic Dentist',
        visitDate: record.visitDate,
      }))
  }, [appointments, records])

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
          <InfoCard icon={FaNotesMedical} label="Upcoming Return Appointment" value={upcomingFollowUp?.appointmentDate ? formatDate(upcomingFollowUp.appointmentDate) : 'None scheduled'} tone="rose" />
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

        <section className="mt-8 space-y-6">
          {selectedRecord ? (
            <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-md">
              <div className="flex flex-col gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-950 to-sky-900 px-6 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-sky-950 shadow-sm">
                    <FaFileMedical className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{selectedRecord.service}</h3>
                    <p className="text-xs text-sky-200">
                      Visit Date: {formatDate(selectedRecord.appointmentDate)} • Doctor: {selectedRecord.dentistName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-900/60 px-3 py-1.5 text-xs font-bold text-sky-100 hover:bg-sky-800 transition"
                  >
                    <FaTimes className="h-3 w-3" /> Show All
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Clinical summary grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tooth Number(s)</p>
                    <p className="mt-1 text-sm font-bold text-sky-950">{selectedRecord.toothNumber || 'General / Non-specific'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Diagnosis</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{selectedRecord.diagnosis || 'None recorded'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Treatment Summary</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{selectedRecord.treatmentPerformed || selectedRecord.notes || 'Completed'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Doctor Advice</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{selectedRecord.recommendations || 'None recorded'}</p>
                  </div>
                </div>

                {/* X-rays and Clinical Photos Gallery */}
                <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-slate-50 to-sky-50/40 p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="flex items-center gap-2 text-base font-bold text-sky-950">
                        <FaCamera className="text-sky-700" /> Dental X-rays & Clinical Photos
                      </h4>
                      <p className="text-xs text-slate-500">
                        Diagnostic radiographs and dental photos uploaded by your clinic dentist for this visit.
                      </p>
                    </div>
                    {selectedRecord.attachments?.length ? (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-950">
                        {selectedRecord.attachments.length} {selectedRecord.attachments.length === 1 ? 'Attachment' : 'Attachments'}
                      </span>
                    ) : null}
                  </div>

                  {selectedRecord.attachments?.length ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {selectedRecord.attachments.map((item, idx) => {
                        const isImage = String(item.mimeType || '').startsWith('image/')
                        const isXray = item.category === 'xray'
                        return (
                          <ClinicalAttachmentUrl key={item.id || item._id || item.path || idx} attachment={item}>
                            {(attachmentUrl, attachmentError) => (
                              <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition hover:border-sky-300 hover:shadow-md">
                            {isImage && attachmentUrl ? (
                              <button
                                type="button"
                                onClick={() => setLightboxAttachment({ ...item, url: attachmentUrl, title: isXray ? 'Dental X-ray' : 'Clinical Photo' })}
                                className="relative aspect-video w-full overflow-hidden bg-slate-950 group-hover:opacity-95"
                                title="Click to view full image"
                              >
                                <img
                                  src={attachmentUrl}
                                  alt={item.name || 'Dental X-ray'}
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                />
                                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                  <span className="flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-bold text-sky-950 shadow">
                                    <FaExpand className="h-3 w-3" /> View Full X-ray
                                  </span>
                                </span>
                              </button>
                            ) : (
                              <div className="flex aspect-video w-full items-center justify-center bg-sky-50 text-sky-700">
                                <FaFileAlt className="h-10 w-10 text-sky-600" />
                              </div>
                            )}

                            <div className="flex flex-1 flex-col justify-between p-3">
                              <div>
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    isXray ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {isXray ? 'Dental X-ray' : 'Clinical File'}
                                </span>
                                <p className="mt-1.5 truncate text-xs font-bold text-sky-950" title={item.name}>
                                  {item.name || 'Attachment'}
                                </p>
                                {attachmentError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{attachmentError}</p> : null}
                              </div>

                              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                                <span>{item.size ? `${Math.round(item.size / 1024)} KB` : ''}</span>
                                {attachmentUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isImage) {
                                        setLightboxAttachment({ ...item, url: attachmentUrl, title: isXray ? 'Dental X-ray' : 'Clinical Photo' })
                                      } else {
                                        window.open(attachmentUrl, '_blank')
                                      }
                                    }}
                                    className="font-bold text-sky-700 hover:text-sky-950 hover:underline"
                                  >
                                    Inspect &gt;
                                  </button>
                                ) : null}
                              </div>
                            </div>
                              </div>
                            )}
                          </ClinicalAttachmentUrl>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
                      No X-rays or clinical photos were attached to this visit record.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <DentalChart
            records={selectedRecord ? [selectedRecord._raw] : records}
            selectedTooth={selectedRecord ? selectedRecord.toothNumber : ''}
            initialToothColors={selectedRecord ? selectedRecord.toothColorMap : null}
            interactive={false}
            title={selectedRecord ? `Dental Chart — ${formatDate(selectedRecord.appointmentDate)}` : 'Your Interactive Dental Chart'}
          />
        </section>

        {treatmentPlans.length > 0 ? (
          <section className="mt-8 space-y-6">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-950 via-sky-900 to-sky-950 p-6 text-white shadow-lg sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30">
                    <FaRoute className="h-3.5 w-3.5" /> Treatment Roadmap & Care Plan
                  </span>
                  <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Your Personalized Dental Roadmap</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-200">
                    Your dentist has outlined the sequential treatment steps recommended for your oral health care. Review your scheduled milestones below and click &quot;Schedule for this Date&quot; to book each visit.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              {treatmentPlans.map((plan, planIdx) => (
                <div key={plan.recordId || planIdx} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                  <div className="border-b border-slate-100 bg-slate-50/75 px-6 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-sky-950">{plan.title || 'Recommended Treatment Roadmap'}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Prescribed by <span className="font-semibold text-slate-700">{plan.dentistName}</span> • Recorded on {formatDate(plan.visitDate)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                        {plan.steps.length} {plan.steps.length === 1 ? 'Planned Step' : 'Planned Steps'}
                      </span>
                    </div>
                    {plan.notes ? (
                      <p className="mt-3 rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200/70">
                        <strong className="text-slate-800">Plan Overview:</strong> {plan.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="p-6">
                    <div className="relative border-l-2 border-sky-100 pl-6 ml-3 space-y-6">
                      {plan.steps.map((step, sIdx) => {
                        const dateFormatted = step.targetDate ? formatDate(step.targetDate) : 'Date to be scheduled'
                        const dateKey = formatDateKey(step.targetDate)
                        const bookingUrl = `/patient/book-appointment?service=${encodeURIComponent(step.procedure || '')}&date=${encodeURIComponent(dateKey)}`
                        const isStepCompleted = step.status === 'completed'

                        return (
                          <div key={sIdx} className="relative group">
                            <span className="absolute -left-[35px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-sky-950 text-xs font-bold text-amber-400 ring-4 ring-white shadow-sm">
                              {step.stepNumber || sIdx + 1}
                            </span>

                            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs transition hover:border-sky-300 hover:shadow-xs">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-sky-700">Step {step.stepNumber || sIdx + 1}</span>
                                    <h4 className="text-base font-bold text-sky-950">{step.procedure || 'Planned Procedure'}</h4>
                                    {step.toothNumber ? (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                                        <FaTooth className="h-3 w-3" /> Tooth: {step.toothNumber}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                    <span className="inline-flex items-center gap-1.5 font-semibold text-sky-900 bg-sky-50 px-2.5 py-1 rounded-lg">
                                      <FaCalendarAlt className="text-sky-600 h-3.5 w-3.5" />
                                      Target Date: {dateFormatted}
                                    </span>
                                  </div>

                                  {step.notes ? (
                                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                      <span className="font-semibold text-slate-700">Instructions:</span> {step.notes}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="shrink-0 pt-2 lg:pt-0">
                                  {isStepCompleted ? (
                                    <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 sm:w-auto">
                                      <FaCheckCircle className="h-3.5 w-3.5" />
                                      Completed
                                    </span>
                                  ) : (
                                    <Link
                                      to={bookingUrl}
                                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-900 hover:shadow-md sm:w-auto"
                                    >
                                      <FaCalendarPlus className="h-3.5 w-3.5 text-amber-400" />
                                      <span>Schedule for this Date</span>
                                      <FaArrowRight className="h-2.5 w-2.5" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
                    <th className="px-4 py-3 text-right">Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {treatmentRows.map((row) => {
                    const isActive = selectedRecord?.id === row.id
                    return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRecord(isActive ? null : row)}
                      className={`border-t border-slate-100 transition cursor-pointer ${
                        isActive
                          ? 'bg-sky-50 ring-1 ring-inset ring-sky-200'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-4 font-medium text-sky-950">{formatDate(row.appointmentDate)}</td>
                      <td className="px-4 py-4">{row.dentistName}</td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-800">{row.service}</div>
                        {row.attachments?.length > 0 && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-sky-700 font-medium">
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-100/80 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                              <FaCamera className="h-3 w-3" />
                              {row.attachments.length} {row.attachments.length === 1 ? 'file / X-ray' : 'files / X-rays'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">{statusPill(row.status)}</td>
                      <td className="px-4 py-4 text-slate-500 max-w-xs truncate">{row.notes}</td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openTreatmentRecord(row._raw) }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 transition hover:bg-sky-100"
                          title="View treatment record"
                          aria-label={`View treatment record for ${row.service}`}
                        >
                          <FaEye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )})}
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
	                    <div className="flex flex-wrap items-center gap-2">
	                      {statusPill(appointment.status)}
	                      <button
	                        type="button"
	                        onClick={() => setReceiptAppointment(appointment)}
	                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-950 shadow-xs transition hover:bg-sky-50 hover:border-sky-300"
	                        title="View Official Receipt"
	                      >
	                        <FaFileInvoiceDollar className="text-emerald-600" /> View Receipt
	                      </button>
	                    </div>
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

      {receiptAppointment ? (
        <AppointmentReceiptModal
          appointment={receiptAppointment}
          onClose={() => setReceiptAppointment(null)}
        />
      ) : null}

      {isTreatmentRecordOpen ? (
        <RecordModal
          mode="view"
          form={treatmentRecordForm}
          setForm={setTreatmentRecordForm}
          onClose={() => {
            setIsTreatmentRecordOpen(false)
            setTreatmentRecordForm(emptyTreatmentForm)
          }}
          onSubmit={() => {}}
          isSaving={false}
          canEdit={false}
          hideTreatmentPlan
        />
      ) : null}

      {/* Lightbox Image Preview Modal for Patients */}
      {lightboxAttachment ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setLightboxAttachment(null)}
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
                  <h3 className="text-sm font-bold text-sky-950">{lightboxAttachment.name || lightboxAttachment.title || 'X-ray Preview'}</h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {lightboxAttachment.category === 'xray' ? 'Dental Radiograph / X-ray' : 'Clinical Photograph'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lightboxAttachment.url ? (
                  <a
                    href={lightboxAttachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  >
                    <FaExternalLinkAlt className="h-3 w-3" /> Full Size
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLightboxAttachment(null)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                  title="Close Preview"
                >
                  <FaTimes className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950/95 p-4 sm:p-6 min-h-[300px]">
              <img
                src={lightboxAttachment.url}
                alt={lightboxAttachment.name || 'Clinical Preview'}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default PatientRecordsPage
