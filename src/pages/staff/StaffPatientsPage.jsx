import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaClipboardList,
  FaEnvelope,
  FaEye,
  FaFileMedical,
  FaMapMarkerAlt,
  FaNotesMedical,
  FaPhone,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUser,
  FaUserInjured,
  FaUserMd,
  FaVenusMars,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const textareaClass =
  'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const initialPatientForm = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  dateOfBirth: '',
  guardianName: '',
  guardianRelationship: '',
  guardianContactNumber: '',
  guardianEmail: '',
  guardianAddress: '',
  gender: 'prefer_not_to_say',
  address: '',
  allergies: '',
  medicalConditions: '',
  medicalHistory: '',
  dentalHistory: '',
  emergencyContact: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  username: '',
  assignedDentist: '',
  assignedDentistName: '',
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null
  const birthDate = new Date(dateOfBirth)
  const today = new Date()
  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return null

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) age -= 1
  return age >= 0 ? age : null
}

function initials(patient) {
  return String(patient.fullName || `${patient.firstName || ''} ${patient.lastName || ''}` || 'Patient')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PT'
}

function statusBadge(status) {
  const label = status || 'New'
  const className = label === 'Verified'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : label === 'Inactive'
      ? 'bg-red-50 text-red-700 ring-red-100'
      : 'bg-amber-50 text-amber-700 ring-amber-100'

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${className}`}>{label}</span>
}

function SectionCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-sky-950">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  )
}

function StaffPatientsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = authStorage.getUser()
  const basePath = '/staff'
  const isStaff = user?.role === 'staff'
  const [patients, setPatients] = useState([])
  const [dentists, setDentists] = useState([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [patientForm, setPatientForm] = useState(initialPatientForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSavingPatient, setIsSavingPatient] = useState(false)

  const loadPatients = useCallback(async () => {
    setIsLoading(true)
    try {
      const [patientResponse, dentistResponse] = await Promise.all([
        fdmstApi.getMyCarePatients(),
        fdmstApi.getClinicDentist(),
      ])
      setPatients(patientResponse.data || [])
      const clinicDentists = dentistResponse.data ? [dentistResponse.data] : []
      setDentists(clinicDentists)
      if (clinicDentists[0]) {
        setPatientForm((current) => ({
          ...current,
          assignedDentist: current.assignedDentist || clinicDentists[0].id,
          assignedDentistName: current.assignedDentistName || clinicDentists[0].name,
        }))
      }
    } catch (error) {
      toast.error(error.message || `Unable to load ${isStaff ? 'patients' : 'your patients'}.`)
    } finally {
      setIsLoading(false)
    }
  }, [isStaff, toast])

  useEffect(() => {
    Promise.resolve().then(loadPatients)
  }, [loadPatients])

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return patients
    return patients.filter((patient) => [
      patient.fullName,
      patient.patientId,
      patient.contactNumber,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)))
  }, [patients, search])

  const openPatient = async (patient) => {
    try {
      const detail = await fdmstApi.getMyCarePatient(patient._id)
      setSelectedPatient(detail)
    } catch (error) {
      toast.error(error.message || 'Unable to open this patient profile.')
    }
  }

  const closeCreatePatient = () => {
    setIsCreateOpen(false)
    setPatientForm({
      ...initialPatientForm,
      assignedDentist: dentists[0]?.id || '',
      assignedDentistName: dentists[0]?.name || '',
    })
    setFieldErrors({})
  }

  const handlePatientFormChange = (event) => {
    const { name, value } = event.target
    const nextValue = ['contactNumber', 'emergencyContactNumber', 'guardianContactNumber'].includes(name) ? digitsOnly(value) : value

    if (name === 'assignedDentist') {
      const dentist = dentists.find((item) => String(item.id) === value)
      setPatientForm((current) => ({
        ...current,
        assignedDentist: value,
        assignedDentistName: dentist?.name || '',
      }))
      return
    }

    setPatientForm((current) => ({ ...current, [name]: nextValue }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const validatePatientForm = () => {
    const errors = {}
    if (!patientForm.firstName.trim()) errors.firstName = 'First name is required.'
    if (!patientForm.lastName.trim()) errors.lastName = 'Last name is required.'
    if (patientForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientForm.email)) errors.email = 'Enter a valid email address.'
    const mobileError = validateMobileNumber(patientForm.contactNumber)
    if (mobileError) errors.contactNumber = mobileError
    const age = calculateAge(patientForm.dateOfBirth)
    if (age !== null && age < 18) {
      if (!patientForm.guardianName.trim()) errors.guardianName = 'Parent/guardian full name is required.'
      if (!patientForm.guardianRelationship.trim()) errors.guardianRelationship = 'Relationship to patient is required.'
      const guardianMobileError = validateMobileNumber(patientForm.guardianContactNumber, { required: true })
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    } else if (patientForm.guardianContactNumber) {
      const guardianMobileError = validateMobileNumber(patientForm.guardianContactNumber)
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    }
    if (patientForm.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientForm.guardianEmail)) errors.guardianEmail = 'Enter a valid guardian email address.'
    const emergencyMobileError = patientForm.emergencyContactNumber ? validateMobileNumber(patientForm.emergencyContactNumber) : ''
    if (emergencyMobileError) errors.emergencyContactNumber = emergencyMobileError
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreatePatient = async (event) => {
    event.preventDefault()
    if (!validatePatientForm()) return

    setIsSavingPatient(true)
    try {
      await fdmstApi.create('patients', {
        ...patientForm,
        firstName: patientForm.firstName.trim(),
        lastName: patientForm.lastName.trim(),
        email: patientForm.email.trim(),
        contactNumber: patientForm.contactNumber.trim(),
        guardianName: patientForm.guardianName.trim(),
        guardianRelationship: patientForm.guardianRelationship.trim(),
        guardianContactNumber: patientForm.guardianContactNumber.trim(),
        guardianEmail: patientForm.guardianEmail.trim(),
        guardianAddress: patientForm.guardianAddress.trim(),
        allergies: patientForm.allergies.trim(),
        medicalConditions: patientForm.medicalConditions.trim(),
        medicalHistory: patientForm.medicalHistory.trim(),
        dentalHistory: patientForm.dentalHistory.trim(),
        emergencyContact: patientForm.emergencyContact.trim(),
        emergencyContactName: patientForm.emergencyContactName.trim(),
        emergencyContactNumber: patientForm.emergencyContactNumber.trim(),
        username: patientForm.username.trim(),
      })
      toast.success('Patient added successfully.')
      closeCreatePatient()
      await loadPatients()
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Unable to add patient.')
    } finally {
      setIsSavingPatient(false)
    }
  }

  const quickActions = [
    ['Create Appointment', FaCalendarAlt, `${basePath}/appointments`],
    ['Add Clinical Note', FaNotesMedical, `${basePath}/clinical-notes`],
    ['Add Treatment Record', FaFileMedical, `${basePath}/treatment-records`],
    ['View Appointment History', FaClipboardList, null],
  ]

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <FaUserInjured className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-sky-950">{isStaff ? 'Patients' : 'My Patients'}</h2>
              <p className="mt-1 text-sm text-slate-500">{isStaff ? 'All clinic patient records available for care support.' : 'Patients assigned to, scheduled with, or treated by you.'}</p>
            </div>
          </div>
          {isStaff ? (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white shadow-lg shadow-sky-950/15 transition hover:bg-sky-900"
            >
              <FaPlus className="h-4 w-4" aria-hidden="true" />
              Add Patient
            </button>
          ) : null}
        </div>

        <div className="border-b border-slate-100 px-5 pb-5">
          <label className="relative block max-w-2xl">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} pl-12`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient name, Patient ID, or contact number..." />
          </label>
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading patients...</p>
        ) : filteredPatients.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Patient Name</th>
                  <th className="px-5 py-4">Patient ID</th>
                  <th className="px-5 py-4">Last Visit</th>
                  <th className="px-5 py-4">Next Appointment</th>
                  <th className="px-5 py-4">Patient Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient, index) => (
                  <tr key={patient._id} className="border-t border-slate-100">
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${index % 2 ? 'bg-violet-600' : 'bg-sky-700'}`}>{initials(patient)}</span>
                        <div>
                          <p className="font-bold text-sky-950">{patient.fullName}</p>
                          <p className="text-xs text-slate-500">{patient.contactNumber || 'No contact number'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5 text-slate-600">{patient.patientId || '—'}</td>
                    <td className="px-5 py-5 text-slate-600">{patient.lastVisit || '—'}</td>
                    <td className="px-5 py-5 text-slate-600">{patient.nextAppointment || '—'}</td>
                    <td className="px-5 py-5">{statusBadge(patient.displayStatus)}</td>
                    <td className="px-5 py-5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openPatient(patient)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-50 px-4 text-sm font-bold text-sky-950 transition hover:bg-sky-100">
                          <FaEye className="h-4 w-4" aria-hidden="true" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <FaUserInjured className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-bold text-sky-950">No patients found.</p>
            <p className="mt-1 text-sm text-slate-500">{isStaff ? 'No clinic patient records match your search.' : 'Patients will appear here after they are assigned to you, booked with you, or treated by you.'}</p>
          </div>
        )}
      </section>

      {selectedPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-sky-950">{selectedPatient.fullName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedPatient.patientId || 'No Patient ID'} • {selectedPatient.contactNumber || 'No contact number'}</p>
              </div>
              <button type="button" onClick={() => setSelectedPatient(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close patient profile">
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SectionCard title="Personal Information">
                <p>Age: {selectedPatient.dateOfBirth ? Math.max(new Date().getFullYear() - new Date(selectedPatient.dateOfBirth).getFullYear(), 0) : '—'}</p>
                <p>Gender: {(selectedPatient.gender || 'prefer_not_to_say').replaceAll('_', ' ')}</p>
                <p>Contact Number: {selectedPatient.contactNumber || '—'}</p>
              </SectionCard>
              <SectionCard title="Medical Information">
                <p>Allergies: {selectedPatient.allergies?.length ? selectedPatient.allergies.join(', ') : 'None recorded'}</p>
                <p>Medical Conditions: {selectedPatient.medicalConditions || selectedPatient.medicalHistory || 'None recorded'}</p>
                <p>Emergency Contact: {[selectedPatient.emergencyContact, selectedPatient.emergencyContactName, selectedPatient.emergencyContactNumber].filter(Boolean).join(' • ') || '—'}</p>
              </SectionCard>
              <SectionCard title="Patient Quick Actions">
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickActions.map(([label, Icon, to]) => (
                    <button key={label} type="button" onClick={() => to && navigate(to)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 transition hover:bg-sky-50">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="Patient Visit History">
                {selectedPatient.appointmentHistory?.length ? selectedPatient.appointmentHistory.slice(0, 6).map((appointment) => (
                  <p key={appointment._id || appointment.id}>{formatDate(appointment.appointmentDate)} • {appointment.service || 'Appointment'} • {appointment.status}</p>
                )) : <p>No appointment history found.</p>}
              </SectionCard>
              <SectionCard title="Treatment Records">
                {selectedPatient.treatmentRecords?.length ? selectedPatient.treatmentRecords.slice(0, 6).map((record) => (
                  <p key={record._id}>{formatDate(record.visitDate || record.createdAt)} • {record.procedure || record.treatment || record.servicePerformed || 'Treatment'} • {record.treatmentStatus || 'completed'}</p>
                )) : <p>No treatment records found.</p>}
              </SectionCard>
              <SectionCard title="Clinical Notes">
                {selectedPatient.clinicalNotes?.length ? selectedPatient.clinicalNotes.slice(0, 6).map((record) => (
                  <p key={record._id}>{formatDate(record.visitDate || record.createdAt)} • {record.noteType || 'Clinical Note'} • {record.createdByName || record.dentistName || 'Provider'}</p>
                )) : <p>No clinical notes found.</p>}
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeCreatePatient} aria-label="Close add patient drawer" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Patients</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">Add Patient</h2>
                <p className="mt-1 text-sm text-slate-500">Create a patient record for clinic care and scheduling.</p>
              </div>
              <button type="button" onClick={closeCreatePatient} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close drawer">
                <FaTimes />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleCreatePatient}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  First Name
                  <span className="relative">
                    <FaUser className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="firstName" value={patientForm.firstName} onChange={handlePatientFormChange} placeholder="Enter first name" required />
                  </span>
                  {fieldErrors.firstName ? <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Last Name
                  <span className="relative">
                    <FaUser className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="lastName" value={patientForm.lastName} onChange={handlePatientFormChange} placeholder="Enter last name" required />
                  </span>
                  {fieldErrors.lastName ? <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Birth Date
                  <span className="relative">
                    <FaCalendarAlt className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="dateOfBirth" type="date" value={patientForm.dateOfBirth} onChange={handlePatientFormChange} />
                  </span>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Gender
                  <span className="relative">
                    <FaVenusMars className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select className={`${inputClass} pl-12`} name="gender" value={patientForm.gender} onChange={handlePatientFormChange}>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </span>
                </label>
                {(() => {
	                  const age = calculateAge(patientForm.dateOfBirth)
	                  return age !== null && age < 18 ? (
	                    <section className="grid min-w-0 gap-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 sm:col-span-2">
	                      <div>
	                        <h3 className="text-sm font-bold text-sky-950">Parent/Guardian Information</h3>
	                        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
	                          The parent/guardian will serve as the primary contact for this minor patient.
	                        </p>
	                      </div>
	                      <div className="grid gap-4 sm:grid-cols-2">
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Parent/Guardian Full Name
	                          <span className="relative">
	                            <FaUser className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
	                            <input className={`${inputClass} pl-12`} name="guardianName" value={patientForm.guardianName} onChange={handlePatientFormChange} placeholder="Parent or legal guardian full name" required />
	                          </span>
	                          {fieldErrors.guardianName ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianName}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Relationship to Patient
	                          <select className={inputClass} name="guardianRelationship" value={patientForm.guardianRelationship} onChange={handlePatientFormChange} required>
	                            <option value="">Select relationship</option>
	                            <option value="Mother">Mother</option>
	                            <option value="Father">Father</option>
	                            <option value="Legal Guardian">Legal Guardian</option>
	                            <option value="Grandparent">Grandparent</option>
	                            <option value="Relative">Relative</option>
	                          </select>
	                          {fieldErrors.guardianRelationship ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianRelationship}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Contact Number
	                          <span className="relative">
	                            <FaPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
	                            <input className={`${inputClass} pl-12`} name="guardianContactNumber" inputMode="numeric" maxLength={11} value={patientForm.guardianContactNumber} onChange={handlePatientFormChange} placeholder="09XXXXXXXXX" required />
	                          </span>
	                          {fieldErrors.guardianContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianContactNumber}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Email Address (if applicable)
	                          <span className="relative">
	                            <FaEnvelope className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
	                            <input className={`${inputClass} pl-12`} type="email" name="guardianEmail" value={patientForm.guardianEmail} onChange={handlePatientFormChange} placeholder="guardian@email.com" />
	                          </span>
	                          {fieldErrors.guardianEmail ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianEmail}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
	                          Home Address (optional)
	                          <textarea className={textareaClass} name="guardianAddress" value={patientForm.guardianAddress} onChange={handlePatientFormChange} placeholder="Leave blank if same as patient address" />
	                        </label>
	                      </div>
	                    </section>
	                  ) : null
	                })()}
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Email
                  <span className="relative">
                    <FaEnvelope className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} type="email" name="email" value={patientForm.email} onChange={handlePatientFormChange} placeholder="Enter email address" />
                  </span>
                  {fieldErrors.email ? <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Mobile Number
                  <span className="relative">
                    <FaPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="contactNumber" inputMode="numeric" maxLength={11} value={patientForm.contactNumber} onChange={handlePatientFormChange} placeholder="09XXXXXXXXX" />
                  </span>
                  {fieldErrors.contactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Address
                  <span className="relative">
                    <FaMapMarkerAlt className="pointer-events-none absolute left-4 top-5 h-4 w-4 text-slate-400" />
                    <textarea className={`${textareaClass} pl-12`} name="address" value={patientForm.address} onChange={handlePatientFormChange} placeholder="Enter full address" />
                  </span>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Assigned Dentist
                  <span className="relative">
                    <FaUserMd className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} bg-slate-50 pl-12`} value={patientForm.assignedDentistName || dentists[0]?.name || 'Clinic dentist'} readOnly />
                  </span>
                </label>
                {[
                  ['Allergies', 'allergies', 'Enter allergies optional'],
                  ['Medical Conditions', 'medicalConditions', 'Enter medical conditions optional'],
                  ['Medical History', 'medicalHistory', 'Enter medical history optional'],
                  ['Dental History', 'dentalHistory', 'Enter dental history optional'],
                ].map(([label, name, placeholder]) => (
                  <label key={name} className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                    {label}
                    <textarea className={textareaClass} name={name} value={patientForm[name]} onChange={handlePatientFormChange} placeholder={placeholder} />
                  </label>
                ))}
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact
                  <span className="relative">
                    <FaPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="emergencyContact" value={patientForm.emergencyContact} onChange={handlePatientFormChange} placeholder="Name and relationship" />
                  </span>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact Number
                  <span className="relative">
                    <FaPhone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="emergencyContactNumber" inputMode="numeric" maxLength={11} value={patientForm.emergencyContactNumber} onChange={handlePatientFormChange} placeholder="09XXXXXXXXX" />
                  </span>
                  {fieldErrors.emergencyContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.emergencyContactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Username
                  <span className="relative">
                    <FaUser className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-12`} name="username" value={patientForm.username} onChange={handlePatientFormChange} placeholder="Optional account username" />
                  </span>
                  {fieldErrors.username ? <span className="text-xs font-medium text-red-600">{fieldErrors.username}</span> : null}
                </label>
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-white px-5 py-5 sm:flex sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeCreatePatient} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={isSavingPatient} className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSavingPatient ? 'Creating Patient...' : 'Create Patient'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default StaffPatientsPage
