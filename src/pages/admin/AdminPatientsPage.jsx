import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaCalendarAlt,
  FaEdit,
  FaEnvelope,
  FaEye,
  FaMapMarkerAlt,
  FaNotesMedical,
  FaPhone,
  FaPlus,
  FaPowerOff,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaTooth,
  FaUser,
  FaUserMd,
  FaUsers,
  FaVenusMars,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass } from '../../components/AdminUi.jsx'
import DentalChart from '../../components/DentalChart.jsx'
import PasswordField from '../../components/PasswordField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const initialForm = {
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
  registrationStatus: 'unverified',
  status: 'active',
}

const patientInputClass =
  'h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const patientIconInputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-12 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const patientTextareaClass =
  'h-12 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const initialConfirmation = {
  type: '',
  title: '',
  description: '',
  submitLabel: '',
  payload: null,
  target: null,
}

function fullName(patient) {
  return [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unnamed Patient'
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
  return [patient?.firstName, patient?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function PatientAvatar({ patient, index = 0 }) {
  const colors = ['bg-violet-600', 'bg-pink-500', 'bg-blue-500', 'bg-orange-500', 'bg-teal-500', 'bg-amber-400']

  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${colors[index % colors.length]}`}>
      {initials(patient)}
    </span>
  )
}

function patientDisplayStatus(patient) {
  if ((patient?.status || 'active') === 'inactive') return 'Inactive'
  return patient?.registrationStatus === 'verified' ? 'Verified' : 'New'
}

function PatientStatusBadge({ status, registrationStatus }) {
  const normalized = status || 'active'
  if (normalized === 'inactive') {
    return <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100">Inactive</span>
  }

  if (registrationStatus === 'verified') {
    return <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Verified</span>
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
      New
    </span>
  )
}

function formatDateTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function IconField({ children, icon: Icon }) {
  return (
    <span className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      {children}
    </span>
  )
}

function AdminPatientsPage({ quickCreate = false, onClose }) {
  const toast = useToast()
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [dentists, setDentists] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [registrationDateFilter, setRegistrationDateFilter] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmation, setConfirmation] = useState(initialConfirmation)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isDrawerOpen, setIsDrawerOpen] = useState(quickCreate)

  const loadData = useCallback(async () => {
    try {
      const [patientResponse, appointmentResponse, recordResponse, dentistResponse] = await Promise.all([
        fdmstApi.list('patients'),
        fdmstApi.getAppointments(),
        fdmstApi.list('dentalrecords?limit=100'),
        fdmstApi.getClinicDentist(),
      ])
      setPatients(patientResponse.data || [])
      setAppointments(appointmentResponse.data || [])
      setRecords(recordResponse.data || [])
      const clinicDentists = dentistResponse.data ? [dentistResponse.data] : []
      setDentists(clinicDentists)
      if (clinicDentists[0]) {
        setForm((current) => ({
          ...current,
          assignedDentist: current.assignedDentist || clinicDentists[0].id,
          assignedDentistName: current.assignedDentistName || clinicDentists[0].name,
        }))
      }
    } catch (error) {
      toast.error(error.message || 'Unable to load patient records.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadData)
  }, [loadData])

  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return patients.filter((patient) => {
      const matchesQuery = !normalizedQuery || [fullName(patient), patient.email, patient.patientId, patient.contactNumber]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
      const normalizedStatus = patientDisplayStatus(patient).toLowerCase()
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
      const matchesGender = genderFilter === 'all' || patient.gender === genderFilter
      const matchesRegistrationDate = !registrationDateFilter || (patient.createdAt || '').slice(0, 10) === registrationDateFilter
      return matchesQuery && matchesStatus && matchesGender && matchesRegistrationDate
    })
  }, [genderFilter, patients, query, registrationDateFilter, statusFilter])

  const pageSize = 6
  const totalPages = Math.max(Math.ceil(filteredPatients.length / pageSize), 1)
  const visiblePatients = filteredPatients.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    queueMicrotask(() => setPage(1))
  }, [genderFilter, query, registrationDateFilter, statusFilter])

  const selectedAppointments = useMemo(
    () => appointments.filter((appointment) => {
      if (!selectedPatient) return false
      return appointment.email === selectedPatient.email || appointment.patientName === fullName(selectedPatient)
    }),
    [appointments, selectedPatient],
  )

  const selectedRecords = useMemo(
    () => records.filter((record) => {
      if (!selectedPatient) return false
      const patientId = String(record.patient?._id || record.patient?.id || record.patient || '')
      const targetId = String(selectedPatient._id || selectedPatient.id || '')
      const pName = fullName(selectedPatient).trim().toLowerCase()
      const rName = (record.patientName || '').trim().toLowerCase()
      return (patientId && targetId && patientId === targetId) || (pName && rName && pName === rName)
    }),
    [records, selectedPatient],
  )

  useEffect(() => {
    setSelectedRecord(null)
    if (!selectedPatient?._id && !selectedPatient?.id) return
    let isMounted = true
    const patientId = selectedPatient._id || selectedPatient.id
    fdmstApi.getTreatmentRecords({ patient: patientId, limit: 100 })
      .then((res) => {
        if (!isMounted || !res?.data) return
        setRecords((prev) => {
          const map = new Map(prev.map((r) => [String(r._id || r.id), r]))
          res.data.forEach((r) => {
            const id = String(r._id || r.id)
            map.set(id, { ...map.get(id), ...r, _id: r._id || r.id })
          })
          return Array.from(map.values())
        })
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [selectedPatient])

  const combinedPatientToothColors = useMemo(() => {
    const combined = {}
    selectedRecords.forEach((record) => {
      if (record.recordType === 'clinical_note') return
      const map = record.toothColorMap instanceof Map
        ? Object.fromEntries(record.toothColorMap)
        : (record.toothColorMap || {})
      Object.assign(combined, map)
    })
    return combined
  }, [selectedRecords])

  const patientTreatments = useMemo(
    () => selectedRecords.filter((item) => item.recordType !== 'clinical_note'),
    [selectedRecords],
  )

  const resetForm = () => {
    setForm({
      ...initialForm,
      assignedDentist: dentists[0]?.id || '',
      assignedDentistName: dentists[0]?.name || '',
    })
    setEditingId('')
    setFieldErrors({})
  }

  const openCreate = () => {
    resetForm()
    setIsDrawerOpen(true)
  }

  const closeDrawer = () => {
    resetForm()
    setIsDrawerOpen(false)
    if (quickCreate) onClose?.()
  }

  const closeConfirmation = () => {
    setAdminPassword('')
    setConfirmation(initialConfirmation)
  }

  const openConfirmation = (nextConfirmation) => {
    setAdminPassword('')
    setConfirmation(nextConfirmation)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = ['contactNumber', 'emergencyContactNumber', 'guardianContactNumber'].includes(name) ? digitsOnly(value) : value
    if (name === 'assignedDentist') {
      const dentist = dentists.find((item) => String(item.id) === value)
      setForm((current) => ({ ...current, assignedDentist: value, assignedDentistName: dentist?.name || '' }))
      return
    }
    setForm((current) => ({ ...current, [name]: nextValue }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required.'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.'
    const mobileError = validateMobileNumber(form.contactNumber)
    if (mobileError) errors.contactNumber = mobileError
    const age = calculateAge(form.dateOfBirth)
    if (age !== null && age < 18) {
      if (!form.guardianName.trim()) errors.guardianName = 'Parent/guardian full name is required.'
      if (!form.guardianRelationship.trim()) errors.guardianRelationship = 'Relationship to patient is required.'
      const guardianMobileError = validateMobileNumber(form.guardianContactNumber, { required: true })
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    } else if (form.guardianContactNumber) {
      const guardianMobileError = validateMobileNumber(form.guardianContactNumber)
      if (guardianMobileError) errors.guardianContactNumber = guardianMobileError
    }
    if (form.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardianEmail)) errors.guardianEmail = 'Enter a valid guardian email address.'
    const emergencyMobileError = form.emergencyContactNumber ? validateMobileNumber(form.emergencyContactNumber) : ''
    if (emergencyMobileError) errors.emergencyContactNumber = emergencyMobileError
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    const payload = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      contactNumber: form.contactNumber.trim(),
      guardianName: form.guardianName.trim(),
      guardianRelationship: form.guardianRelationship.trim(),
      guardianContactNumber: form.guardianContactNumber.trim(),
      guardianEmail: form.guardianEmail.trim(),
      guardianAddress: form.guardianAddress.trim(),
      allergies: form.allergies.trim(),
      medicalConditions: form.medicalConditions.trim(),
      emergencyContact: form.emergencyContact.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactNumber: form.emergencyContactNumber.trim(),
      username: form.username.trim(),
    }

    openConfirmation({
      type: 'save',
      title: editingId ? 'Confirm Patient Update' : 'Confirm Patient Creation',
      description: editingId
        ? 'Re-enter your admin password to save changes to this patient profile.'
        : 'Re-enter your admin password to add this patient record.',
      submitLabel: editingId ? 'Verify and Save' : 'Verify and Add',
      payload,
      target: editingId,
    })
  }

  const applyEdit = (patient) => {
    setEditingId(patient._id)
    setForm({
      ...initialForm,
      ...patient,
      allergies: Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies || '',
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
      status: patient.status || 'active',
      medicalConditions: patient.medicalConditions || '',
      guardianName: patient.guardianName || '',
      guardianRelationship: patient.guardianRelationship || '',
      guardianContactNumber: patient.guardianContactNumber || '',
      guardianEmail: patient.guardianEmail || '',
      guardianAddress: patient.guardianAddress || '',
      emergencyContact: patient.emergencyContact || '',
      emergencyContactName: patient.emergencyContactName || '',
      emergencyContactNumber: patient.emergencyContactNumber || '',
      username: patient.username || '',
      assignedDentist: patient.assignedDentist || '',
      assignedDentistName: patient.assignedDentistName || '',
    })
    setIsDrawerOpen(true)
  }

  const handleViewPrompt = (patient) => {
    openConfirmation({
      type: 'view',
      title: 'Unlock Patient Details',
      description: `Re-enter your admin password to view detailed information for ${fullName(patient)}.`,
      submitLabel: 'Verify and View',
      target: patient,
    })
  }

  const handleEditPrompt = (patient) => {
    openConfirmation({
      type: 'edit_open',
      title: 'Unlock Patient Editing',
      description: `Re-enter your admin password to edit ${fullName(patient)}'s patient profile.`,
      submitLabel: 'Verify and Edit',
      target: patient,
    })
  }

  const handleToggleStatus = async (patient) => {
    const nextStatus = (patient.status || 'active') === 'active' ? 'inactive' : 'active'
    openConfirmation({
      type: 'status',
      title: nextStatus === 'active' ? 'Reactivate Patient Account' : 'Deactivate Patient Account',
      description:
        nextStatus === 'active'
          ? `Re-enter your admin password to reactivate ${fullName(patient)}.`
          : `Re-enter your admin password to deactivate ${fullName(patient)} and restrict patient access.`,
      submitLabel: nextStatus === 'active' ? 'Verify and Reactivate' : 'Verify and Deactivate',
      target: patient,
      payload: { status: nextStatus },
    })
  }

  const handleConfirmedAction = async (event) => {
    event.preventDefault()
    if (!adminPassword) {
      toast.error('Admin password is required.')
      return
    }

    setIsConfirming(true)

    try {
      if (confirmation.type === 'view') {
        await fdmstApi.verifyAdminPassword(adminPassword)
        setSelectedPatient(confirmation.target)
        toast.success('Patient details unlocked.')
        closeConfirmation()
        return
      }

      if (confirmation.type === 'edit_open') {
        await fdmstApi.verifyAdminPassword(adminPassword)
        applyEdit(confirmation.target)
        toast.success('Patient editing unlocked.')
        closeConfirmation()
        return
      }

      if (confirmation.type === 'status') {
        const saved = await fdmstApi.update('patients', confirmation.target._id, {
          ...confirmation.payload,
          adminPassword,
        })
        setPatients((current) => current.map((item) => item._id === saved._id ? saved : item))
        toast.success(`Patient ${confirmation.payload.status === 'active' ? 'reactivated' : 'deactivated'} successfully.`)
        closeConfirmation()
        return
      }

      if (confirmation.type === 'save') {
        const saved = confirmation.target
          ? await fdmstApi.update('patients', confirmation.target, { ...confirmation.payload, adminPassword })
          : await fdmstApi.create('patients', { ...confirmation.payload, adminPassword })

        toast.success(confirmation.target ? 'Patient updated successfully.' : 'Patient added successfully.')
        setPatients((current) => confirmation.target ? current.map((patient) => patient._id === saved._id ? saved : patient) : [saved, ...current])
        closeDrawer()
        closeConfirmation()
      }
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Admin password could not be verified. No changes were saved.')
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <main className={quickCreate ? '' : 'px-4 py-6 sm:px-6 lg:px-8'}>
      {!quickCreate ? <section className="flex min-h-[52rem] flex-col rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                <FaUsers className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Patient List</h2>
                <p className="mt-1 text-sm text-slate-500">View and manage all patient records.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-5 pb-4 xl:grid-cols-[minmax(360px,1fr)_auto] xl:items-center">
            <label className="relative block">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className={`${patientIconInputClass} h-11 pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, contact, or email..." />
            </label>
            <button type="button" onClick={openCreate} className="inline-flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white transition hover:bg-sky-900">
              <FaPlus className="h-4 w-4" aria-hidden="true" />
              Add Patient
            </button>
          </div>

          <div className="grid items-center gap-3 border-b border-slate-100 px-5 pb-5 md:grid-cols-2 xl:grid-cols-[170px_170px_190px_auto_auto]">
            <select className={`${patientInputClass} h-11`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option><option value="new">New</option><option value="verified">Verified</option><option value="inactive">Inactive</option>
            </select>
            <select className={`${patientInputClass} h-11`} value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
              <option value="all">All Genders</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <input className={`${patientInputClass} h-11`} type="date" value={registrationDateFilter} onChange={(event) => setRegistrationDateFilter(event.target.value)} aria-label="Registration date" />
            <button type="button" onClick={loadData} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-sky-950" aria-label="Refresh patients"><FaRedo className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => { setQuery(''); setStatusFilter('all'); setGenderFilter('all'); setRegistrationDateFilter('') }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-sky-950">
              <FaTimes className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
          </div>

          {isLoading ? <p className="p-6 text-sm text-slate-500">Loading patients...</p> : filteredPatients.length ? (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Patient ID</th><th className="px-5 py-4">Patient Name</th><th className="px-5 py-4">Contact Number</th><th className="px-5 py-4">Email</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Registration Date</th><th className="px-5 py-4 text-right">Actions</th></tr></thead>
                <tbody>
                  {visiblePatients.map((patient, index) => {
                    return (
                    <tr key={patient._id} className="border-t border-slate-100">
                      <td className="px-5 py-5"><div className="flex items-center gap-3"><PatientAvatar patient={patient} index={index} /><span className="text-xs font-medium text-slate-500">{patient.patientId || 'No Patient ID'}</span></div></td>
                      <td className="px-5 py-5 font-semibold text-sky-950">{fullName(patient)}</td>
                      <td className="px-5 py-5 text-slate-700">{patient.contactNumber || 'Not provided'}</td>
                      <td className="px-5 py-5 text-slate-700">{patient.email || 'Not provided'}</td>
                      <td className="px-5 py-5"><PatientStatusBadge status={patient.status} registrationStatus={patient.registrationStatus} /></td>
                      <td className="px-5 py-5 text-slate-600">{formatDateTime(patient.createdAt)}</td>

                      <td className="px-5 py-5"><div className="flex justify-end gap-2"><button type="button" onClick={() => handleViewPrompt(patient)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label={`View ${fullName(patient)}`}><FaEye /></button><button type="button" onClick={() => handleEditPrompt(patient)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-950 transition hover:bg-sky-100" aria-label={`Edit ${fullName(patient)}`}><FaEdit /></button><button type="button" onClick={() => handleToggleStatus(patient)} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${(patient.status || 'active') === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`} aria-label={`Change status for ${fullName(patient)}`}><FaPowerOff /></button></div></td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 px-5 py-5 text-sm font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredPatients.length)} of {filteredPatients.length} patients</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page === 1} className="h-10 rounded-xl border border-slate-200 px-3 text-sky-950 disabled:opacity-40">‹</button>
                {Array.from({ length: totalPages }).slice(0, 3).map((_, index) => {
                  const pageNumber = index + 1
                  return <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`h-10 min-w-10 rounded-xl border px-3 font-semibold ${page === pageNumber ? 'border-sky-950 bg-sky-950 text-white' : 'border-slate-200 text-sky-950'}`}>{pageNumber}</button>
                })}
                <button type="button" onClick={() => setPage((current) => Math.min(current + 1, totalPages))} disabled={page === totalPages} className="h-10 rounded-xl border border-slate-200 px-3 text-sky-950 disabled:opacity-40">›</button>
              </div>
            </div>
            </>
          ) : (
            <div className="m-5 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              No patient records match your filters.
            </div>
          )}
      </section> : null}

      {selectedPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex justify-between gap-4"><div><h2 className="text-2xl font-semibold text-sky-950">{fullName(selectedPatient)}</h2><p className="text-sm text-slate-500">{selectedPatient.email || 'No email'}</p></div><button type="button" onClick={() => setSelectedPatient(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close patient details"><FaTimes aria-hidden="true" /></button></div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl bg-slate-50 p-4">
                <h3 className="font-semibold text-sky-950">Personal Information</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p>Patient ID: {selectedPatient.patientId || '—'}</p>
                  <p>Date of Birth: {selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '—'}</p>
                  <p>Gender: {(selectedPatient.gender || 'prefer_not_to_say').replaceAll('_', ' ')}</p>
                  <p>Contact: {selectedPatient.contactNumber || '—'}</p>
                  <p>Address: {selectedPatient.address || '—'}</p>
                </div>
              </section>
              <section className="rounded-2xl bg-slate-50 p-4">
                <h3 className="font-semibold text-sky-950">Account Information</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p>Status: {patientDisplayStatus(selectedPatient)}</p>
                  <p>Verification: {selectedPatient.registrationStatus === 'verified' ? 'Verified' : 'New'}</p>
                  <p>Verified At: {selectedPatient.verifiedAt ? formatDateTime(selectedPatient.verifiedAt) : '—'}</p>
                  <p>Assigned Dentist: {selectedPatient.assignedDentistName || 'Unassigned'}</p>
                  <p>Registered: {formatDateTime(selectedPatient.createdAt)}</p>
                </div>
              </section>
              <section className="rounded-2xl bg-slate-50 p-4 lg:col-span-2">
                {selectedRecord ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-950 text-white">
                        <FaTooth className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-sky-950">
                          Viewing treatment from {selectedRecord.visitDate ? new Date(selectedRecord.visitDate).toLocaleDateString() : '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedRecord.procedure || selectedRecord.treatment || selectedRecord.servicePerformed || 'Treatment'} • {selectedRecord.dentistName || selectedRecord.createdByName || 'No dentist listed'}
                          {selectedRecord.toothNumber ? ` • Tooth #${selectedRecord.toothNumber}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRecord(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-sky-950"
                    >
                      <FaTimes className="h-3 w-3" /> Show All Records
                    </button>
                  </div>
                ) : null}
                <DentalChart
                  records={selectedRecord ? [selectedRecord] : selectedRecords}
                  selectedTooth={selectedRecord ? (selectedRecord.toothNumber || '') : ''}
                  initialToothColors={
                    selectedRecord
                      ? (selectedRecord.toothColorMap instanceof Map
                          ? Object.fromEntries(selectedRecord.toothColorMap)
                          : (selectedRecord.toothColorMap || {}))
                      : combinedPatientToothColors
                  }
                  interactive={false}
                  title={
                    selectedRecord
                      ? `Dental Diagram — ${fullName(selectedPatient)} (${selectedRecord.visitDate ? new Date(selectedRecord.visitDate).toLocaleDateString() : 'Record'})`
                      : `Dental Odontogram — ${fullName(selectedPatient)}`
                  }
                />
              </section>
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Appointment History</h3>{selectedAppointments.length ? selectedAppointments.map((item) => <p key={item.id} className="mt-2 text-sm text-slate-600">{new Date(item.appointmentDate).toLocaleDateString()} • {item.service} • {item.status}</p>) : <p className="mt-3 text-sm text-slate-500">No appointments found.</p>}</section>
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Clinical Notes</h3>{selectedRecords.filter((item) => item.recordType === 'clinical_note' || item.clinicalNotes).length ? selectedRecords.filter((item) => item.recordType === 'clinical_note' || item.clinicalNotes).map((item) => <p key={item._id} className="mt-2 text-sm text-slate-600">{new Date(item.visitDate || item.createdAt).toLocaleDateString()} • {item.noteType || 'Clinical Note'} • {item.createdByName || item.dentistName || 'Provider'}</p>) : <p className="mt-3 text-sm text-slate-500">No clinical notes found.</p>}</section>
              <section className="rounded-2xl bg-slate-50 p-4 lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/80 pb-3">
                  <div>
                    <h3 className="font-semibold text-sky-950">Treatment Records</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Click any record below to show its treated teeth and diagram colors on the chart above.
                    </p>
                  </div>
                  {selectedRecord ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRecord(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
                    >
                      <FaTimes className="h-3 w-3" /> Reset View
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2.5">
                  {patientTreatments.length ? (
                    patientTreatments.map((item) => {
                      const isActive = (selectedRecord?._id && selectedRecord._id === item._id) || (selectedRecord?.id && selectedRecord.id === item.id)
                      const dateStr = item.visitDate ? new Date(item.visitDate).toLocaleDateString() : (item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—')
                      const procedureStr = item.procedure || item.treatment || item.servicePerformed || 'Treatment'
                      const dentistStr = item.dentistName || item.createdByName || 'No dentist listed'

                      return (
                        <div
                          key={item._id || item.id}
                          onClick={() => setSelectedRecord(isActive ? null : item)}
                          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition cursor-pointer ${
                            isActive
                              ? 'border-sky-500 bg-sky-50/90 ring-2 ring-sky-300 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                                isActive
                                  ? 'bg-sky-950 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-500 group-hover:bg-sky-100 group-hover:text-sky-900'
                              }`}
                            >
                              <FaTooth className="h-4 w-4" />
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-sky-950">{dateStr}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-sm font-semibold text-slate-800">{procedureStr}</span>
                                {item.treatmentStatus ? (
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    item.treatmentStatus === 'completed'
                                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                                  }`}>
                                    {item.treatmentStatus.replaceAll('_', ' ')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                <span>Dentist: {dentistStr}</span>
                                {item.toothNumber ? (
                                  <>
                                    <span>•</span>
                                    <span className="font-semibold text-sky-900">Teeth: #{item.toothNumber}</span>
                                  </>
                                ) : null}
                                {item.materialsUsed ? (
                                  <>
                                    <span>•</span>
                                    <span>Materials: {item.materialsUsed}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-950 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                                <FaEye className="h-3 w-3" /> Showing on Diagram
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:text-sky-950">
                                <FaEye className="h-3 w-3 text-slate-400 group-hover:text-sky-700" /> View on Diagram
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No dental records found.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {isDrawerOpen ? (
        <div className={quickCreate ? 'fixed inset-0 z-50 flex items-center justify-center p-4' : 'fixed inset-0 z-50'}>
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeDrawer} aria-label="Close patient drawer" />
          <aside role="dialog" aria-modal="true" aria-label={editingId ? 'Edit Patient' : 'Add Patient'} className={quickCreate ? 'relative flex h-[92vh] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl' : 'absolute right-0 top-0 flex h-full w-full max-w-xl min-w-0 flex-col bg-white shadow-2xl'}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Patients</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">{editingId ? 'Edit Patient' : 'Add Patient'}</h2>
                <p className="mt-1 text-sm text-slate-500">Patient account changes require admin password verification.</p>
              </div>
              <button type="button" onClick={closeDrawer} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close drawer">
                <FaTimes />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
                <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold leading-6 text-blue-800 sm:col-span-2">
                  <FaShieldAlt className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>Sensitive patient changes require admin password verification before saving.</p>
                </div>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  First Name
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="firstName" value={form.firstName} onChange={handleChange} placeholder="Enter first name" required />
                  </IconField>
                  {fieldErrors.firstName ? <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Last Name
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="lastName" value={form.lastName} onChange={handleChange} placeholder="Enter last name" required />
                  </IconField>
                  {fieldErrors.lastName ? <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Birth Date
                  <IconField icon={FaCalendarAlt}>
                    <input className={patientIconInputClass} name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Gender
                  <IconField icon={FaVenusMars}>
                    <select className={patientIconInputClass} name="gender" value={form.gender} onChange={handleChange}>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </IconField>
                </label>
                {(() => {
	                  const age = calculateAge(form.dateOfBirth)
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
	                          <IconField icon={FaUser}>
	                            <input className={patientIconInputClass} name="guardianName" value={form.guardianName || ''} onChange={handleChange} placeholder="Parent or legal guardian full name" required />
	                          </IconField>
	                          {fieldErrors.guardianName ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianName}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Relationship to Patient
	                          <select className={patientInputClass} name="guardianRelationship" value={form.guardianRelationship || ''} onChange={handleChange} required>
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
	                          <IconField icon={FaPhone}>
	                            <input className={patientIconInputClass} name="guardianContactNumber" inputMode="numeric" maxLength={11} value={form.guardianContactNumber || ''} onChange={handleChange} placeholder="09XXXXXXXXX" required />
	                          </IconField>
	                          {fieldErrors.guardianContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianContactNumber}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
	                          Email Address (if applicable)
	                          <IconField icon={FaEnvelope}>
	                            <input className={patientIconInputClass} type="email" name="guardianEmail" value={form.guardianEmail || ''} onChange={handleChange} placeholder="guardian@email.com" />
	                          </IconField>
	                          {fieldErrors.guardianEmail ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianEmail}</span> : null}
	                        </label>
	                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
	                          Home Address (optional)
	                          <textarea className={patientTextareaClass} name="guardianAddress" value={form.guardianAddress || ''} onChange={handleChange} placeholder="Leave blank if same as patient address" />
	                        </label>
	                      </div>
	                    </section>
	                  ) : null
	                })()}
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Email
                  <IconField icon={FaEnvelope}>
                    <input className={patientIconInputClass} type="email" name="email" value={form.email} onChange={handleChange} placeholder="Enter email address" />
                  </IconField>
                  {fieldErrors.email ? <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Mobile Number
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="contactNumber" inputMode="numeric" maxLength={11} value={form.contactNumber} onChange={handleChange} placeholder="09XXXXXXXXX" />
                  </IconField>
                  {fieldErrors.contactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Address
                  <IconField icon={FaMapMarkerAlt}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="address" value={form.address || ''} onChange={handleChange} placeholder="Enter full address" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Assigned Dentist
                  <IconField icon={FaUserMd}>
                    <input className={`${patientIconInputClass} bg-slate-50`} value={form.assignedDentistName || dentists[0]?.name || 'Clinic dentist'} readOnly />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Allergies
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="allergies" value={form.allergies || ''} onChange={handleChange} placeholder="Enter allergies (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Medical Conditions
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="medicalConditions" value={form.medicalConditions || ''} onChange={handleChange} placeholder="Enter medical conditions (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Medical History
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="medicalHistory" value={form.medicalHistory || ''} onChange={handleChange} placeholder="Enter medical history (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Dental History
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="dentalHistory" value={form.dentalHistory || ''} onChange={handleChange} placeholder="Enter dental history (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="emergencyContact" value={form.emergencyContact || ''} onChange={handleChange} placeholder="Name and relationship" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact Number
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="emergencyContactNumber" inputMode="numeric" maxLength={11} value={form.emergencyContactNumber || ''} onChange={handleChange} placeholder="09XXXXXXXXX" />
                  </IconField>
                  {fieldErrors.emergencyContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.emergencyContactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Username
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="username" value={form.username || ''} onChange={handleChange} placeholder="Optional account username" />
                  </IconField>
                  {fieldErrors.username ? <span className="text-xs font-medium text-red-600">{fieldErrors.username}</span> : null}
                </label>
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-white px-5 py-5 sm:flex sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeDrawer} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-900">
                  {editingId ? 'Save Patient' : 'Create Patient'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {confirmation.type ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form onSubmit={handleConfirmedAction} className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <FaShieldAlt className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-sky-950">{confirmation.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{confirmation.description}</p>
                </div>
              </div>
              <button type="button" onClick={closeConfirmation} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close confirmation">
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6">
              <PasswordField
                inputClassName={inputClass}
                label="Admin Password"
                name="adminPassword"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeConfirmation} className="h-12 rounded-2xl border border-gray-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={isConfirming} className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60">
                {isConfirming ? 'Verifying...' : confirmation.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default AdminPatientsPage
