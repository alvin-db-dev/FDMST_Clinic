// Production builds are served by the backend, so the API lives on the same domain.
const DEFAULT_API_URL = '/api'
const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
const API_BASE_URL = configuredApiUrl || (import.meta.env.DEV ? 'http://127.0.0.1:5050/api' : DEFAULT_API_URL)
export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '') || window.location.origin
const AUTH_TOKEN_KEY = 'fdmst_auth_token'
const AUTH_USER_KEY = 'fdmst_auth_user'
export const AUTH_CHANGED_EVENT = 'fdmst-auth-changed'

export const authStorage = {
  saveSession({ token, user }) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    }

    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    }

    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  },
  clearSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  },
  getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  },
  getUser() {
    const storedUser = localStorage.getItem(AUTH_USER_KEY)

    if (!storedUser) {
      return null
    }

    try {
      return JSON.parse(storedUser)
    } catch {
      return null
    }
  },
  isAuthenticated() {
    return Boolean(authStorage.getToken())
  },
}

const describeHttpFailure = (response) => {
  const statusLabel = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`

  if ([502, 503, 504].includes(response.status)) {
    return `The server at ${API_BASE_URL} is unavailable (${statusLabel}). It may be starting up or down.`
  }

  if (response.status === 404) {
    return `The API was not found at ${response.url || API_BASE_URL} (${statusLabel}). Check that the API URL points to the backend.`
  }

  return `The server returned an error (${statusLabel}). Please try again.`
}

// fetch() only reports "Failed to fetch", so probe for the most likely cause.
const describeNetworkFailure = async () => {
  if (navigator.onLine === false) {
    return 'You appear to be offline. Check your internet connection and try again.'
  }

  if (window.location.protocol === 'https:' && API_BASE_URL.startsWith('http:')) {
    return `The browser blocked the request because this page uses HTTPS but the API (${API_BASE_URL}) uses HTTP. Serve the API over HTTPS or open the site over HTTP.`
  }

  try {
    // A no-cors request succeeds whenever the server is reachable, even if CORS would reject the real request.
    await fetch(`${API_BASE_URL}/health`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(8000) })
    return `The server at ${API_BASE_URL} is reachable but rejected requests from ${window.location.origin} (CORS). Add this origin to CLIENT_URL or CORS_ORIGINS on the backend.`
  } catch {
    return `Unable to reach the server at ${API_BASE_URL}. It may be down, restarting, or the address may be wrong.`
  }
}

const parseResponse = async (response) => {
  const text = await response.text()
  let data
  let isJson = true

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
    isJson = false
  }

  if (response.ok && !isJson) {
    const error = new Error(`The server at ${response.url || API_BASE_URL} returned an unexpected (non-JSON) response. Check that the API URL points to the backend.`)
    error.status = response.status
    throw error
  }

  if (!response.ok) {
    const error = new Error(data?.message || describeHttpFailure(response))
    error.status = response.status
    error.errors = data?.errors || {}
    error.retryAfterSeconds = data?.retryAfterSeconds
    error.nextAllowedAt = data?.nextAllowedAt
    error.otpExpiresAt = data?.otpExpiresAt
    throw error
  }

  return data
}

const request = async (path, options = {}) => {
  const token = authStorage.getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause

    const error = new Error(await describeNetworkFailure())
    error.cause = cause
    console.error(`Request to ${API_BASE_URL}${path} failed:`, error.message, cause)
    throw error
  }

  return parseResponse(response)
}

const getClinicalFile = async (path) => {
  const token = authStorage.getToken()
  const query = new URLSearchParams({ path })
  const response = await fetch(`${API_BASE_URL}/uploads/clinical-file-view?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const message = await response.json().then((data) => data?.message || '').catch(() => '')
    throw new Error(message || describeHttpFailure(response))
  }

  return response.blob()
}

