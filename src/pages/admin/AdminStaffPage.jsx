import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaEdit,
  FaEnvelope,
  FaPhone,
  FaPlus,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaTrashAlt,
  FaUser,
  FaUsers,
} from 'react-icons/fa'
import { FaTimes } from 'react-icons/fa'
import { useLocation, useNavigate } from 'react-router-dom'
import { fdmstApi } from '../../api/fdmstApi.js'
import PasswordField from '../../components/PasswordField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const iconInputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-12 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'staff',
  contactNumber: '',
}

const initialConfirmation = {
  action: '',
  title: '',
  description: '',
  submitLabel: '',
  target: null,
  status: '',
}

function formatRole() {
  return 'Staff'
}

function fullName(member) {
  return [member?.firstName, member?.lastName].filter(Boolean).join(' ') || 'Unnamed Staff'
}

function initials(member) {
  return [member?.firstName, member?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'

  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function StaffAvatar({ member, index = 0 }) {
  const colors = ['bg-sky-950', 'bg-violet-700', 'bg-emerald-600', 'bg-orange-600', 'bg-teal-700', 'bg-blue-700']

  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${colors[index % colors.length]}`}>
      {initials(member)}
    </span>
  )
}

function RoleBadge({ role }) {
  return (
    <span className="inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
      {formatRole(role)}
    </span>
  )
}

function StatusBadge({ status }) {
  const isActive = status === 'active'

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        isActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function IconField({ children, icon: Icon }) {
  return (
    <span className="relative block w-full">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {children}
    </span>
  )
}

function AdminStaffPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(initialForm)
  const [isAccessVerified, setIsAccessVerified] = useState(false)
  const [accessPassword, setAccessPassword] = useState('')
  const [accessError, setAccessError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [editingStaffId, setEditingStaffId] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmation, setConfirmation] = useState(initialConfirmation)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const isEditing = Boolean(editingStaffId)

  const sortedStaff = useMemo(
    () =>
      [...staff].sort((left, right) => {
        if (left.status !== right.status) return left.status === 'active' ? -1 : 1
        return `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`)
      }),
    [staff],
  )

  const filteredStaff = useMemo(
    () =>
      sortedStaff.filter((member) => {
        const searchText = [fullName(member), member.email, member.contactNumber, formatRole(member.role)].filter(Boolean).join(' ').toLowerCase()
        const matchesQuery = !query.trim() || searchText.includes(query.trim().toLowerCase())
        const matchesStatus = statusFilter === 'all' || (member.status || 'active') === statusFilter

        return matchesQuery && matchesStatus
      }),
    [query, sortedStaff, statusFilter],
  )
  const pageSize = 5
  const totalPages = Math.max(Math.ceil(filteredStaff.length / pageSize), 1)
  const visibleStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    Promise.resolve().then(() => setPage(1))
  }, [query, statusFilter])

  const loadStaff = useCallback(async () => {
    try {
      const response = await fdmstApi.getStaff()
      setStaff(response.data || [])
    } catch (loadError) {
      toast.error(loadError.message || 'Unable to load staff accounts right now.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const lockedFallbackPath = location.state?.from && location.state.from !== '/admin/staff'
    ? location.state.from
    : '/admin'

  useEffect(() => {
    if (!isAccessVerified) return

    Promise.resolve().then(loadStaff)
  }, [isAccessVerified, loadStaff])

  const handleAccessSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setAccessError('')

    try {
      await fdmstApi.verifyAdminPassword(accessPassword)
      setIsAccessVerified(true)
      setAccessPassword('')
      toast.success('Staff Management access verified.')
    } catch (accessVerifyError) {
      const message = accessVerifyError.message || 'Admin password could not be verified.'
      setAccessError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAccessDismiss = useCallback(() => {
    setAccessPassword('')
    setAccessError('')
    toast.info('Staff Management remains locked.')
    navigate(lockedFallbackPath, { replace: true })
  }, [lockedFallbackPath, navigate, toast])

  useEffect(() => {
    if (isAccessVerified) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleAccessDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleAccessDismiss, isAccessVerified])

  const resetForm = () => {
    setForm(initialForm)
    setEditingStaffId('')
    setFieldErrors({})
  }

  const openCreate = () => {
    resetForm()
    setIsDrawerOpen(true)
  }

  const closeDrawer = () => {
    resetForm()
    setIsDrawerOpen(false)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
    }))

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }

  const validateForm = () => {
    const nextErrors = {}

    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required.'
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required.'
    if (!form.email.trim()) nextErrors.email = 'Email is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const mobileError = validateMobileNumber(form.contactNumber)

    if (mobileError) {
      nextErrors.contactNumber = mobileError
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const openConfirmation = (nextConfirmation) => {
    setAdminPassword('')
    setConfirmation(nextConfirmation)
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    openConfirmation({
      action: isEditing ? 'update' : 'create',
      title: isEditing ? 'Confirm Staff Update' : 'Confirm Staff Creation',
	      description: isEditing
	        ? 'Re-enter your admin password to save changes to this staff account.'
	        : `Re-enter your admin password to create this ${formatRole(form.role).toLowerCase()} account and send a welcome email.`,
      submitLabel: isEditing ? 'Verify and Save' : 'Verify and Create',
      target: editingStaffId,
      status: '',
    })
  }

  const handleEdit = (member) => {
    setEditingStaffId(member.id)
    setForm({
	      firstName: member.firstName || '',
	      lastName: member.lastName || '',
	      email: member.email || '',
	      role: 'staff',
	      contactNumber: member.contactNumber || '',
    })
    setFieldErrors({})
    setIsDrawerOpen(true)
  }

  const handleStatusPrompt = (member) => {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active'

    openConfirmation({
      action: 'status',
      title: nextStatus === 'active' ? 'Activate Staff Account' : 'Deactivate Staff Account',
      description:
        nextStatus === 'active'
          ? `Re-enter your admin password to restore access for ${member.firstName} ${member.lastName}.`
          : `Re-enter your admin password to block portal access for ${member.firstName} ${member.lastName}.`,
      submitLabel: nextStatus === 'active' ? 'Verify and Activate' : 'Verify and Deactivate',
      target: member,
      status: nextStatus,
    })
  }

  const applyServerErrors = (error) => {
    setFieldErrors(error.errors || {})
    toast.error(error.message || 'Unable to save changes. Please review the form and try again.')
  }

  const handleConfirmedAction = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      let response

      if (confirmation.action === 'status') {
        response = await fdmstApi.updateStaffStatus(confirmation.target.id, {
          status: confirmation.status,
          adminPassword,
        })

        setStaff((currentStaff) =>
          currentStaff.map((member) =>
            member.id === response.user.id ? response.user : member,
          ),
        )
      } else if (confirmation.action === 'update') {
        response = await fdmstApi.updateStaff(editingStaffId, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          role: form.role,
          contactNumber: form.contactNumber,
          adminPassword,
        })

        setStaff((currentStaff) =>
          currentStaff.map((member) =>
            member.id === response.user.id ? response.user : member,
          ),
        )
        closeDrawer()
      } else {
        response = await fdmstApi.createStaff({
	          firstName: form.firstName.trim(),
	          lastName: form.lastName.trim(),
	          email: form.email.trim(),
	          role: form.role,
	          contactNumber: form.contactNumber,
          adminPassword,
        })

        setStaff((currentStaff) => [response.user, ...currentStaff])
        closeDrawer()
      }

      toast.success(response.message || 'Staff account updated successfully.')
      setAdminPassword('')
      setConfirmation(initialConfirmation)
    } catch (submitError) {
      applyServerErrors(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      {!isAccessVerified ? (
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800 shadow-sm">
          Staff Management is locked. Re-enter your admin password to continue.
        </div>
      ) : null}

      <section className={`flex min-h-[52rem] flex-col rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${isAccessVerified ? '' : 'pointer-events-none mt-6 opacity-35 blur-[1px]'}`}>
        <article className="flex min-h-0 flex-1 flex-col p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                <FaUsers className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Current Staff</h2>
                <p className="mt-1 text-sm text-slate-500">Activate, deactivate, and update staff access.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900"
            >
              <FaPlus className="h-4 w-4" aria-hidden="true" />
              Add Staff
            </button>
          </div>

          <div className="mt-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <label className="relative">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className={iconInputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff by name, email, or role..." />
            </label>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setStatusFilter('all')
              }}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-sky-950"
              aria-label="Clear staff filters"
            >
              <FaTimes className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {isLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading staff accounts...</p>
          ) : filteredStaff.length ? (
            <>
            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Mobile</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date Added</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStaff.map((member, index) => (
                    <tr key={member.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-5">
                        <div className="flex items-center gap-3">
                          <StaffAvatar member={member} index={index} />
                          <span className="font-semibold text-sky-950">{fullName(member)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{member.email}</td>
                      <td className="px-4 py-3 text-slate-700">{member.contactNumber || 'Not provided'}</td>
                      <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                      <td className="px-4 py-3">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(member.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(member)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-950 transition hover:bg-sky-50"
                            aria-label={`Edit ${fullName(member)}`}
                          >
                            <FaEdit className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusPrompt(member)}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                              member.status === 'active'
                                ? 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                            aria-label={`${member.status === 'active' ? 'Deactivate' : 'Activate'} ${fullName(member)}`}
                          >
                            {member.status === 'active' ? <FaTrashAlt className="h-4 w-4" aria-hidden="true" /> : <FaRedo className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="-mx-5 -mb-5 mt-auto flex flex-col gap-3 border-t border-slate-100 px-5 py-5 text-sm font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredStaff.length)} of {filteredStaff.length} staff</p>
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
            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              No staff accounts match your filters.
            </div>
          )}
        </article>
      </section>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeDrawer} aria-label="Close staff drawer" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Staff Management</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">
                  {isEditing ? 'Edit Staff Account' : 'Add Staff Account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Create and update staff portal access.</p>
              </div>
              <button type="button" onClick={closeDrawer} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close drawer">
                <FaTimes />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
                <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold leading-6 text-blue-800 sm:col-span-2">
                  <FaShieldAlt className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>Sensitive staff changes require admin password verification before saving.</p>
                </div>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  First Name
                  <IconField icon={FaUser}>
                    <input className={iconInputClass} name="firstName" value={form.firstName} onChange={handleChange} placeholder="Enter first name" required />
                  </IconField>
                  {fieldErrors.firstName ? <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span> : null}
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Last Name
                  <IconField icon={FaUser}>
                    <input className={iconInputClass} name="lastName" value={form.lastName} onChange={handleChange} placeholder="Enter last name" required />
                  </IconField>
                  {fieldErrors.lastName ? <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span> : null}
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Email
                  <IconField icon={FaEnvelope}>
                    <input className={iconInputClass} type="email" name="email" value={form.email} onChange={handleChange} placeholder="Enter email address" required />
                  </IconField>
                  {fieldErrors.email ? <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span> : null}
                </label>

                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Mobile Number
                  <IconField icon={FaPhone}>
                    <input className={iconInputClass} type="tel" name="contactNumber" inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX" value={form.contactNumber} onChange={handleChange} />
                  </IconField>
                  {fieldErrors.contactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span> : null}
                </label>

                {!isEditing ? (
                  <div className="flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-semibold leading-6 text-emerald-800 sm:col-span-2">
                    <FaEnvelope className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      A welcome email will be sent with the default password 12345678. The employee must create their own password on first login.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-white px-5 py-5 sm:flex sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeDrawer} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : isEditing ? 'Save Staff' : 'Create Staff'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {!isAccessVerified ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleAccessDismiss()
            }
          }}
        >
          <form
            className="w-full max-w-md animate-[fadeIn_180ms_ease-out] rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-2xl"
            onSubmit={handleAccessSubmit}
            onMouseDown={(event) => event.stopPropagation()}
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
                  <h2 className="text-xl font-semibold text-sky-950">Unlock Staff Management</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAccessDismiss}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close Staff Management unlock modal"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              Re-enter your admin password before viewing or managing staff accounts.
            </p>

            <div className="mt-6">
              <PasswordField
                inputClassName={inputClass}
                label="Admin Password"
                name="staffAccessPassword"
                value={accessPassword}
                onChange={(event) => {
                  setAccessPassword(event.target.value)
                  setAccessError('')
                }}
                autoComplete="current-password"
                required
              />
              {accessError ? <p className="mt-2 text-xs font-medium text-red-600">{accessError}</p> : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleAccessDismiss}
                disabled={isSubmitting}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmation.action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form
            className="w-full max-w-md rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-2xl"
            onSubmit={handleConfirmedAction}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <FaShieldAlt className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Admin Verification
                </p>
                <h2 className="text-xl font-semibold text-sky-950">{confirmation.title}</h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">{confirmation.description}</p>

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
              <button
                type="button"
                onClick={() => {
                  setConfirmation(initialConfirmation)
                  setAdminPassword('')
                }}
                disabled={isSubmitting}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying...' : confirmation.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default AdminStaffPage
