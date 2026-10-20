import { FaCalendarAlt, FaChevronDown } from 'react-icons/fa'

function formatDateLabel(value) {
  if (!value) return 'Any'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function DateRangeFilter({ startDate, endDate, onChange, className = '' }) {
  const dateLabel = startDate || endDate
    ? `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`
    : 'All dates'
  const controlClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

  return (
    <details className={`group relative min-w-0 ${className}`}>
      <summary className={`${controlClass} flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden`}>
        <span className="flex min-w-0 items-center gap-3">
          <FaCalendarAlt className="shrink-0 text-slate-500" aria-hidden="true" />
          <span className="truncate">{dateLabel}</span>
        </span>
        <FaChevronDown className="shrink-0 text-xs text-slate-500 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 z-30 mt-2 grid w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[20rem]">
        <label className="grid gap-2 text-xs font-semibold text-slate-500">
          Start Date
          <input className={controlClass} type="date" value={startDate || ''} onChange={(event) => onChange('startDate', event.target.value)} />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-slate-500">
          End Date
          <input className={controlClass} type="date" value={endDate || ''} onChange={(event) => onChange('endDate', event.target.value)} />
        </label>
      </div>
    </details>
  )
}

export default DateRangeFilter