export const fdmstApi = {
  getClinicalFile,
  health: () => request('/health'),
  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestRegistrationOtp: (payload) =>
    request('/auth/register/request-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  verifyRegistrationOtp: (payload) =>
    request('/auth/register/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestPasswordResetOtp: (payload) =>
    request('/auth/forgot-password/request-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetPasswordWithOtp: (payload) =>
    request('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: async (payload) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!data?.token || !data?.user) {
      throw new Error('The server returned an incomplete login response. Please try again.')
    }

    authStorage.saveSession(data)
    return data
  },
  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),
  getAdminDashboard: () => request('/dashboard/admin'),
  getPublicSettings: () => request('/public-settings'),
  getPublicFeedback: () => request('/feedback/public'),
  getAdminAnalytics: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item) params.append(key, item)
        })
      } else if (value) {
        params.set(key, value)
      }
    })
    const query = params.toString()
    return request(`/dashboard/admin/analytics${query ? `?${query}` : ''}`)
  },
  getAdminAnalyticsPrediction: ({ date, service = '' }) => {
    const params = new URLSearchParams({ date })
    if (service) params.set('service', service)
    return request(`/dashboard/admin/analytics/prediction?${params}`)
  },
  getAdminServiceComparison: ({ period, value, compareValue }) => {
    const params = new URLSearchParams({ period, value, compareValue })
    return request(`/dashboard/admin/analytics/service-comparison?${params}`)
  },
  getStaffDashboard: () => request('/dashboard/staff'),
  getProfile: () => request('/users/me'),
  getUserSettings: () => request('/users/me/settings'),
  updateUserSettings: (payload) =>
    request('/users/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  logReportAction: (payload) =>
    request('/users/me/report-action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getNotifications: () => request('/users/me/notifications'),
  markNotificationsRead: () =>
    request('/users/me/notifications/read', {
      method: 'PATCH',
    }),
  markNotificationRead: (id) =>
    request(`/users/me/notifications/${id}/read`, {
      method: 'PATCH',
    }),
  clearNotifications: () =>
    request('/users/me/notifications', {
      method: 'DELETE',
    }),
  getMessageRecipients: () => request('/messages/recipients'),
  getConversations: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    const query = params.toString()
    return request(`/messages/conversations${query ? `?${query}` : ''}`)
  },
  startConversation: (payload = {}) =>
    request('/messages/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getConversationMessages: (id) => request(`/messages/conversations/${id}/messages`),
  sendConversationMessage: (id, payload) =>
    request(`/messages/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  markConversationRead: (id) =>
    request(`/messages/conversations/${id}/read`, {
      method: 'PATCH',
    }),
  deleteConversationMessage: (conversationId, messageId) =>
    request(`/messages/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
    }),
  deleteConversation: (id) =>
    request(`/messages/conversations/${id}`, {
      method: 'DELETE',
    }),
  archiveConversation: (id, archived = true) =>
    request(`/messages/conversations/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),
  uploadImage: (payload) =>
    request('/uploads/image', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadClinicalFile: (payload) =>
    request('/uploads/clinical-file', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteClinicalFile: (payload) =>
    request('/uploads/clinical-file', {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  uploadChatFile: (payload) =>
    request('/uploads/chat-file', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteChatFile: (payload) =>
    request('/uploads/chat-file', {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  updateProfile: async (payload) => {
    const data = await request('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    authStorage.saveSession(data)
    return data
  },
  updateProfilePhoto: async (profilePhoto) => {
    const data = await request('/users/me/profile-photo', {
      method: 'PATCH',
      body: JSON.stringify({ profilePhoto }),
    })

    authStorage.saveSession(data)
    return data
  },
  updatePassword: async (payload) => {
    const data = await request('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (data?.user) authStorage.saveSession({ user: data.user })
    return data
  },
  getClinicDentist: () => request('/appointments/clinic-dentist'),
  getAppointmentAvailability: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments/availability${query ? `?${query}` : ''}`)
  },
  bookAppointment: (payload) =>
    request('/appointments/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  validateAppointmentPromo: (payload) =>
    request('/appointments/promo/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMyAppointments: () => request('/appointments/my'),
  cancelMyAppointment: (id) =>
    request(`/appointments/my/${id}/cancel`, {
      method: 'PATCH',
    }),
  rescheduleMyAppointment: (id, payload) =>
    request(`/appointments/my/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getMyDentalRecords: () => request('/dentalrecords/my'),
  getMyFeedback: () => request('/feedback/my'),
  createFeedback: (payload) =>
    request('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAdminFeedback: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/feedback/admin${query ? `?${query}` : ''}`)
  },
  getAdminFeedbackById: (id) => request(`/feedback/admin/${id}`),
  updateFeedbackStatus: (id, status) =>
    request(`/feedback/admin/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  getMyCarePatients: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/patients/my-care${query ? `?${query}` : ''}`)
  },
  getMyCarePatient: (id) => request(`/patients/my-care/${id}`),
  getStaff: () => request('/users/staff'),
  verifyAdminPassword: (adminPassword) =>
    request('/users/admin/verify-password', {
      method: 'POST',
      body: JSON.stringify({ adminPassword }),
    }),
  createStaff: (payload) =>
    request('/users/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStaff: (id, payload) =>
    request(`/users/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateStaffStatus: (id, payload) =>
    request(`/users/staff/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAppointments: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments${query ? `?${query}` : ''}`)
  },
  getAppointment: (id) => request(`/appointments/${id}`),
  getProviderReportAppointments: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments/provider/reports${query ? `?${query}` : ''}`)
  },
  getProviderTreatmentRecords: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/provider/reports${query ? `?${query}` : ''}`)
  },
  getClinicalNotes: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/clinical-notes${query ? `?${query}` : ''}`)
  },
  createClinicalNote: (payload) =>
    request('/dentalrecords/clinical-notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateClinicalNote: (id, payload) =>
    request(`/dentalrecords/clinical-notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  viewClinicalNote: (id, filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/clinical-notes/${id}${query ? `?${query}` : ''}`)
  },
  exportClinicalNotes: (payload) =>
    request('/dentalrecords/clinical-notes/export', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTreatmentRecords: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/treatment-records${query ? `?${query}` : ''}`)
  },
  getTreatmentRecord: (id) => request(`/dentalrecords/treatment-records/${id}`),
  createTreatmentRecord: (payload) =>
    request('/dentalrecords/treatment-records', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTreatmentRecord: (id, payload) =>
    request(`/dentalrecords/treatment-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  viewTreatmentRecord: (id, filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/treatment-records/${id}${query ? `?${query}` : ''}`)
  },
  exportTreatmentRecords: (payload) =>
    request('/dentalrecords/treatment-records/export', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAppointmentStatus: (id, payload) =>
    request(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(typeof payload === 'string' ? { status: payload } : payload),
    }),
  updateAppointmentNotes: (id, payload) =>
    request(`/appointments/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateAppointmentSchedule: (id, payload) =>
    request(`/appointments/${id}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  recordInventoryUsage: (id, payload) =>
    request(`/inventory/${id}/usage`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sellInventoryItem: (id, payload) =>
    request(`/inventory/${id}/sale`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adjustInventoryStock: (id, payload) =>
    request(`/inventory/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (resource) => request(`/${resource}`),
  getById: (resource, id) => request(`/${resource}/${id}`),
  create: (resource, payload) =>
    request(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (resource, id, payload) =>
    request(`/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (resource, id) =>
    request(`/${resource}/${id}`, {
      method: 'DELETE',
    }),
}

export { API_BASE_URL }
