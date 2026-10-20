
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  FaAddressCard,
  FaBirthdayCake,
  FaBriefcase,
  FaCamera,
  FaCheckCircle,
  FaClipboardList,
  FaDesktop,
  FaEnvelope,
  FaExclamationTriangle,
  FaHeart,
  FaIdBadge,
  FaKey,
  FaHistory,
  FaLock,
  FaMapMarkerAlt,
  FaNotesMedical,
  FaPills,
  FaPhoneAlt,
  FaRegCalendarAlt,
  FaSave,
  FaShieldAlt,
  FaSignInAlt,
  FaTimes,
  FaTrash,
  FaUser,
  FaUserEdit,
  FaUserMd,
  FaVenusMars,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import PasswordField from '../components/PasswordField.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { uploadImageFile } from '../utils/imageUpload.js'
import { digitsOnly, validateMobileNumber } from '../utils/validation.js'

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const emptyPasswordFields = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

function userToForm(user) {
  const patient = user?.patient || {}
  return {
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    contactNumber: user?.contactNumber || '',
    profilePhoto: user?.profilePhoto || '',
    recoveryEmail: user?.recoveryEmail || '',
    licenseNumber: user?.licenseNumber || '',
    specialization: user?.specialization || '',
    dateOfBirth: toDateInputValue(patient.dateOfBirth),
    guardianName: patient.guardianName || '',
    guardianRelationship: patient.guardianRelationship || '',
    guardianContactNumber: patient.guardianContactNumber || '',
    guardianEmail: patient.guardianEmail || '',
    guardianAddress: patient.guardianAddress || '',
    gender: patient.gender || '',
    address: patient.address || '',
    emergencyContactName: patient.emergencyContactName || '',
    emergencyContactRelationship: patient.emergencyContactRelationship || '',
    emergencyContactNumber: patient.emergencyContactNumber || '',
    alternateContactNumber: patient.alternateContactNumber || '',
    allergies: Array.isArray(patient.allergies) ? patient.allergies.join(', ') : '',
    medicalConditions: patient.medicalConditions || patient.medicalHistory || '',
    currentMedications: patient.currentMedications || '',
    additionalMedicalNotes: patient.additionalMedicalNotes || '',
    ...emptyPasswordFields,
  }
}

function getDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'FDMST User'
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

