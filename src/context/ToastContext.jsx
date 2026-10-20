import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

const TOAST_DURATION_MS = 1500
const TOAST_FADE_MS = 300

const toastStyles = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
}

function ToastItem({ toast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-5 py-4 text-sm font-medium shadow-lg transition-all duration-300 ease-in-out ${
        toastStyles[toast.type] || toastStyles.info
      } ${toast.exiting ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100'}`}
    >
      {toast.message}
    </div>
  )
}

function ToastContainer({ toasts }) {
  if (!toasts.length) {
    return null
  }

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3 sm:right-6 sm:top-6"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const removeToast = useCallback((id) => {
    const timers = timersRef.current.get(id)

    if (timers) {
      clearTimeout(timers.fade)
      clearTimeout(timers.remove)
      timersRef.current.delete(id)
    }

    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))
  }, [])

  const startDismiss = useCallback(
    (id) => {
      setToasts((currentToasts) =>
        currentToasts.map((toast) =>
          toast.id === id ? { ...toast, exiting: true } : toast,
        ),
      )

      const removeTimer = setTimeout(() => {
        removeToast(id)
      }, TOAST_FADE_MS)

      const existingTimers = timersRef.current.get(id)

      if (existingTimers) {
        existingTimers.remove = removeTimer
      }
    },
    [removeToast],
  )

  const showToast = useCallback(
    (message, type = 'info', options = {}) => {
      if (!message) {
        return
      }

      const id = crypto.randomUUID()
      const duration = Number(options.duration) > 0 ? Number(options.duration) : TOAST_DURATION_MS

      setToasts((currentToasts) => [...currentToasts, { id, message, type, exiting: false }])

      const fadeTimer = setTimeout(() => {
        startDismiss(id)
      }, duration)

      timersRef.current.set(id, { fade: fadeTimer, remove: null })
    },
    [startDismiss],
  )

  const toast = useMemo(
    () => ({
      success: (message, options) => showToast(message, 'success', options),
      error: (message, options) => showToast(message, 'error', options),
      info: (message, options) => showToast(message, 'info', options),
    }),
    [showToast],
  )

  useEffect(
    () => () => {
      timersRef.current.forEach((timers) => {
        clearTimeout(timers.fade)
        clearTimeout(timers.remove)
      })
      timersRef.current.clear()
    },
    [],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return context
}
