import { useEffect, useMemo, useState } from 'react'
import { FaBell, FaCalendarAlt, FaPalette, FaSave, FaUndo } from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const defaultSettings = {
  schedule: {
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '09:00',
    endTime: '17:00',
  },
  notifications: {
    newAppointment: true,
    appointmentCancellation: true,
    appointmentReschedule: true,
    patientMessages: true,
    emailNotifications: true,
  },
  appearance: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12',
  },
}

const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-950 focus:ring-4 focus:ring-sky-100'
const navItems = [
  {
    id: 'schedule',
    title: 'Schedule Settings',
    description: 'Manage your personal working schedule and availability.',
    icon: FaCalendarAlt,
  },
  {
    id: 'notifications',
    title: 'Notification Settings',
    description: 'Choose which work notifications you want to receive.',
    icon: FaBell,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Personalize date and time formatting.',
    icon: FaPalette,
  },
]

function mergeSettings(settings = {}) {
  return {
    schedule: { ...defaultSettings.schedule, ...(settings.schedule || {}) },
    notifications: { ...defaultSettings.notifications, ...(settings.notifications || {}) },
    appearance: { ...defaultSettings.appearance, ...(settings.appearance || {}) },
  }
}

function toMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return Number.NaN
  return hours * 60 + minutes
}

function SettingsCard({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-950">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-sky-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Toggle({ checked, label, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-5 w-5 rounded border-slate-300 text-sky-950 focus:ring-sky-200" />
    </label>
  )
}

function StaffSettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState(defaultSettings)
  const [savedSettings, setSavedSettings] = useState(defaultSettings)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeSection, setActiveSection] = useState('schedule')

  useEffect(() => {
    let isMounted = true
    async function loadSettings() {
      try {
        const response = await fdmstApi.getUserSettings()
        const merged = mergeSettings(response.data)
        if (!isMounted) return
        setSettings(merged)
        setSavedSettings(merged)
      } catch (error) {
        toast.error(error.message || 'Unable to load settings.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadSettings()
    return () => {
      isMounted = false
    }
  }, [toast])

  const hasChanges = useMemo(() => JSON.stringify(settings) !== JSON.stringify(savedSettings), [settings, savedSettings])

  const updateSchedule = (patch) => {
    setSettings((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }))
    setErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, ''])) }))
  }

  const updateNotifications = (key, value) => {
    setSettings((current) => ({ ...current, notifications: { ...current.notifications, [key]: value } }))
  }

  const updateAppearance = (key, value) => {
    setSettings((current) => ({ ...current, appearance: { ...current.appearance, [key]: value } }))
  }

  const toggleDay = (day) => {
    const nextDays = settings.schedule.workingDays.includes(day)
      ? settings.schedule.workingDays.filter((item) => item !== day)
      : [...settings.schedule.workingDays, day]
    updateSchedule({ workingDays: nextDays })
  }

  const validate = () => {
    const nextErrors = {}
    if (!settings.schedule.workingDays.length) nextErrors.workingDays = 'Select at least one working day.'
    if (toMinutes(settings.schedule.endTime) <= toMinutes(settings.schedule.startTime)) {
      nextErrors.workingHours = 'End time must be later than start time.'
    }
    setErrors(nextErrors)
    return !Object.keys(nextErrors).length
  }

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix the highlighted settings.')
      return
    }

    setIsSaving(true)
    try {
      const response = await fdmstApi.updateUserSettings(settings)
      const merged = mergeSettings(response.data)
      setSettings(merged)
      setSavedSettings(merged)
      if (response.user) authStorage.saveSession({ user: response.user })
      toast.success(response.message || 'Settings updated successfully.')
    } catch (error) {
      setErrors(error.errors || {})
      toast.error(error.message || 'Unable to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(defaultSettings)
    setErrors({})
  }

  if (isLoading) {
    return <main className="px-4 py-6 sm:px-6 lg:px-8"><p className="text-sm text-slate-500">Loading settings...</p></main>
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="h-fit rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
          <nav className="grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeSection === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${active ? 'bg-sky-950 text-white shadow-lg shadow-sky-950/15' : 'text-slate-600 hover:bg-slate-50 hover:text-sky-950'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white/15 text-amber-300' : 'bg-sky-50 text-sky-950'}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>{item.title}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="grid gap-6">
          {activeSection === 'schedule' ? (
            <SettingsCard icon={FaCalendarAlt} title="Schedule Settings" description="Manage your personal working schedule and availability.">
              <div className="grid gap-5">
                <div>
                  <p className="text-sm font-semibold text-slate-600">Working Days</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {days.map((day) => (
                      <Toggle key={day} label={day} checked={settings.schedule.workingDays.includes(day)} onChange={() => toggleDay(day)} />
                    ))}
                  </div>
                  {errors.workingDays ? <p className="mt-2 text-xs font-semibold text-red-600">{errors.workingDays}</p> : null}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-600">
                    Start Time
                    <input className={inputClass} type="time" value={settings.schedule.startTime} onChange={(event) => updateSchedule({ startTime: event.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-600">
                    End Time
                    <input className={inputClass} type="time" value={settings.schedule.endTime} onChange={(event) => updateSchedule({ endTime: event.target.value })} />
                  </label>
                </div>
                {errors.workingHours ? <p className="text-xs font-semibold text-red-600">{errors.workingHours}</p> : null}
              </div>
            </SettingsCard>
          ) : null}

          {activeSection === 'notifications' ? (
            <SettingsCard icon={FaBell} title="Notification Settings" description="Choose which work notifications you want to receive.">
              <div className="grid gap-3 md:grid-cols-2">
                <Toggle label="New Appointment Notifications" checked={settings.notifications.newAppointment} onChange={(event) => updateNotifications('newAppointment', event.target.checked)} />
                <Toggle label="Appointment Cancellation Alerts" checked={settings.notifications.appointmentCancellation} onChange={(event) => updateNotifications('appointmentCancellation', event.target.checked)} />
                <Toggle label="Appointment Reschedule Alerts" checked={settings.notifications.appointmentReschedule} onChange={(event) => updateNotifications('appointmentReschedule', event.target.checked)} />
                <Toggle label="Patient Message Notifications" checked={settings.notifications.patientMessages} onChange={(event) => updateNotifications('patientMessages', event.target.checked)} />
                <Toggle label="Email Notifications" checked={settings.notifications.emailNotifications} onChange={(event) => updateNotifications('emailNotifications', event.target.checked)} />
              </div>
            </SettingsCard>
          ) : null}

          {activeSection === 'appearance' ? (
            <SettingsCard icon={FaPalette} title="Appearance" description="Personalize date and time formatting.">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Date Format
                  <select className={inputClass} value={settings.appearance.dateFormat} onChange={(event) => updateAppearance('dateFormat', event.target.value)}>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Time Format
                  <select className={inputClass} value={settings.appearance.timeFormat} onChange={(event) => updateAppearance('timeFormat', event.target.value)}>
                    <option value="12">12-Hour (AM/PM)</option>
                    <option value="24">24-Hour</option>
                  </select>
                </label>
              </div>
            </SettingsCard>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleReset} disabled={isSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
              <FaUndo className="h-4 w-4" />
              Reset to Default
            </button>
            <button type="button" onClick={handleSave} disabled={!hasChanges || isSaving} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
              <FaSave className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default StaffSettingsPage
