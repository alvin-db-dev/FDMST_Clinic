export const getRoleHomePath = (role) => {
  const normalizedRole = String(role || '').toLowerCase()
  if (normalizedRole === 'admin') return '/admin'
  if (normalizedRole === 'staff') return '/staff'
  return '/patient'
}

export const formatDate = (value) => {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const formatStatus = (status) => {
  if (!status) return '—'

  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
