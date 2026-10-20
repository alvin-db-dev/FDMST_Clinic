import { formatDate, formatStatus } from '../utils/auth.js'

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  follow_up: 'bg-cyan-50 text-cyan-700',
  checked_in: 'bg-emerald-50 text-emerald-700',
  in_consultation: 'bg-violet-50 text-violet-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  declined: 'bg-red-50 text-red-700',
  no_show: 'bg-slate-100 text-slate-700',
  rescheduled: 'bg-slate-100 text-slate-700',
}

const actionClass = {
  primary: 'bg-sky-950 text-white hover:bg-slate-900',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warning: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
}

function StatusActions({ appointment, onUpdateStatus, onRowClick, updatingId }) {
  const scheduledDate = appointment.appointmentDate ? new Date(appointment.appointmentDate) : null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (scheduledDate && !Number.isNaN(scheduledDate.getTime())) scheduledDate.setHours(0, 0, 0, 0)
  const isFutureDate = scheduledDate && scheduledDate > today

  const actionsByStatus = {
    confirmed: [
      ['checked_in', 'Check In', 'primary'],
      ['no_show', 'No Show', 'danger'],
      ['rescheduled', 'Skip', 'warning'],
    ],
    follow_up: [
      ['checked_in', 'Check In', 'primary'],
      ['no_show', 'No Show', 'danger'],
      ['rescheduled', 'Skip', 'warning'],
    ],
    checked_in: [
      ['in_consultation', 'Start Consultation', 'primary'],
      ['no_show', 'No Show', 'danger'],
      ['rescheduled', 'Skip', 'warning'],
    ],
    in_consultation: [
      ['completed', 'Completed', 'success'],
      ['rescheduled', 'Skip', 'warning'],
    ],
  }
  const actions = (actionsByStatus[appointment.status] || []).filter(([nextStatus]) => {
    if (isFutureDate && ['checked_in', 'no_show', 'rescheduled'].includes(nextStatus)) return false
    return true
  })

  if (!actions.length) {
    return (
      <button
        type="button"
        onClick={() => onRowClick?.(appointment)}
        disabled={updatingId === appointment.id}
        className={`min-w-20 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionClass.primary}`}
      >
        View
      </button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(([nextStatus, label, tone]) => (
        <button
          type="button"
          key={nextStatus}
          onClick={() => onUpdateStatus?.(appointment.id, nextStatus)}
          disabled={updatingId === appointment.id}
          className={`min-w-24 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionClass[tone] || actionClass.primary}`}
        >
          {updatingId === appointment.id ? 'Saving...' : label}
        </button>
      ))}
    </div>
  )
}

function AppointmentsTable({
  appointments,
  emptyMessage = 'No appointments found.',
  showActions = false,
  onUpdateStatus,
  onRowClick,
  updatingId = null,
}) {
  if (!appointments?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Appointment ID</th>
            <th className="px-4 py-3 font-semibold">Patient</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Time</th>
            <th className="px-4 py-3 font-semibold">Service</th>
            <th className="px-4 py-3 font-semibold">Dentist</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            {showActions && <th className="px-4 py-3 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <tr
              key={appointment.id}
              onClick={() => onRowClick?.(appointment)}
              className={`border-b border-gray-100 last:border-b-0 ${onRowClick ? 'cursor-pointer transition hover:bg-slate-50' : ''}`}
            >
              <td className="px-4 py-3 font-medium text-slate-500">{appointment.appointmentId || `APT-${String(appointment.id).slice(-6).toUpperCase()}`}</td>
              <td className="px-4 py-3 font-medium text-sky-950">{appointment.patientName}</td>
              <td className="px-4 py-3">{formatDate(appointment.appointmentDate)}</td>
              <td className="px-4 py-3">{appointment.appointmentTime}</td>
              <td className="px-4 py-3">{appointment.service}</td>
              <td className="px-4 py-3">{appointment.dentistName || '—'}</td>
              <td className="px-4 py-3">
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                    statusStyles[appointment.status] || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {formatStatus(appointment.status)}
                </span>
              </td>
              {showActions && (
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <StatusActions appointment={appointment} onUpdateStatus={onUpdateStatus} onRowClick={onRowClick} updatingId={updatingId} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AppointmentsTable
