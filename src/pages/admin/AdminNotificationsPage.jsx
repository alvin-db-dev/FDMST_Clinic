import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBell,
  FaBullhorn,
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaStar,
  FaTrash,
  FaTimes,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

function formatRelativeTime(value) {
  if (!value) return 'Just now'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'

  const minutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function getNotificationIcon(notification) {
  const text = `${notification?.type || ''} ${notification?.title || ''} ${notification?.message || ''}`.toLowerCase()

  if (text.includes('cancel')) return FaTimes
  if (notification?.type === 'feedback' || text.includes('feedback')) return FaStar
  if (text.includes('confirm') || text.includes('completed')) return FaCheckCircle
  if (text.includes('appointment') || text.includes('reminder')) return FaCalendarCheck
  if (text.includes('inventory') || text.includes('alert')) return FaExclamationCircle
  return FaBullhorn
}

function getRoleBasePath(role) {
  if (role === 'patient') return '/patient'
  if (role === 'staff') return '/staff'
  return '/admin'
}

function getNotificationDestination(notification, role = 'admin') {
  const basePath = getRoleBasePath(role)

  if (notification.type === 'promotion' || notification.metadata?.target === 'promotion') {
    const promotionId = notification.metadata?.promotionId
    return `${basePath}/promotions${promotionId ? `?promotion=${encodeURIComponent(promotionId)}` : ''}`
  }

  if (notification.type === 'appointment' || /appointment/i.test(`${notification.title || ''} ${notification.message || ''}`)) {
    return role === 'patient' ? `${basePath}` : `${basePath}/appointments`
  }

  if (notification.type === 'inventory' || /inventory|stock/i.test(`${notification.title || ''} ${notification.message || ''}`)) {
    return `${basePath}/inventory`
  }

  if (role === 'admin' && (notification.type === 'feedback' || notification.metadata?.target === 'feedback')) {
    const feedbackId = notification.metadata?.feedbackId
    return `${basePath}/feedback${feedbackId ? `?feedback=${encodeURIComponent(feedbackId)}` : ''}`
  }

  return ''
}

function AdminNotificationsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = authStorage.getUser()
  const role = user?.role || 'admin'
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState('all')

  const loadNotifications = useCallback(() => {
    let isActive = true
    setIsLoading(true)
    setErrorMessage('')

    fdmstApi.getNotifications()
      .then((response) => {
        if (!isActive) return
        setNotifications(Array.isArray(response.data) ? response.data : [])
        setUnreadCount(Number(response.unreadCount) || 0)
      })
      .catch((error) => {
        if (!isActive) return
        setNotifications([])
        setUnreadCount(0)
        setErrorMessage(error.message || 'Unable to load notifications.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let cleanup
    queueMicrotask(() => {
      cleanup = loadNotifications()
    })
    return () => cleanup?.()
  }, [loadNotifications])

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter((notification) => !notification.isRead)
    if (filter === 'read') return notifications.filter((notification) => notification.isRead)
    return notifications
  }, [filter, notifications])

  const handleMarkAllRead = async () => {
    try {
      await fdmstApi.markNotificationsRead()
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })))
      setUnreadCount(0)
      toast.success('Notifications marked as read.')
    } catch (error) {
      toast.error(error.message || 'Unable to update notifications.')
    }
  }

  const handleOpenNotification = async (notification) => {
    if (!notification) return

    try {
      await fdmstApi.markNotificationRead(notification.id)
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item),
      )
      if (!notification.isRead) {
        setUnreadCount((current) => Math.max(current - 1, 0))
      }
    } catch (error) {
      toast.error(error.message || 'Unable to update notification.')
    }

    const destination = getNotificationDestination(notification, role)
    if (destination) navigate(destination)
  }

  const handleClearNotifications = async () => {
    if (!notifications.length || !window.confirm('Clear all notifications? This cannot be undone.')) return
    try {
      await fdmstApi.clearNotifications()
      setNotifications([])
      setUnreadCount(0)
      toast.success('Notifications cleared.')
    } catch (error) {
      toast.error(error.message || 'Unable to clear notifications.')
    }
  }

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Latest Notifications</h2>
              <p className="mt-1 text-sm text-slate-500">
                {unreadCount} unread update{unreadCount === 1 ? '' : 's'} from appointments, alerts, and clinic activity.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {['all', 'unread', 'read'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={`h-10 rounded-xl px-4 text-sm font-semibold capitalize transition ${
                      filter === item ? 'bg-sky-950 text-white shadow-sm' : 'text-slate-500 hover:text-sky-950'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={!notifications.length || !unreadCount}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaCheckCircle className="h-4 w-4" aria-hidden="true" />
                Mark All as Read
              </button>
              <button
                type="button"
                onClick={handleClearNotifications}
                disabled={!notifications.length}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaTrash className="h-4 w-4" aria-hidden="true" />
                Clear Notifications
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Loading notifications...
            </div>
          ) : errorMessage ? (
            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          ) : filteredNotifications.length ? (
            <div className="mt-6 grid gap-3">
              {filteredNotifications.map((notification) => {
                const Icon = getNotificationIcon(notification)

                return (
                  <div
                    key={notification.id}
                    className={`relative w-full rounded-2xl border transition hover:-translate-y-0.5 hover:shadow-sm ${
                      notification.isRead
                        ? 'border-slate-200 bg-white'
                        : 'border-sky-100 bg-sky-50'
                    }`}
                  >
                    <button type="button" onClick={() => handleOpenNotification(notification)} className="w-full p-4 text-left">
                    <div className="flex gap-4">
                      {notification.metadata?.promotionImageUrl ? (
                        <img
                          src={notification.metadata.promotionImageUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-slate-100"
                        />
                      ) : (
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                          notification.isRead
                            ? 'bg-slate-50 text-slate-500 ring-slate-100'
                            : 'bg-amber-50 text-amber-600 ring-amber-100'
                        }`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sky-950">{notification.title || 'Clinic update'}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{notification.message || 'No additional details.'}</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-400">
                            <FaClock className="h-3 w-3" aria-hidden="true" />
                            {formatRelativeTime(notification.createdAt || notification.scheduledFor)}
                          </span>
                        </div>
                      </div>
                    </div>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <FaBell className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-5 text-lg font-semibold text-sky-950">No notifications found</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Appointment requests, alerts, and clinic updates will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AdminNotificationsPage
