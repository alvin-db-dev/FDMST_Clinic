export const inputClass =
  'h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

export const textareaClass =
  'min-h-24 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold text-sky-950">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function StatusPill({ tone = 'slate', children }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  }

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}