function getInitials(user) {
  return [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'FD'
}

function formatAccountStatus(status) {
  const labels = {
    active_admin: 'Active Admin',
    active_staff: 'Active Staff',
    inactive: 'Inactive',
    unverified_user: 'Pending Verification',
    verified_patient: 'Verified Patient',
  }

  return labels[status] || status || 'Not provided'
}

function formatDate(value) {
  if (!value) return 'Not provided'

  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return 'Not provided'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not provided'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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

function formatRelativeAge(value) {
  if (!value) return 'Not provided'

  const created = new Date(value)
  if (Number.isNaN(created.getTime())) return 'Not provided'

  const days = Math.max(Math.floor((Date.now() - created.getTime()) / 86400000), 0)
  if (days < 1) return 'Today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'}`
}

function getDeviceInfo() {
  const userAgent = navigator.userAgent || ''
  const browser = userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Safari') ? 'Safari' : userAgent.includes('Firefox') ? 'Firefox' : 'Current Browser'
  const os = userAgent.includes('Mac') ? 'macOS' : userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Linux') ? 'Linux' : 'Current Device'

  return { browser, os }
}

function DetailCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
  }

  return (
    <article className="flex h-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex min-h-20 w-full items-start gap-4">
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

function StatCard({ icon: Icon, label, value, tone = 'sky', caption }) {
  return (
    <article className="flex h-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex min-h-20 w-full items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-950'}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-semibold text-sky-950">{value}</p>
          {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
        </div>
      </div>
    </article>
  )
}

function getPasswordChecks(password, confirmation) {
  return [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', valid: /[a-z]/.test(password) },
    { label: 'One number', valid: /\d/.test(password) },
    { label: 'Passwords match', valid: Boolean(password) && password === confirmation },
  ]
}

function getPasswordStrength(password) {
  const score = getPasswordChecks(password, password).slice(0, 4).filter((item) => item.valid).length
  if (!password) return { label: 'No new password entered', width: '0%', color: 'bg-slate-200' }
  if (score <= 2) return { label: 'Weak', width: '35%', color: 'bg-red-500' }
  if (score === 3) return { label: 'Good', width: '70%', color: 'bg-amber-500' }
  return { label: 'Strong', width: '100%', color: 'bg-emerald-500' }
}

function ProfilePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const outletContext = useOutletContext()
  const layoutUser = outletContext?.user
  const setLayoutUser = outletContext?.setUser
  const [form, setForm] = useState(() => userToForm(layoutUser || authStorage.getUser()))
  const [isSaving, setIsSaving] = useState(false)
  const [isAdminProfileVerified, setIsAdminProfileVerified] = useState(false)
  const [profileAccessPassword, setProfileAccessPassword] = useState('')
  const [profileAccessError, setProfileAccessError] = useState('')
  const [isVerifyingProfileAccess, setIsVerifyingProfileAccess] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [loginHistoryPage, setLoginHistoryPage] = useState(1)
  const [patientAppointments, setPatientAppointments] = useState([])

  const user = useMemo(() => layoutUser || authStorage.getUser(), [layoutUser])
  const patient = user?.patient || {}
  const isAdmin = user?.role === 'admin'
  const isStaffProfile = user?.role === 'staff'
  const deviceInfo = useMemo(() => getDeviceInfo(), [])
  const loginHistory = user?.loginHistory || []
  const loginHistoryPageSize = 5
  const totalLoginHistoryPages = Math.max(Math.ceil(loginHistory.length / loginHistoryPageSize), 1)
  const paginatedLoginHistory = loginHistory.slice((loginHistoryPage - 1) * loginHistoryPageSize, loginHistoryPage * loginHistoryPageSize)
  const completedAppointments = useMemo(
    () => patientAppointments.filter((appointment) => appointment.status === 'completed'),
    [patientAppointments],
  )
  const lastCompletedAppointment = useMemo(
    () => [...completedAppointments].sort((a, b) => new Date(b.appointmentDate || 0) - new Date(a.appointmentDate || 0))[0],
    [completedAppointments],
  )
  const passwordChecks = useMemo(() => getPasswordChecks(form.newPassword, form.confirmPassword), [form.confirmPassword, form.newPassword])
  const passwordStrength = useMemo(() => getPasswordStrength(form.newPassword), [form.newPassword])

  const lockedFallbackPath = location.state?.from && location.state.from !== '/admin/profile'
    ? location.state.from
    : '/admin'

  useEffect(() => {
    if (!user) return

    let isActive = true

    queueMicrotask(() => {
      if (!isActive) return
      setForm((currentForm) => ({
        ...userToForm(user),
        profilePhoto: currentForm.profilePhoto || user.profilePhoto || '',
        ...emptyPasswordFields,
      }))
    })

    return () => {
      isActive = false
    }
  }, [user])

  useEffect(() => {
    if (user?.role !== 'patient') return undefined

    let isActive = true
    fdmstApi.getMyDentalRecords()
      .then((response) => {
        if (!isActive) return
        setPatientAppointments(Array.isArray(response.appointments) ? response.appointments : [])
      })
      .catch(() => {
        if (!isActive) return
        setPatientAppointments([])
      })

    return () => {
      isActive = false
    }
  }, [user?.role])

  useEffect(() => {
    if (!isAdmin || isAdminProfileVerified) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        toast.info('Admin profile remains locked.')
        navigate(lockedFallbackPath, { replace: true })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAdmin, isAdminProfileVerified, lockedFallbackPath, navigate, toast])

  const handleProfileAccessSubmit = async (event) => {
    event.preventDefault()
    setIsVerifyingProfileAccess(true)
    setProfileAccessError('')

    try {
      await fdmstApi.verifyAdminPassword(profileAccessPassword)
      setIsAdminProfileVerified(true)
      setProfileAccessPassword('')
      toast.success('Admin profile access verified.')
    } catch (error) {
      const message = error.message || 'Admin password could not be verified.'
      setProfileAccessError(message)
      toast.error(message)
    } finally {
      setIsVerifyingProfileAccess(false)
    }
  }

  const handleProfileAccessDismiss = () => {
    setProfileAccessPassword('')
    setProfileAccessError('')
    toast.info('Admin profile remains locked.')
    navigate(lockedFallbackPath, { replace: true })
  }

  const handleChange = useCallback((event) => {
    const { name, value } = event.target
    const nextValue = ['contactNumber', 'emergencyContactNumber', 'alternateContactNumber', 'guardianContactNumber'].includes(name)
      ? digitsOnly(value)
      : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
    }))
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }, [])

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0]
    setPhotoError('')

    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Use a JPG, PNG, or WebP image.')
      event.target.value = ''
      return
    }

    if (file.size > 550 * 1024) {
      setPhotoError('Use an image under 550 KB.')
      event.target.value = ''
      return
    }

    try {
      const imageUrl = await uploadImageFile(file, { folder: 'profiles', maxSizeBytes: 550 * 1024 })
      setForm((currentForm) => ({
        ...currentForm,
        profilePhoto: imageUrl,
      }))
      const response = await fdmstApi.updateProfilePhoto(imageUrl)
      if (response.user) {
        setLayoutUser?.(response.user)
        setForm((currentForm) => ({
          ...currentForm,
          ...userToForm(response.user),
          ...emptyPasswordFields,
        }))
      }
      toast.success(response.message || 'Profile photo updated successfully.')
    } catch (error) {
      setPhotoError(error.message || 'Unable to upload the selected image.')
      event.target.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    setPhotoError('')

    try {
      const response = await fdmstApi.updateProfilePhoto('')
      setForm((currentForm) => ({
        ...currentForm,
        profilePhoto: '',
      }))
      if (response.user) {
        setLayoutUser?.(response.user)
      }
      toast.success(response.message || 'Profile photo removed successfully.')
    } catch (error) {
      setPhotoError(error.message || 'Unable to remove profile photo.')
    }
  }

  const validateForm = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      return 'First name, last name, and email are required.'
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Enter a valid email address.'
    }

    if (user?.role === 'admin' && form.recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recoveryEmail.trim())) {
      setFieldErrors({ recoveryEmail: 'Enter a valid recovery email address.' })
      return 'Enter a valid recovery email address.'
    }

    const mobileError = validateMobileNumber(form.contactNumber)

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      return mobileError
    }

    if (user?.role === 'patient') {
      const age = calculateAge(form.dateOfBirth)
      if (age !== null && age < 18) {
        const guardianErrors = {}
        if (!form.guardianName.trim()) guardianErrors.guardianName = 'Parent/guardian full name is required.'
        if (!form.guardianRelationship.trim()) guardianErrors.guardianRelationship = 'Relationship to patient is required.'
        const guardianMobileError = validateMobileNumber(form.guardianContactNumber, { required: true })
        if (guardianMobileError) guardianErrors.guardianContactNumber = guardianMobileError
        if (Object.keys(guardianErrors).length > 0) {
          setFieldErrors(guardianErrors)
          return 'Complete the required parent/guardian information.'
        }
      } else if (form.guardianContactNumber) {
        const guardianMobileError = validateMobileNumber(form.guardianContactNumber)
        if (guardianMobileError) {
          setFieldErrors({ guardianContactNumber: guardianMobileError })
          return guardianMobileError
        }
      }

      if (form.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardianEmail.trim())) {
        setFieldErrors({ guardianEmail: 'Enter a valid guardian email address.' })
        return 'Enter a valid guardian email address.'
      }

      const hasEmergencyInfo = form.emergencyContactName || form.emergencyContactRelationship || form.emergencyContactNumber
      if (hasEmergencyInfo && (!form.emergencyContactName.trim() || !form.emergencyContactRelationship.trim() || !form.emergencyContactNumber.trim())) {
        setFieldErrors({ emergencyContact: 'Complete the emergency contact name, relationship, and contact number.' })
        return 'Complete the emergency contact name, relationship, and contact number.'
      }

      const emergencyError = form.emergencyContactNumber ? validateMobileNumber(form.emergencyContactNumber) : ''
      if (emergencyError) {
        setFieldErrors({ emergencyContactNumber: emergencyError })
        return emergencyError
      }

      const alternateError = form.alternateContactNumber ? validateMobileNumber(form.alternateContactNumber) : ''
      if (alternateError) {
        setFieldErrors({ alternateContactNumber: alternateError })
        return alternateError
      }
    }

    const wantsPasswordChange =
      form.currentPassword || form.newPassword || form.confirmPassword

    if (wantsPasswordChange) {
      if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
        return 'Fill in all password fields to change your password.'
      }

      if (form.newPassword.length < 8) {
        return 'New password must be at least 8 characters and include uppercase, lowercase, and number.'
      }

      if (!/[A-Z]/.test(form.newPassword) || !/[a-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
        return 'New password must be at least 8 characters and include uppercase, lowercase, and number.'
      }

      if (form.newPassword !== form.confirmPassword) {
        return 'New password and confirmation do not match.'
      }

      if (form.currentPassword === form.newPassword) {
        return 'New password must be different from your current password.'
      }
    }

    return ''
  }

  const handleCancelEdit = () => {
    setForm(userToForm(user))
    setFieldErrors({})
    setPhotoError('')
    setIsEditingProfile(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationError = validateForm()

    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)

    try {
      if (isStaffProfile && !window.confirm('Save changes to your profile?')) {
        setIsSaving(false)
        return
      }

      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        contactNumber: form.contactNumber.trim(),
        profilePhoto: form.profilePhoto,
      }

      if (user?.role === 'admin') {
        payload.recoveryEmail = form.recoveryEmail.trim()
      }

      if (user?.role === 'patient') {
        payload.dateOfBirth = form.dateOfBirth
        payload.guardianName = form.guardianName.trim()
        payload.guardianRelationship = form.guardianRelationship.trim()
        payload.guardianContactNumber = form.guardianContactNumber.trim()
        payload.guardianEmail = form.guardianEmail.trim()
        payload.guardianAddress = form.guardianAddress.trim()
        payload.gender = form.gender
        payload.address = form.address.trim()
        payload.emergencyContactName = form.emergencyContactName.trim()
        payload.emergencyContactRelationship = form.emergencyContactRelationship.trim()
        payload.emergencyContactNumber = form.emergencyContactNumber.trim()
        payload.alternateContactNumber = form.alternateContactNumber.trim()
        payload.allergies = form.allergies
        payload.medicalConditions = form.medicalConditions.trim()
        payload.currentMedications = form.currentMedications.trim()
        payload.additionalMedicalNotes = form.additionalMedicalNotes.trim()
      }

      if (form.newPassword) {
        payload.currentPassword = form.currentPassword
        payload.newPassword = form.newPassword
        payload.confirmPassword = form.confirmPassword
      }

      const response = await fdmstApi.updateProfile(payload)

      setForm((currentForm) => ({
        ...currentForm,
        ...emptyPasswordFields,
      }))

      if (response.user) {
        setLayoutUser?.(response.user)
      }

      setIsEditingProfile(false)
      setFieldErrors({})
      toast.success(response.message || 'Profile updated successfully.')
    } catch (saveError) {
      setFieldErrors(saveError.errors || {})
      toast.error(saveError.message || 'Failed to update profile.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isAdmin && !isAdminProfileVerified) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form
            className="w-full max-w-md animate-[fadeIn_180ms_ease-out] rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-2xl"
            onSubmit={handleProfileAccessSubmit}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <FaShieldAlt className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                    Admin Verification
                  </p>
                  <h2 className="text-xl font-semibold text-sky-950">Unlock Admin Profile</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleProfileAccessDismiss}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close admin profile unlock modal"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              Re-enter your admin password before viewing or updating administrator profile details.
            </p>

            <div className="mt-6">
              <PasswordField
                inputClassName={inputClass}
                label="Admin Password"
                name="adminProfilePassword"
                value={profileAccessPassword}
                onChange={(event) => {
                  setProfileAccessPassword(event.target.value)
                  setProfileAccessError('')
                }}
                autoComplete="current-password"
                required
              />
              {profileAccessError ? <p className="mt-2 text-xs font-medium text-red-600">{profileAccessError}</p> : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleProfileAccessDismiss}
                disabled={isVerifyingProfileAccess}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isVerifyingProfileAccess}
                className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isVerifyingProfileAccess ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      </main>
    )
  }

  if (isStaffProfile) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <section className="mb-8 overflow-hidden rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {form.profilePhoto ? (
                  <img src={form.profilePhoto} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-white/15" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-amber-300 ring-4 ring-white/15">
                    {getInitials(user)}
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Staff Profile</p>
                  <h2 className="mt-2 text-3xl font-semibold">{getDisplayName(user)}</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-sky-100 ring-1 ring-white/15">Staff</span>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-100 ring-1 ring-emerald-200/20">{formatAccountStatus(user?.accountStatus)}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50"
                >
                  <FaUserEdit className="h-4 w-4" aria-hidden="true" />
                  Edit Profile
                </button>
                <a href="#staff-password-section" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-300">
                  <FaLock className="h-4 w-4" aria-hidden="true" />
                  Change Password
                </a>
              </div>
            </div>
          </section>

          <form className="grid gap-6" onSubmit={handleSubmit}>
            <section className="grid gap-6 xl:grid-cols-[20rem_1fr]">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  {form.profilePhoto ? (
                    <img src={form.profilePhoto} alt="" className="h-32 w-32 rounded-full object-cover ring-4 ring-sky-50" />
                  ) : (
                    <span className="flex h-32 w-32 items-center justify-center rounded-full bg-sky-950 text-3xl font-semibold text-amber-400 ring-4 ring-sky-50">
                      {getInitials(user)}
                    </span>
                  )}
                  <h3 className="mt-4 text-lg font-semibold text-sky-950">{getDisplayName(user)}</h3>
                  <p className="mt-1 text-sm capitalize text-slate-500">{user?.role}</p>

                  <div className="mt-6 grid w-full gap-3">
                    <label className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 transition ${isEditingProfile ? 'cursor-pointer hover:border-sky-200 hover:bg-sky-100' : 'cursor-not-allowed opacity-60'}`}>
                      <FaCamera className="h-4 w-4" aria-hidden="true" />
                      Change Photo
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handlePhotoChange} disabled={!isEditingProfile} />
                    </label>

                    {form.profilePhoto ? (
                      <button
                        type="button"
                        disabled={!isEditingProfile}
	                        onClick={handleRemovePhoto}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FaTrash className="h-4 w-4" aria-hidden="true" />
                        Remove Photo
                      </button>
                    ) : null}
                  </div>
                  {photoError ? <p className="mt-3 text-sm font-medium text-red-600">{photoError}</p> : null}
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950"><FaUser /></span>
                    <div>
                      <h3 className="text-lg font-semibold text-sky-950">Personal Information</h3>
                      <p className="text-sm text-slate-500">Manage your name, contact details, and profile photo.</p>
                    </div>
                  </div>
                  {isEditingProfile ? (
                    <button type="button" onClick={handleCancelEdit} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                      <FaTimes className="h-3.5 w-3.5" /> Cancel
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    First Name
                    <input className={inputClass} name="firstName" value={form.firstName} onChange={handleChange} disabled={!isEditingProfile} required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Last Name
                    <input className={inputClass} name="lastName" value={form.lastName} onChange={handleChange} disabled={!isEditingProfile} required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Email Address
                    <input className={inputClass} type="email" name="email" value={form.email} onChange={handleChange} disabled={!isEditingProfile} required />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Contact Number
                    <input className={inputClass} type="tel" name="contactNumber" inputMode="numeric" maxLength={11} value={form.contactNumber} onChange={handleChange} disabled={!isEditingProfile} placeholder="09XXXXXXXXX" />
                    {fieldErrors.contactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span> : null}
                  </label>
                </div>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><FaBriefcase /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Professional Information</h3>
                    <p className="text-sm text-slate-500">Role and clinical credentials.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-5">
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Position
                    <input className={`${inputClass} bg-slate-50`} value="Staff" readOnly disabled />
                  </label>
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><FaIdBadge /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Account Information</h3>
                    <p className="text-sm text-slate-500">Read-only account identity details.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4">
                  <DetailCard icon={FaUser} label="Username" value={user?.username || user?.email} />
                  <DetailCard icon={FaIdBadge} label="Employee ID" value={user?.employeeId || `${String(user?.role || 'USR').toUpperCase()}-${String(user?.id || '').slice(-6).toUpperCase()}`} tone="amber" />
                  <DetailCard icon={FaBirthdayCake} label="Date Joined" value={formatDate(user?.createdAt)} tone="emerald" />
                </div>
              </article>
            </section>

            <section id="staff-password-section" className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><FaLock /></span>
                <div>
                  <h3 className="text-lg font-semibold text-sky-950">Change Password</h3>
                  <p className="text-sm text-slate-500">Use at least 8 characters with uppercase, lowercase, and number.</p>
                </div>
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-3">
                <PasswordField inputClassName={inputClass} label="Current Password" name="currentPassword" value={form.currentPassword} onChange={handleChange} autoComplete="current-password" />
                <PasswordField inputClassName={inputClass} label="New Password" name="newPassword" value={form.newPassword} onChange={handleChange} autoComplete="new-password" />
                <PasswordField inputClassName={inputClass} label="Confirm New Password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" />
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {isEditingProfile ? (
                <button type="button" onClick={handleCancelEdit} className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
              ) : null}
              <button type="submit" disabled={isSaving || (!isEditingProfile && !form.newPassword)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                <FaSave className="h-4 w-4" aria-hidden="true" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <section className="mt-8 rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950"><FaHistory /></span>
              <div>
                <h3 className="text-lg font-semibold text-sky-950">Login History</h3>
                <p className="text-sm text-slate-500">Recent account access records, newest first.</p>
              </div>
            </div>
            <div className="mt-5 overflow-auto rounded-2xl border border-gray-100">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Browser</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLoginHistory.length ? paginatedLoginHistory.map((entry) => (
                    <tr className="border-t border-gray-100" key={entry.id || `${entry.dateTime}-${entry.ipAddress}`}>
                      <td className="px-4 py-3 font-medium text-sky-950">{formatDateTime(entry.dateTime)}</td>
                      <td className="px-4 py-3">{entry.ipAddress}</td>
                      <td className="px-4 py-3">{entry.device}</td>
                      <td className="px-4 py-3">{entry.browser}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.status === 'Failed' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="5">No login history recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {loginHistory.length > loginHistoryPageSize ? (
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" disabled={loginHistoryPage === 1} onClick={() => setLoginHistoryPage((page) => Math.max(page - 1, 1))} className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-slate-600 disabled:opacity-50">Previous</button>
                <button type="button" disabled={loginHistoryPage === totalLoginHistoryPages} onClick={() => setLoginHistoryPage((page) => Math.min(page + 1, totalLoginHistoryPages))} className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-slate-600 disabled:opacity-50">Next</button>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 overflow-hidden rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">{isAdmin ? 'Administrator Profile' : 'Profile'}</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{isAdmin ? getDisplayName(user) : 'Account Overview'}</h2>
              <p className="mt-3 max-w-2xl text-sky-100">
                {isAdmin
                  ? 'Manage administrator identity, access details, security status, and operational shortcuts.'
                  : 'View your patient profile, contact details, account status, and security settings in one place.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                {isAdmin ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-sky-100 ring-1 ring-white/15">Administrator</span>
                ) : (
                  <>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-sky-100 ring-1 ring-white/15">
                      {patient.registrationStatus === 'verified' ? 'Verified Patient' : 'New Patient'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#profile-form"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50"
              >
                <FaUserEdit className="h-4 w-4" aria-hidden="true" />
                Edit Profile
              </a>
              <a
                href="#password-section"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-300"
              >
                <FaLock className="h-4 w-4" aria-hidden="true" />
                Change Password
              </a>
            </div>
          </div>
        </section>

        {isAdmin ? (
          <>
            <section className="mb-8 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailCard icon={FaUser} label="Full Name" value={getDisplayName(user)} />
              <DetailCard icon={FaShieldAlt} label="Role" value="Administrator" tone="emerald" />
              <DetailCard icon={FaEnvelope} label="Email" value={user?.email} />
              <DetailCard icon={FaPhoneAlt} label="Contact Number" value={user?.contactNumber} />
            </section>

            <section className="mb-8 grid auto-rows-fr gap-4 md:grid-cols-2">
              <StatCard icon={FaBirthdayCake} label="Account Age" value={formatRelativeAge(user?.createdAt)} caption="Since creation" tone="amber" />
              <StatCard icon={FaDesktop} label="Current Session" value="Active" caption={deviceInfo.browser} />
            </section>

            <section className="mb-8 grid gap-6">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950"><FaShieldAlt /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Security Center</h3>
                    <p className="text-sm text-slate-500">Password, login, and session health.</p>
                  </div>
                </div>
                <div className="mt-5 grid auto-rows-fr gap-4 md:grid-cols-3">
                  <StatCard icon={FaKey} label="Last Password Change" value={formatDate(user?.lastPasswordChangedAt)} />
                  <StatCard icon={FaSignInAlt} label="Last Login" value={formatDate(user?.lastLoginAt)} tone="emerald" />
                  <StatCard icon={FaExclamationTriangle} label="Failed Login Attempts" value={user?.failedLoginAttempts || 0} tone={user?.failedLoginAttempts ? 'rose' : 'emerald'} />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <a href="#password-section" className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-900">Change Password</a>
                  <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Login History</button>
                  <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-red-100 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50">Logout Other Devices</button>
                </div>
              </article>
            </section>

            <section className="mb-8 grid gap-6 xl:grid-cols-2">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-sky-950">Recent Activity</h3>
                <div className="mt-5 grid gap-3">
                  {user?.recentActivity?.length ? user.recentActivity.map((activity) => (
                    <div key={activity._id || `${activity.action}-${activity.createdAt}`} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                      <FaCheckCircle className="mt-1 h-4 w-4 text-emerald-600" />
                      <div><p className="font-semibold text-sky-950">{activity.action}</p><p className="text-xs text-slate-500">{activity.entityType} • {formatDate(activity.createdAt)}</p></div>
                    </div>
                  )) : <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No administrator activity has been recorded yet.</p>}
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-sky-950">Connected Devices</h3>
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-sky-950">Current Device</p>
                  <p className="mt-2 text-sm text-slate-500">Browser: {deviceInfo.browser}</p>
                  <p className="text-sm text-slate-500">Operating System: {deviceInfo.os}</p>
                  <p className="text-sm text-slate-500">IP Address: Not available</p>
                  <p className="text-sm text-slate-500">Last Active: Now</p>
                </div>
              </article>
            </section>
          </>
        ) : (
          <>
            <section className="mb-8">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950"><FaIdBadge /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Account Information</h3>
                    <p className="text-sm text-slate-500">Read-only account status and verification details.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <DetailCard icon={FaIdBadge} label="Patient ID" value={patient.patientId || user?.id} tone="amber" />
                  <DetailCard icon={FaRegCalendarAlt} label="Registration Date" value={formatDate(patient.createdAt || user?.createdAt)} />
                  <DetailCard icon={FaShieldAlt} label="Account Status" value={formatAccountStatus(user?.accountStatus)} tone="emerald" />
                  <DetailCard icon={FaCheckCircle} label="Verification Status" value={patient.registrationStatus === 'verified' ? 'Verified Patient' : 'New Patient'} tone={patient.registrationStatus === 'verified' ? 'emerald' : 'amber'} />
                  <DetailCard icon={FaHistory} label="Last Profile Update" value={formatDate(user?.updatedAt)} tone="slate" />
                </div>
              </article>
            </section>

            <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailCard icon={FaPhoneAlt} label="Contact Number" value={user?.contactNumber} />
              <DetailCard icon={FaEnvelope} label="Email Address" value={user?.email} />
              <DetailCard icon={FaBirthdayCake} label="Date of Birth" value={formatDate(patient.dateOfBirth)} tone="rose" />
              <DetailCard icon={FaVenusMars} label="Gender" value={formatGender(patient.gender)} tone="slate" />
              <DetailCard icon={FaMapMarkerAlt} label="Address" value={patient.address} />
              <DetailCard
                icon={FaAddressCard}
                label="Emergency Contact"
                value={[patient.emergencyContactName, patient.emergencyContactNumber].filter(Boolean).join(' - ')}
                tone="amber"
              />
            </section>

            <section className="mb-8 grid gap-6 xl:grid-cols-2">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><FaHeart /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Medical Information</h3>
                    <p className="text-sm text-slate-500">Visible only to authorized clinic care providers.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <DetailCard icon={FaExclamationTriangle} label="Allergies" value={patient.allergies?.length ? patient.allergies.join(', ') : 'None recorded'} tone="rose" />
                  <DetailCard icon={FaNotesMedical} label="Medical Conditions" value={patient.medicalConditions || patient.medicalHistory || 'None recorded'} />
                  <DetailCard icon={FaPills} label="Current Medications" value={patient.currentMedications || 'None recorded'} tone="amber" />
                  <DetailCard icon={FaClipboardList} label="Additional Notes" value={patient.additionalMedicalNotes || 'None recorded'} tone="slate" />
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950"><FaUserMd /></span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Dental Information Summary</h3>
                    <p className="text-sm text-slate-500">A quick summary. Full details stay in My Records.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <DetailCard icon={FaRegCalendarAlt} label="Last Visit Date" value={formatDate(lastCompletedAppointment?.appointmentDate)} />
                  <DetailCard icon={FaUser} label="Last Treating Dentist" value={lastCompletedAppointment?.dentistName || 'Not recorded'} tone="amber" />
                  <DetailCard icon={FaCheckCircle} label="Completed Treatments" value={completedAppointments.length} tone="emerald" />
                </div>
              </article>
            </section>

            <section className="mb-8">
              <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-sky-950">Profile Activity</h3>
                <div className="mt-5 grid gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="font-semibold text-sky-950">Account Created</p><p className="mt-1 text-slate-500">{formatDate(patient.createdAt || user?.createdAt)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="font-semibold text-sky-950">Last Profile Update</p><p className="mt-1 text-slate-500">{formatDate(user?.updatedAt)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="font-semibold text-sky-950">Last Password Change</p><p className="mt-1 text-slate-500">{formatDate(user?.lastPasswordChangedAt)}</p></div>
                </div>
              </article>
            </section>
          </>
        )}

        <form id="profile-form" className="grid items-start gap-6 xl:grid-cols-[20rem_1fr]" onSubmit={handleSubmit}>
          <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm xl:self-start">
            <div className="h-20 bg-sky-950" />
            <div className="-mt-14 flex flex-col items-center px-5 pb-5 text-center">
              {form.profilePhoto ? (
                <img
                  src={form.profilePhoto}
                  alt=""
                  className="h-28 w-28 rounded-full object-cover ring-4 ring-white"
                />
              ) : (
                <span className="flex h-28 w-28 items-center justify-center rounded-full bg-sky-950 text-3xl font-semibold text-amber-400 ring-4 ring-white">
                  {getInitials(user)}
                </span>
              )}

              <h3 className="mt-4 text-lg font-semibold leading-tight text-sky-950">{getDisplayName(user)}</h3>
              <p className="mt-1 text-sm capitalize text-slate-500">{user?.role || 'User'}</p>

              <div className="mt-5 grid w-full gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 transition hover:border-sky-200 hover:bg-sky-100">
                  <FaCamera className="h-4 w-4" aria-hidden="true" />
                  Change Photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={handlePhotoChange}
                  />
                </label>

                {form.profilePhoto ? (
                  <button
                    type="button"
	                    onClick={handleRemovePhoto}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <FaTrash className="h-4 w-4" aria-hidden="true" />
                    Remove Photo
                  </button>
                ) : null}
              </div>

              {photoError ? <p className="mt-3 text-sm font-medium text-red-600">{photoError}</p> : null}
              <p className="mt-4 text-xs leading-5 text-slate-400">JPG, PNG, or WebP under 550 KB.</p>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950">
                <FaUser className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-sky-950">Personal Information</h3>
                <p className="text-sm text-slate-500">Changes are saved to your account.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                First Name
                <input
                  className={inputClass}
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Last Name
                <input
                  className={inputClass}
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Email
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Phone Number
                <input
                  className={inputClass}
                  type="tel"
                  name="contactNumber"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.contactNumber}
                  onChange={handleChange}
                  placeholder="09XXXXXXXXX"
                />
                {fieldErrors.contactNumber ? (
                  <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span>
                ) : null}
              </label>
              {!isAdmin ? (
                <>
	                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
	                    Date of Birth
	                    <input
	                      className={inputClass}
	                      type="date"
                      name="dateOfBirth"
                      value={form.dateOfBirth}
	                      onChange={handleChange}
	                    />
	                  </label>
		                  {(() => {
		                    const age = calculateAge(form.dateOfBirth)
		                    return age !== null && age < 18 ? (
		                      <section className="grid gap-4 rounded-3xl border border-amber-100 bg-amber-50/70 p-5 sm:col-span-2">
		                        <div>
		                          <h3 className="text-base font-bold text-sky-950">Parent/Guardian Information</h3>
		                          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
		                            The parent/guardian will serve as the primary contact for this minor patient.
		                          </p>
		                        </div>
		                        <div className="grid gap-4 sm:grid-cols-2">
		                          <label className="grid gap-2 text-sm font-semibold text-slate-500">
		                            Parent/Guardian Full Name
		                            <input
		                              className={inputClass}
		                              type="text"
		                              name="guardianName"
		                              value={form.guardianName}
		                              onChange={handleChange}
		                              placeholder="Parent or legal guardian full name"
		                              required
		                            />
		                            {fieldErrors.guardianName ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianName}</span> : null}
		                          </label>
		                          <label className="grid gap-2 text-sm font-semibold text-slate-500">
		                            Relationship to Patient
		                            <select className={inputClass} name="guardianRelationship" value={form.guardianRelationship} onChange={handleChange} required>
		                              <option value="">Select relationship</option>
		                              <option value="Mother">Mother</option>
		                              <option value="Father">Father</option>
		                              <option value="Legal Guardian">Legal Guardian</option>
		                              <option value="Grandparent">Grandparent</option>
		                              <option value="Relative">Relative</option>
		                            </select>
		                            {fieldErrors.guardianRelationship ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianRelationship}</span> : null}
		                          </label>
		                          <label className="grid gap-2 text-sm font-semibold text-slate-500">
		                            Contact Number
		                            <input
		                              className={inputClass}
		                              type="tel"
		                              name="guardianContactNumber"
		                              inputMode="numeric"
		                              maxLength={11}
		                              value={form.guardianContactNumber}
		                              onChange={handleChange}
		                              placeholder="09XXXXXXXXX"
		                              required
		                            />
		                            {fieldErrors.guardianContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianContactNumber}</span> : null}
		                          </label>
		                          <label className="grid gap-2 text-sm font-semibold text-slate-500">
		                            Email Address (if applicable)
		                            <input
		                              className={inputClass}
		                              type="email"
		                              name="guardianEmail"
		                              value={form.guardianEmail}
		                              onChange={handleChange}
		                              placeholder="guardian@email.com"
		                            />
		                            {fieldErrors.guardianEmail ? <span className="text-xs font-medium text-red-600">{fieldErrors.guardianEmail}</span> : null}
		                          </label>
		                          <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
		                            Home Address (optional)
		                            <textarea
		                              className={`${inputClass} min-h-24 py-4`}
		                              name="guardianAddress"
		                              value={form.guardianAddress}
		                              onChange={handleChange}
		                              placeholder="Leave blank if same as patient address"
		                            />
		                          </label>
		                        </div>
		                      </section>
		                    ) : null
		                  })()}
	                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
	                    Gender
                    <select className={inputClass} name="gender" value={form.gender} onChange={handleChange}>
                      <option value="">Select gender</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
                    Address
                    <textarea
                      className={`${inputClass} min-h-28 py-4`}
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Enter your full address"
                    />
                  </label>
                </>
              ) : null}
              {isAdmin ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
                  Recovery Email
                  <input
                    className={inputClass}
                    type="email"
                    name="recoveryEmail"
                    value={form.recoveryEmail}
                    onChange={handleChange}
                    placeholder="recovery@example.com"
                  />
                  {fieldErrors.recoveryEmail ? (
                    <span className="text-xs font-medium text-red-600">{fieldErrors.recoveryEmail}</span>
                  ) : null}
                </label>
              ) : null}
            </div>

            {!isAdmin ? (
              <>
                <div className="mt-8 flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <FaAddressCard className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Emergency Contact</h3>
                    <p className="text-sm text-slate-500">Complete this section so the clinic can contact someone during urgent situations.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Emergency Contact Name
                    <input className={inputClass} name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} placeholder="Contact person" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Relationship
                    <input className={inputClass} name="emergencyContactRelationship" value={form.emergencyContactRelationship} onChange={handleChange} placeholder="Parent, spouse, sibling" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Contact Number
                    <input className={inputClass} type="tel" name="emergencyContactNumber" inputMode="numeric" maxLength={11} value={form.emergencyContactNumber} onChange={handleChange} placeholder="09XXXXXXXXX" />
                    {fieldErrors.emergencyContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.emergencyContactNumber}</span> : null}
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Alternate Contact Number
                    <input className={inputClass} type="tel" name="alternateContactNumber" inputMode="numeric" maxLength={11} value={form.alternateContactNumber} onChange={handleChange} placeholder="Optional" />
                    {fieldErrors.alternateContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.alternateContactNumber}</span> : null}
                  </label>
                  {fieldErrors.emergencyContact ? <p className="text-xs font-medium text-red-600 sm:col-span-2">{fieldErrors.emergencyContact}</p> : null}
                </div>

                <div className="mt-8 flex items-center gap-3 border-b border-gray-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                    <FaHeart className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-sky-950">Medical Information</h3>
                    <p className="text-sm text-slate-500">This helps authorized clinic providers prepare safer dental care.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Allergies
                    <input className={inputClass} name="allergies" value={form.allergies} onChange={handleChange} placeholder="Separate allergies with commas" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">
                    Current Medications
                    <input className={inputClass} name="currentMedications" value={form.currentMedications} onChange={handleChange} placeholder="Optional" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
                    Medical Conditions
                    <textarea className={`${inputClass} min-h-28 py-4`} name="medicalConditions" value={form.medicalConditions} onChange={handleChange} placeholder="Medical conditions, health concerns, or none" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500 sm:col-span-2">
                    Additional Medical Notes
                    <textarea className={`${inputClass} min-h-28 py-4`} name="additionalMedicalNotes" value={form.additionalMedicalNotes} onChange={handleChange} placeholder="Optional notes for clinic care providers" />
                  </label>
                </div>
              </>
            ) : null}

            <div id="password-section" className="mt-8 flex items-center gap-3 border-b border-gray-100 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <FaLock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-sky-950">Password</h3>
                <p className="text-sm text-slate-500">Leave blank to keep your current password.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              <PasswordField
                inputClassName={inputClass}
                label="Current Password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                autoComplete="current-password"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <PasswordField
                  inputClassName={inputClass}
                  label="New Password"
                  name="newPassword"
                  value={form.newPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <PasswordField
                  inputClassName={inputClass}
                  label="Confirm New Password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-sky-950">Password Strength</p>
                  <p className="text-xs font-semibold text-slate-500">{passwordStrength.label}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className={`h-full rounded-full transition-all ${passwordStrength.color}`} style={{ width: passwordStrength.width }} />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {passwordChecks.map((check) => (
                    <div key={check.label} className={`flex items-center gap-2 text-xs font-semibold ${check.valid ? 'text-emerald-700' : 'text-slate-500'}`}>
                      <FaCheckCircle className={`h-3.5 w-3.5 ${check.valid ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
                      {check.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FaSave className="h-4 w-4" aria-hidden="true" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </main>
  )
}

export default ProfilePage
