import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { useNavigate } from 'react-router-dom'
import {
  FaBullhorn,
  FaCalendarAlt,
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarPlus,
  FaChartLine,
  FaChevronDown,
  FaCheckCircle,
  FaClock,
  FaDownload,
  FaMagic,
  FaTimes,
  FaTimesCircle,
  FaUserClock,
  FaUserPlus,
  FaUsers,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const chartColors = ['#16a34a', '#f59e0b', '#2563eb', '#ef4444', '#7c3aed', '#14b8a6', '#f97316', '#0c4a6e']
const serviceColorMap = {
  'Dental Prophylaxis / Cleaning': '#065f46',
  'Braces / Orthodontic Treatment': '#92400e',
  'Crowns / Caps': '#1e3a8a',
  'Fixed Partial Dentures (FPD)': '#581c87',
  'Dental Radiographs': '#991b1b',
  'Dental Restoration': '#5b21b6',
  Dentures: '#0f766e',
  'Oral Surgery': '#9a3412',
  'Fluoride Treatment': '#0f172a',
  'Oral Check-up': '#3f6212',
  'Oral Prophylaxis / Cleaning': '#7c2d12',
  Veneers: '#1d4ed8',
  'Root Canal Therapy (RCT)': '#9d174d',
  'Tooth Extraction': '#3730a3',
  'Tooth Sealant': '#115e59',
}
const officialServices = [
  'Dental Prophylaxis / Cleaning',
  'Braces / Orthodontic Treatment',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dental Radiographs',
  'Dental Restoration',
  'Dentures',
  'Oral Surgery',
  'Fluoride Treatment',
  'Oral Check-up',
  'Oral Prophylaxis / Cleaning',
  'Veneers',
  'Root Canal Therapy (RCT)',
  'Tooth Extraction',
  'Tooth Sealant',
]
const statusOptions = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'declined']
const kpiMeta = [
  { key: 'totalAppointments', label: 'Total Appointments', icon: FaCalendarCheck, tone: 'blue' },
  { key: 'currentPatients', label: 'Unique Patients', icon: FaUsers, tone: 'violet' },
  { key: 'newPatients', label: 'New Patients', icon: FaUserPlus, tone: 'blue' },
  { key: 'todaysAppointments', label: "Today's Appointments", icon: FaCalendarDay, tone: 'green' },
  { key: 'upcomingAppointments', label: 'Upcoming Appointments', icon: FaCalendarPlus, tone: 'violet' },
  { key: 'completedAppointments', label: 'Completed Appointments', icon: FaCheckCircle, tone: 'green' },
  { key: 'pendingAppointments', label: 'Pending Appointments', icon: FaClock, tone: 'orange' },
  { key: 'cancelledAppointments', label: 'Cancelled Appointments', icon: FaTimesCircle, tone: 'red' },
  { key: 'noShowAppointments', label: 'No-Show Appointments', icon: FaUserClock, tone: 'slate' },
]

function exportCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatSeriesLabel(label) {
  if (typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
  }
  if (typeof label === 'string' && /^\d{1,2}:00 (AM|PM)$/.test(label)) {
    return label.replace(':00', '')
  }
  return label || 'Unspecified'
}

function chartData(series = [], label = 'Total') {
  const safeSeries = Array.isArray(series) ? series : []

  return {
    labels: safeSeries.map((item) => formatSeriesLabel(item.label)),
    datasets: [
      {
        label,
        data: safeSeries.map((item) => Number(item.value || 0)),
        backgroundColor: chartColors,
        borderColor: chartColors,
        borderRadius: 6,
        borderWidth: 2,
        tension: 0.35,
      },
    ],
  }
}

function EmptyState({ message = 'No analytics data available for this filter.' }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-medium text-slate-500">
      {message}
    </div>
  )
}

function formatPercent(value, total) {
  if (!total) return '0%'
  return `${((Number(value || 0) / total) * 100).toFixed(1)}%`
}

function getServiceRows(series = []) {
  const safeSeries = Array.isArray(series) ? series : []
  const values = new Map(safeSeries.map((item) => [item.label, Number(item.value || 0)]))
  const extraRows = safeSeries
    .filter((item) => item.label && !officialServices.includes(item.label))
    .map((item, index) => ({
      color: chartColors[index % chartColors.length],
      label: item.label,
      value: Number(item.value || 0),
    }))

  return [
    ...officialServices.map((service) => ({
      color: serviceColorMap[service],
      label: service,
      value: values.get(service) || 0,
    })),
    ...extraRows,
  ]
}

function SkeletonCard() {
  return (
    <div className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="h-9 w-9 rounded-xl bg-slate-100" />
      <div className="mt-4 h-7 w-14 rounded bg-slate-100" />
      <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
    </div>
  )
}

function SkeletonSection() {
  return (
    <section className="mt-6 animate-pulse rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-6 w-48 rounded bg-slate-100" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div className="h-64 rounded-2xl bg-slate-100" key={item} />)}
      </div>
    </section>
  )
}

function normalizeKpiChange(change) {
  if (change && typeof change === 'object') {
    const status = change.status || 'neutral'
    const value = typeof change.value === 'number' ? change.value : null

    return {
      value,
      status,
      label: status === 'new' ? 'New' : `${Number(value || 0) > 0 ? '+' : ''}${Number(value || 0)}%`,
      icon: status === 'increase' || status === 'new' ? '↑' : status === 'decrease' ? '↓' : '−',
    }
  }

  const value = Number(change || 0)
  return {
    value,
    status: value > 0 ? 'increase' : value < 0 ? 'decrease' : 'neutral',
    label: `${value > 0 ? '+' : ''}${value}%`,
    icon: value > 0 ? '↑' : value < 0 ? '↓' : '−',
  }
}

function KpiCard({ item, value, change = 0, comparisonLabel = 'vs previous month' }) {
  const Icon = item.icon
  const tones = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }
  const changeState = normalizeKpiChange(change)
  const changeClass = changeState.status === 'increase' || changeState.status === 'new'
    ? 'text-emerald-600'
    : changeState.status === 'decrease'
      ? 'text-red-600'
      : 'text-slate-400'

  return (
    <article className="min-h-28 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[item.tone] || tones.blue}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="min-h-8 text-xs font-semibold leading-4 text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold leading-tight text-sky-950">{value || 0}</p>
        </div>
      </div>
      <p className={`mt-4 text-xs font-semibold ${changeClass}`}>
        {changeState.icon} {changeState.label} <span className="font-medium text-slate-400">{comparisonLabel}</span>
      </p>
    </article>
  )
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article className={`min-h-[16.5rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <div className="mb-3">
        <h3 className="text-base font-semibold leading-tight text-sky-950">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </article>
  )
}

function AnalyticsSection({ title, children }) {
  return (
    <section className="mt-6 rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="px-1 text-xl font-semibold tracking-tight text-sky-950">{title}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {children}
      </div>
    </section>
  )
}

// Quiet → busy scale used where colour should show how busy each bar is.
const busynessScale = [
  { color: '#38bdf8', label: 'Quiet' },
  { color: '#2563eb', label: 'Moderate' },
  { color: '#16a34a', label: 'Steady' },
  { color: '#f59e0b', label: 'Busy' },
  { color: '#ef4444', label: 'Busiest' },
]

function busynessColor(value, max) {
  if (!max || value <= 0) return '#cbd5e1'
  const index = Math.min(busynessScale.length - 1, Math.floor((value / max) * busynessScale.length - 1e-9))
  return busynessScale[Math.max(index, 0)].color
}

function BusynessLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500" aria-hidden="true">
      {busynessScale.map((step) => (
        <span className="inline-flex items-center gap-1.5" key={step.label}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: step.color }} />
          {step.label}
        </span>
      ))}
    </div>
  )
}

function AnalyticsChart({ type = 'bar', series = [], label, horizontal = false, emptyMessage, compact = true, showAllCategories = false, colorByValue = false }) {
  const safeSeries = Array.isArray(series) ? series : []

  if (!safeSeries.some((item) => Number(item.value) > 0)) return <EmptyState message={emptyMessage} />

  const data = chartData(safeSeries, label)
  if (type === 'line') {
    data.datasets[0].backgroundColor = 'rgba(37, 99, 235, 0.12)'
    data.datasets[0].borderColor = '#2563eb'
    data.datasets[0].pointBackgroundColor = '#2563eb'
    data.datasets[0].fill = true
  }
  if (type === 'bar') {
    const values = data.datasets[0].data
    const max = Math.max(...values, 0)
    // Either colour each bar by how busy it is, or use one colour so a single measure is not mistaken for categories.
    const colors = colorByValue ? values.map((value) => busynessColor(value, max)) : '#2563eb'
    data.datasets[0].backgroundColor = colors
    data.datasets[0].borderColor = colors
    data.datasets[0].borderWidth = 0
    data.datasets[0].maxBarThickness = horizontal ? 18 : 28
  }

  const options = {
    indexAxis: horizontal ? 'y' : 'x',
    maintainAspectRatio: false,
    interaction: type === 'doughnut'
      ? { mode: 'nearest', intersect: true }
      : { mode: 'nearest', axis: horizontal ? 'y' : 'x', intersect: false },
    plugins: {
      legend: {
        display: type === 'doughnut',
        position: 'bottom',
        labels: { boxWidth: 9, color: '#475569', font: { size: 11 }, padding: 12, usePointStyle: true },
      },
      tooltip: {
        intersect: type === 'doughnut',
        mode: 'nearest',
        callbacks: {
          title: (items) => items[0]?.label || 'Unspecified',
          label: (context) => `${context.dataset.label}: ${Number(context.raw || 0)}`,
        },
      },
    },
    scales: type === 'doughnut'
      ? undefined
      : horizontal
        ? {
            x: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { color: '#64748b', font: { size: 10 }, precision: 0 } },
            y: { grid: { display: false }, ticks: { autoSkip: !showAllCategories, color: '#64748b', font: { size: 10 } } },
          }
        : {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0, autoSkip: true } },
            y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { color: '#64748b', font: { size: 10 }, precision: 0 } },
          },
  }

  const chartHeight = showAllCategories
    ? Math.max(compact ? 208 : 240, safeSeries.length * 30)
    : undefined

  return (
    <>
      <div className={`${chartHeight ? '' : compact ? 'h-52' : 'h-60'} min-w-0`} style={chartHeight ? { height: chartHeight } : undefined}>
        {type === 'doughnut' ? <Doughnut data={data} options={options} /> : null}
        {type === 'line' ? <Line data={data} options={options} /> : null}
        {type === 'bar' ? <Bar data={data} options={options} /> : null}
      </div>
      {type === 'bar' && colorByValue ? <BusynessLegend /> : null}
    </>
  )
}

const servicePercentLabelsPlugin = {
  id: 'servicePercentLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const dataset = chart.data.datasets[0]
    const total = dataset.data.reduce((sum, value) => sum + Number(value || 0), 0)
    if (!total) return

    ctx.save()
    ctx.font = '700 14px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    chart.getDatasetMeta(0).data.forEach((arc, index) => {
      const value = Number(dataset.data[index] || 0)
      const percent = (value / total) * 100
      if (percent < 3) return
      const position = arc.tooltipPosition()
      ctx.fillText(`${percent.toFixed(1)}%`, position.x, position.y)
    })

    ctx.restore()
  },
}

function ServiceTrendChart({ matrix = [], labels = [] }) {
  const safeMatrix = Array.isArray(matrix) ? matrix.filter((row) => Array.isArray(row?.values)) : []
  const safeLabels = Array.isArray(labels) ? labels : []

  if (!safeLabels.length || !safeMatrix.some((row) => row.values.some((value) => Number(value) > 0))) {
    return <EmptyState message="No monthly service trend yet." />
  }

  const data = {
    labels: safeLabels,
    datasets: safeMatrix.map((row, index) => {
      const color = serviceColorMap[row.label] || chartColors[index % chartColors.length]
      return {
        label: row.label,
        data: row.values.map((value) => Number(value || 0)),
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointRadius: 2.5,
        borderWidth: 2,
        tension: 0.3,
        fill: false,
      }
    }),
  }

  const options = {
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 9, color: '#475569', font: { size: 10 }, padding: 10, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${Number(context.raw || 0)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { color: '#64748b', font: { size: 10 }, precision: 0 } },
    },
  }

  return (
    <div className="h-60 min-w-0">
      <Line data={data} options={options} />
    </div>
  )
}

function ServiceDistributionChart({ series = [] }) {
  const rows = getServiceRows(series)
  const chartRows = rows.filter((item) => Number(item.value) > 0)
  const total = chartRows.reduce((sum, item) => sum + Number(item.value || 0), 0)

  if (!total) return <EmptyState message="No service distribution yet." />

  const data = {
    labels: chartRows.map((item) => item.label),
    datasets: [
      {
        data: chartRows.map((item) => item.value),
        backgroundColor: chartRows.map((item) => item.color),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  }

  const options = {
    cutout: '44%',
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = Number(context.raw || 0)
            return `${context.label}: ${value} appointment${value === 1 ? '' : 's'} (${formatPercent(value, total)})`
          },
        },
      },
    },
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div className="mx-auto h-[22rem] w-full max-w-[22rem] sm:h-[25rem] sm:max-w-[25rem]">
        <Doughnut data={data} options={options} plugins={[servicePercentLabelsPlugin]} />
      </div>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {chartRows.map((item) => (
          <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-700" key={item.label}>
            <span className="h-4 w-4 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="ml-auto shrink-0 text-xs font-semibold text-slate-500">{item.value} · {formatPercent(item.value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniBars({ items = [], emptyMessage = 'No ranking data yet.' }) {
  const safeItems = Array.isArray(items) ? items : []

  if (!safeItems.length) return <EmptyState message={emptyMessage} />
  const visible = safeItems.slice(0, 5)
  const max = Math.max(...visible.map((item) => Number(item.value || 0)), 1)

  return (
    <div className="grid gap-3 pt-1">
      {visible.map((item) => (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-3 text-xs" key={item.label}>
          <span className="truncate font-semibold text-sky-950">{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${(Number(item.value || 0) / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold text-slate-600">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function ShareBars({ items = [], emptyMessage = 'No data yet.', lastLabels = [] }) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => ({ label: item.label || 'Unspecified', value: Number(item.value || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => {
      const aLast = lastLabels.includes(a.label)
      const bLast = lastLabels.includes(b.label)
      if (aLast !== bLast) return aLast ? 1 : -1
      return b.value - a.value || a.label.localeCompare(b.label)
    })
  const total = rows.reduce((sum, item) => sum + item.value, 0)

  if (!total) return <EmptyState message={emptyMessage} />

  const max = Math.max(...rows.map((item) => item.value))

  return (
    <div className="grid gap-4 pt-1" role="list">
      {rows.map((item) => {
        const isMuted = lastLabels.includes(item.label)
        return (
          <div className="grid gap-1.5" key={item.label} role="listitem" aria-label={`${item.label}: ${item.value} patients, ${formatPercent(item.value, total)}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className={`min-w-0 truncate font-semibold ${isMuted ? 'text-slate-500' : 'text-sky-950'}`}>{item.label}</span>
              <span className="shrink-0 font-semibold text-slate-600">
                {item.value} <span className="font-medium text-slate-400">· {formatPercent(item.value, total)}</span>
              </span>
            </div>
            <span className="block h-3 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${isMuted ? 'bg-slate-400' : 'bg-blue-600'}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-slate-400">Total: {total} patient{total === 1 ? '' : 's'}</p>
    </div>
  )
}

function GrowthList({ growing = [], declining = [] }) {
  const safeGrowing = Array.isArray(growing) ? growing : []
  const safeDeclining = Array.isArray(declining) ? declining : []
  const rows = [
    ...safeGrowing.map((item) => ({
      ...item,
      tone: 'bg-emerald-50 text-emerald-600',
      badge: item.status === 'new' ? '↑ New' : `↑ +${Number(item.value || 0)}%`,
    })),
    ...safeDeclining.map((item) => ({ ...item, tone: 'bg-red-50 text-red-600', badge: `↓ ${Number(item.value || 0)}%` })),
  ].slice(0, 5)

  if (!rows.length) return <EmptyState message="No service growth movement yet." />

  return (
    <div className="grid gap-3 pt-1">
      {rows.map((item) => (
        <div className="flex items-center justify-between gap-3 text-xs" key={item.label}>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sky-950">{item.label}</p>
            <p className="text-[11px] text-slate-500">{item.current ?? 0} now · {item.previous ?? 0} before</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-semibold ${item.tone}`}>{item.badge}</span>
        </div>
      ))}
    </div>
  )
}

function CompactTable({ columns, rows, emptyMessage }) {
  const safeRows = Array.isArray(rows) ? rows : []

  if (!safeRows.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row) => (
            <tr className="border-t border-gray-100" key={row.id || row.label || row.dentist}>
              {columns.map((column) => (
                <td className="px-3 py-2" key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilterToolbar({ filters, options, onChange, onExport }) {
  const [exportOpen, setExportOpen] = useState(false)
  const update = (key, value) => onChange((current) => {
    const next = { ...current, [key]: value }
    if (key === 'startDate' && value && next.endDate && next.endDate < value) next.endDate = ''
    return next
  })
  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Any'
  const dateLabel = filters.startDate && filters.endDate && filters.startDate !== filters.endDate
    ? `${formatDate(filters.startDate)} - ${formatDate(filters.endDate)}`
    : filters.startDate || filters.endDate
      ? formatDate(filters.startDate || filters.endDate)
      : 'All dates'
  const controlClass = 'h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'
  const clearFilters = () => onChange({ startDate: '', endDate: '', dentist: '', service: '', status: '' })

  return (
    <section className="mb-7">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.35fr)_minmax(9.5rem,0.75fr)_minmax(10rem,0.85fr)_minmax(9.5rem,0.75fr)_auto_auto] xl:items-center">
        <details className="group relative min-w-0">
          <summary className={`${controlClass} flex w-full cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-3">
              <FaCalendarAlt className="shrink-0 text-slate-500" aria-hidden="true" />
              <span className="truncate">{dateLabel}</span>
            </span>
            <FaChevronDown className="shrink-0 text-xs text-slate-500 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="absolute left-0 z-30 mt-2 grid w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[20rem]">
            <label className="grid gap-2 text-xs font-semibold text-slate-500">
              Start Date
              <input aria-label={`Start date. Current range: ${dateLabel}`} className={controlClass} type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} />
            </label>
            <label className="grid gap-2 text-xs font-semibold text-slate-500">
              End Date
              <input aria-label={`End date. Current range: ${dateLabel}`} className={controlClass} min={filters.startDate || undefined} type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} />
            </label>
          </div>
        </details>

        <select className={controlClass} value={filters.service} onChange={(event) => update('service', event.target.value)}>
          <option value="">All Services</option>
          {(options.services || []).map((service) => <option key={service} value={service}>{service}</option>)}
        </select>
        <select className={`${controlClass} capitalize`} value={filters.status} onChange={(event) => update('status', event.target.value)}>
          <option value="">All Status</option>
          {[...new Set([...(options.statuses || []), ...statusOptions])].map((status) => <option className="capitalize" key={status} value={status}>{status}</option>)}
        </select>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-100 hover:bg-red-50 hover:text-red-600" onClick={clearFilters} type="button">
          <FaTimes aria-hidden="true" />
          Clear
        </button>
        <div className="relative">
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 xl:w-auto"
            onClick={() => setExportOpen((value) => !value)}
            type="button"
          >
            <FaDownload aria-hidden="true" />
            Export
            <FaChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setExportOpen(false)
                  onExport()
                }}
              >
                <FaDownload className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Export CSV
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function clinicDateKey(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function PredictionPanel({ service, onFocusDate }) {
  const navigate = useNavigate()
  const [date, setDate] = useState(() => clinicDateKey(1))
  const [prediction, setPrediction] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const visible = prediction?.selected?.date === date && prediction?.service === service ? prediction : null
  const selected = visible?.selected
  const maxValue = Math.max(1, ...(visible?.days || []).map((day) => day.forecast ?? day.booked))
  const formatDate = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

  const generate = async () => {
    onFocusDate(date)
    setIsGenerating(true)
    setError('')
    try {
      setPrediction(await fdmstApi.getAdminAnalyticsPrediction({ date, service }))
    } catch (requestError) {
      setPrediction(null)
      setError(requestError.message || 'Could not load the prediction.')
    } finally {
      setIsGenerating(false)
    }
  }

  const createPromotion = (recommendation) => {
    navigate('/admin/promotions', {
      state: {
        promotionDraft: {
          title: recommendation.suggestedPromotion,
          description: `${recommendation.reason} ${recommendation.predictedImpact}`.trim(),
          discountLabel: recommendation.suggestedPromotion,
          discountType: recommendation.discountType,
          discountValue: recommendation.discountValue,
          serviceType: recommendation.service,
          applicableServices: [recommendation.service],
          promoCode: recommendation.promoCode,
          startDate: recommendation.startDate,
          endDate: recommendation.endDate,
          status: 'inactive',
        },
      },
    })
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Appointment prediction">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><FaMagic aria-hidden="true" /></span>
          <div>
            <h2 className="text-lg font-semibold text-sky-950">AI-assisted appointment forecast</h2>
            <p className="mt-1 text-sm text-slate-500">{service || 'All services'} · Up to 12 weeks of appointment history, recent weeks weighted more</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="grid min-w-0 w-full gap-1 text-xs font-semibold text-slate-600 sm:w-auto">
            Forecast date
            <input
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100 sm:w-44"
              min={clinicDateKey()}
              max={clinicDateKey(30)}
              onChange={(event) => {
                setDate(event.target.value)
                if (event.target.value) onFocusDate(event.target.value)
              }}
              type="date"
              value={date}
            />
          </label>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            disabled={isGenerating || !date}
            onClick={generate}
            type="button"
          >
            <FaChartLine aria-hidden="true" /> {isGenerating ? 'Generating...' : 'Generate forecast'}
          </button>
        </div>
      </div>

      {isGenerating ? (
        <div className="mt-6 grid animate-pulse gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3" aria-live="polite">
          {[1, 2, 3].map((item) => <div className="h-20 rounded-lg bg-slate-100" key={item} />)}
        </div>
      ) : error ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button className="rounded-lg border border-red-200 px-3 py-2 font-semibold hover:bg-red-50" onClick={generate} type="button">Retry</button>
        </div>
      ) : visible ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase text-slate-500">Expected appointments</p><p className="mt-1 text-3xl font-semibold text-sky-950">{selected.forecast ?? '—'}</p></div>
            <div><p className="text-xs font-semibold uppercase text-slate-500">Already scheduled</p><p className="mt-1 text-3xl font-semibold text-sky-950">{selected.booked}</p></div>
            <div><p className="text-xs font-semibold uppercase text-slate-500">Indicative range</p><p className="mt-1 text-3xl font-semibold text-sky-950">{selected.low === null ? '—' : `${selected.low}–${selected.high}`}</p></div>
          </div>
          {!selected.isWorkingDay ? <p className="mt-4 text-sm text-amber-700">This is not a configured clinic working day.</p> : null}
          {selected.isWorkingDay && selected.forecast === null ? <p className="mt-4 text-sm text-slate-600">Not enough appointment history for a reliable estimate. Existing bookings are shown above.</p> : null}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4 xl:grid-cols-7">
            {visible.days.map((day) => (
              <div className="min-w-0" key={day.date}>
                <p className="text-xs font-semibold text-slate-600">{formatDate(day.date)}</p>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-700" style={{ width: `${((day.forecast ?? day.booked) / maxValue) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{day.forecast === null ? `${day.booked} booked` : `${day.forecast} expected`}</p>
              </div>
            ))}
          </div>
          {visible.ai?.status === 'ready' ? (
            <div className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-700">
              <p>{visible.ai.insight}</p>
              <p className="mt-1 font-medium text-sky-950">{visible.ai.action}</p>
            </div>
          ) : visible.ai?.status === 'unavailable' || visible.ai?.status === 'not_configured' ? (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">AI explanation is unavailable; appointment estimates are based on clinic history.</p>
          ) : null}
          <section className="mt-5 border-t border-slate-100 pt-5" aria-labelledby="promotion-recommendations-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="promotion-recommendations-title" className="font-semibold text-sky-950">Promotion recommendations</h3>
                <p className="mt-1 text-sm text-slate-500">Suggested from predicted service demand and existing promotion coverage.</p>
              </div>
              {visible.recommendationSource === 'ai' ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">AI assisted</span> : null}
            </div>
            {visible.recommendations?.length ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visible.recommendations.map((recommendation) => (
                  <article className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={`${recommendation.service}-${recommendation.startDate}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase text-slate-500">{recommendation.service}</p>
                        <h4 className="mt-1 break-words text-base font-semibold text-sky-950">{recommendation.suggestedPromotion}</h4>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${recommendation.confidenceLevel === 'High' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : recommendation.confidenceLevel === 'Medium' ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{recommendation.confidenceLevel} confidence</span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Forecast</dt><dd className="mt-1 text-slate-700">{recommendation.forecast}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Recommended offer</dt><dd className="mt-1 font-medium text-sky-950">{recommendation.recommendedOffer}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Target period</dt><dd className="mt-1 text-slate-700">{formatDate(recommendation.startDate)}{recommendation.endDate !== recommendation.startDate ? ` - ${formatDate(recommendation.endDate)}` : ''}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase text-slate-500">Expected impact</dt><dd className="mt-1 text-slate-700">{recommendation.predictedImpact}</dd></div>
                    </dl>
                    <div className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-sky-950">Reason: </span>{recommendation.reason}</div>
                    <button type="button" onClick={() => createPromotion(recommendation)} className="mt-4 inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-900">
                      <FaBullhorn aria-hidden="true" /> Create Promotion
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No new promotion is recommended for this forecast. Demand is not sufficiently low, data is limited, or an overlapping promotion already covers the service.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Recommendations are drafts only. Promotions remain inactive until reviewed and explicitly activated by an admin.</p>
          </section>
          <p className="mt-4 text-xs text-slate-500">
            Forecasts are estimates, not confirmed bookings. Based on {visible.historyAppointments} appointments across {visible.historyDays} clinic working days since {formatDate(visible.historyStart)}; {selected.comparableDays} comparable weekdays.
            {selected.method === 'booking_pace' ? ' Adjusted for bookings already made and how far ahead patients usually book.' : ''}
          </p>
        </div>
      ) : (
        <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">Choose a date to view expected appointment volume.</p>
      )}
    </section>
  )
}

function ServiceComparisonPanel() {
  const navigate = useNavigate()
  const currentMonth = clinicDateKey().slice(0, 7)
  const currentYear = currentMonth.slice(0, 4)
  const previousMonth = new Date(Date.UTC(Number(currentYear), Number(currentMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)
  const [period, setPeriod] = useState('month')
  const [month, setMonth] = useState(currentMonth)
  const [compareMonth, setCompareMonth] = useState(previousMonth)
  const [year, setYear] = useState(currentYear)
  const [compareYear, setCompareYear] = useState(String(Number(currentYear) - 1))
  const [comparison, setComparison] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const value = period === 'month' ? month : year
  const compareValue = period === 'month' ? compareMonth : compareYear
  const validSelection = Boolean(value && compareValue && value !== compareValue
    && value <= (period === 'month' ? currentMonth : currentYear)
    && compareValue <= (period === 'month' ? currentMonth : currentYear)
    && Number(value.slice(0, 4)) >= 2000 && Number(compareValue.slice(0, 4)) >= 2000)
  const visibleComparison = comparison?.window?.period === period
    && comparison?.window?.value === value && comparison?.window?.previousValue === compareValue ? comparison : null

  const generate = async () => {
    if (!validSelection) return
    setIsGenerating(true)
    setError('')
    setComparison(null)
    try {
      setComparison(await fdmstApi.getAdminServiceComparison({ period, value, compareValue }))
    } catch (requestError) {
      setError(requestError.message || 'Unable to generate the service comparison.')
    } finally {
      setIsGenerating(false)
    }
  }

  const periodLabel = (key) => key?.length === 7
    ? new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    : key
  const periodEndLabel = (end) => new Date(new Date(`${end}T00:00:00Z`).getTime() - 86400000)
    .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  const draftPromotion = (service) => navigate('/admin/promotions', {
    state: { promotionDraft: { title: `${service} promotion`, serviceType: service, applicableServices: [service], status: 'inactive' } },
  })

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Service booking comparison">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><FaMagic aria-hidden="true" /></span>
          <div>
            <h2 className="text-lg font-semibold text-sky-950">AI-assisted service booking comparison</h2>
            <p className="mt-1 text-sm text-slate-500">Choose any two months or years to compare service demand and get improvement ideas.</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="grid min-w-0 w-full gap-1 text-xs font-semibold text-slate-600 sm:w-auto">
            Compare by
            <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="month">Months</option>
              <option value="year">Years</option>
            </select>
          </label>
          <label className="grid min-w-0 w-full gap-1 text-xs font-semibold text-slate-600 sm:w-auto">
            Selected {period}
            {period === 'month' ? (
              <input className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100" type="month" min="2000-01" max={currentMonth} value={month} onChange={(event) => setMonth(event.target.value)} />
            ) : (
              <input className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100 sm:w-28" type="number" min="2000" max={currentYear} value={year} onChange={(event) => setYear(event.target.value)} />
            )}
          </label>
          <label className="grid min-w-0 w-full gap-1 text-xs font-semibold text-slate-600 sm:w-auto">
            Compare with {period}
            {period === 'month' ? (
              <input className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100" type="month" min="2000-01" max={currentMonth} value={compareMonth} onChange={(event) => setCompareMonth(event.target.value)} />
            ) : (
              <input className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-800 focus:ring-2 focus:ring-sky-100 sm:w-28" type="number" min="2000" max={currentYear} value={compareYear} onChange={(event) => setCompareYear(event.target.value)} />
            )}
          </label>
          <button type="button" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-wait disabled:opacity-60 sm:w-auto" disabled={isGenerating || !validSelection} onClick={generate}><FaChartLine aria-hidden="true" /> {isGenerating ? 'Generating...' : 'Generate comparison'}</button>
        </div>
      </div>

      {isGenerating ? (
        <div className="mt-6 grid animate-pulse gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3" aria-live="polite">
          {[1, 2, 3].map((item) => <div className="h-20 rounded-lg bg-slate-100" key={item} />)}
        </div>
      ) : error ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button className="rounded-lg border border-red-200 px-3 py-2 font-semibold hover:bg-red-50" onClick={generate} type="button">Retry</button>
        </div>
      ) : visibleComparison ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-600">
            {periodLabel(visibleComparison.window.value)} vs {periodLabel(visibleComparison.window.previousValue)}
            {visibleComparison.window.isPartial ? ` · Selected through ${periodEndLabel(visibleComparison.window.currentEnd)}; compared through ${periodEndLabel(visibleComparison.window.previousEnd)}` : ''}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-sky-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Most booked in selected period</p><p className="mt-1 font-semibold text-sky-950">{visibleComparison.leaders.length ? visibleComparison.leaders.join(', ') : 'No bookings yet'}</p><p className="mt-2 text-xs text-slate-500">Compared period: {visibleComparison.previousLeaders?.length ? visibleComparison.previousLeaders.join(', ') : 'No bookings'}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Selected period bookings</p><p className="mt-1 text-2xl font-semibold text-sky-950">{visibleComparison.totalCurrent}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Compared period bookings</p><p className="mt-1 text-2xl font-semibold text-sky-950">{visibleComparison.totalPrevious}</p></div>
          </div>
          {visibleComparison.ai?.status === 'ready' ? (
            <div className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-700">
              <p>{visibleComparison.ai.insight}</p>
              <p className="mt-1 font-medium text-sky-950">{visibleComparison.ai.action}</p>
            </div>
          ) : visibleComparison.ai?.status === 'unavailable' || visibleComparison.ai?.status === 'not_configured' ? (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">AI explanation is unavailable; improvement ideas are based on the booking counts shown below.</p>
          ) : null}
          <section className="mt-5 border-t border-slate-100 pt-5" aria-labelledby="service-comparison-recommendations">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="service-comparison-recommendations" className="font-semibold text-sky-950">Recommendations and improvements</h3>
                <p className="mt-1 text-sm text-slate-500">Actions based on the most booked service and changes between your chosen periods.</p>
              </div>
              {visibleComparison.ai?.status === 'ready' ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">AI assisted</span> : null}
            </div>
            {visibleComparison.recommendations?.length ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visibleComparison.recommendations.map((recommendation) => (
                  <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={recommendation.service}>
                    <h4 className="font-semibold text-sky-950">{recommendation.service}</h4>
                    <p className="mt-2 text-sm text-slate-600">{recommendation.reason}</p>
                    <p className="mt-3 text-sm font-medium text-sky-950">{recommendation.improvement}</p>
                    <button type="button" className="mt-4 rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-950 hover:bg-sky-50" onClick={() => draftPromotion(recommendation.service)}>Draft promotion</button>
                  </article>
                ))}
              </div>
            ) : <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No bookings in either period yet. Choose periods with bookings to generate recommendations.</p>}
          </section>
          <p className="mt-4 text-xs text-slate-500">Counts include pending, confirmed, follow-up, in-progress, completed, and no-show appointments. Cancelled, declined, and rescheduled appointments are excluded.</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><tr><th className="px-4 py-3">Service</th><th className="px-4 py-3 text-right">Selected</th><th className="px-4 py-3 text-right">Compared</th><th className="px-4 py-3 text-right">Change</th><th className="px-4 py-3">Suggested focus</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody>{visibleComparison.rows.map((row) => (
                <tr className="border-t border-slate-100" key={row.service}>
                  <td className="px-4 py-3 font-semibold text-sky-950">{row.service}</td>
                  <td className="px-4 py-3 text-right">{row.current}</td>
                  <td className="px-4 py-3 text-right">{row.previous}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${row.change > 0 ? 'text-emerald-700' : row.change < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{row.changePercent === null ? row.current ? 'New' : '—' : `${row.change > 0 ? '+' : ''}${row.changePercent}%`}</td>
                  <td className="px-4 py-3 text-slate-600">{row.focus}</td>
                  <td className="px-4 py-3"><button type="button" className="whitespace-nowrap rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-950 hover:bg-sky-50" onClick={() => draftPromotion(row.service)}>Draft promotion</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Promotion drafts open inactive for your review.</p>
        </div>
      ) : <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">{validSelection ? 'Choose two periods and generate a comparison to see bookings and improvement ideas.' : 'Choose two different current or past months or years to compare.'}</p>}
    </section>
  )
}

function AdminAnalyticsPage() {
  const toast = useToast()
  const requestIdRef = useRef(0)
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState({ startDate: '', endDate: '', dentist: '', service: '', status: '' })
  const focusForecastDate = useCallback((date) => {
    setFilters((current) => current.startDate === date && current.endDate === date
      ? current
      : { ...current, startDate: date, endDate: date })
  }, [])

  const loadAnalytics = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestIdRef.current
    if (!silent) {
      setIsLoading(true)
      setDashboard(null)
    }
    setLoadError('')
    try {
      const data = await fdmstApi.getAdminAnalytics(filters)
      if (requestId !== requestIdRef.current) return
      setDashboard(data)
      setLoadError('')
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return
      const message = loadError.message && loadError.message !== 'Something went wrong. Please try again.'
        ? loadError.message
        : 'No analytics data available.'
      setLoadError(message)
      if (!silent) toast.error(message)
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }, [filters, toast])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => { if (active) loadAnalytics() })
    return () => {
      active = false
      requestIdRef.current += 1
    }
  }, [loadAnalytics])

  const stats = dashboard?.stats || {}
  const hasDateFilter = Boolean(filters.startDate || filters.endDate)
  const isDateRange = Boolean(filters.startDate && filters.endDate && filters.startDate !== filters.endDate)
  const selectedDayLabel = hasDateFilter
    ? new Date(`${filters.endDate || filters.startDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const displayKpis = kpiMeta.map((item) => item.key === 'todaysAppointments' && hasDateFilter
    ? { ...item, label: `Appointments on ${selectedDayLabel}` }
    : item)
  const analytics = dashboard?.analytics || {}
  const appointmentAnalytics = analytics.appointments || {}
  const serviceAnalytics = analytics.services || {}
  const patientAnalytics = analytics.patients || {}
  const treatmentAnalytics = analytics.treatments || {}
  const revenueAnalytics = analytics.revenue || {}
  const frequentPatientColumns = [
    { key: 'label', label: 'Patient', render: (row) => <span className="font-semibold text-sky-950">{row.label}</span> },
    { key: 'value', label: 'Appointments' },
  ]

  const exportAnalytics = () => {
    exportCsv('fdmst-analytics-summary.csv', [
      ['Metric', 'Value'],
      ...displayKpis.map((item) => [item.label, stats[item.key] || 0]),
      ['Completion Rate', `${appointmentAnalytics.completionRate || 0}%`],
      ['Cancellation Rate', `${appointmentAnalytics.cancellationRate || 0}%`],
      ['No-Show Rate', `${appointmentAnalytics.noShowRate || 0}%`],
      ['Follow-up Compliance', `${treatmentAnalytics.followUpCompliance || 0}%`],
    ])
  }

  return (
    <main className="bg-slate-50/60 px-4 py-5 sm:px-6 lg:px-8">
      <FilterToolbar filters={filters} options={dashboard?.filters || {}} onChange={setFilters} onExport={exportAnalytics} />
      <PredictionPanel service={filters.service} onFocusDate={focusForecastDate} />
      <ServiceComparisonPanel />

      {isLoading ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {displayKpis.map((item) => <SkeletonCard key={item.key} />)}
          </section>
          <SkeletonSection />
          <SkeletonSection />
        </>
      ) : loadError && !dashboard ? (
        <section className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-sky-950">No analytics data available.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            The analytics service could not load data for this view. Please check the selected filters or try again once the server is available.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {displayKpis.map((item) => (
              <KpiCard
                change={stats.monthlyChange?.[item.key] || 0}
                comparisonLabel={hasDateFilter ? 'vs previous period' : 'vs previous month'}
                item={item}
                key={item.key}
                value={stats[item.key]}
              />
            ))}
          </section>

          <AnalyticsSection title="Appointment Analytics">
            <ChartCard title="Daily Appointment Trend" subtitle={hasDateFilter ? (isDateRange ? 'Last 30 days of selected range' : 'Selected date') : 'Last 30 days'}>
              <AnalyticsChart type="line" series={appointmentAnalytics.dailyTrend} label="Appointments" emptyMessage="No daily appointment trend data yet." />
            </ChartCard>
            <ChartCard title="Appointment Status Distribution" subtitle={`Total: ${stats.totalAppointments || 0} appointments`}>
              <AnalyticsChart type="doughnut" series={appointmentAnalytics.statusDistribution} label="Appointments" emptyMessage="No appointment status data yet." />
            </ChartCard>
            <ChartCard title="Peak Clinic Hours" subtitle="Total appointments by hour of day">
              <AnalyticsChart colorByValue series={appointmentAnalytics.peakHours} label="Appointments" emptyMessage="No peak hour data yet." />
            </ChartCard>
            <ChartCard title="Busiest Days of Week" subtitle="By total appointments">
              <AnalyticsChart colorByValue horizontal showAllCategories series={appointmentAnalytics.busiestDays} label="Appointments" emptyMessage="No busiest-day data yet." />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Service Analytics">
            <ChartCard title="Service Distribution" subtitle={`Share of ${stats.totalAppointments || 0} appointments matching the current filters`} className="lg:col-span-2 2xl:col-span-4 min-h-[42rem] p-6 sm:p-7">
              <ServiceDistributionChart series={serviceAnalytics.distribution} />
            </ChartCard>
            <ChartCard title="Most Requested Services" subtitle="By total appointments booked">
              <MiniBars items={serviceAnalytics.mostRequested} emptyMessage="No requested service data yet." />
            </ChartCard>
            <ChartCard title="Monthly Service Trend" subtitle="Top services by month, last 12 months" className="2xl:col-span-2">
              <ServiceTrendChart labels={serviceAnalytics.monthLabels} matrix={serviceAnalytics.serviceTrendMatrix} />
            </ChartCard>
            <ChartCard title="Service Growth" subtitle={serviceAnalytics.growthWindow ? `${formatSeriesLabel(serviceAnalytics.growthWindow.currentStart)} – ${formatSeriesLabel(serviceAnalytics.growthWindow.currentEnd)} vs the previous 30 days` : 'Last 30 days vs the previous 30 days'}>
              <GrowthList declining={serviceAnalytics.fastestDeclining} growing={serviceAnalytics.fastestGrowing} />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Patient Analytics">
            <ChartCard title="New vs Returning Patients" subtitle="Patient visit behavior">
              <AnalyticsChart type="doughnut" series={patientAnalytics.newVsReturning} label="Patients" emptyMessage="No patient mix data yet." />
            </ChartCard>
            <ChartCard title="Age Distribution" subtitle="Registered patient age groups">
              <AnalyticsChart series={patientAnalytics.ageDistribution} label="Patients" emptyMessage="No age data yet." />
            </ChartCard>
            <ChartCard title="Gender Distribution" subtitle="Registered patient profile data">
              <ShareBars items={patientAnalytics.genderDistribution} lastLabels={['Not specified']} emptyMessage="No gender data yet." />
            </ChartCard>
            <ChartCard title="Frequent Patients" subtitle="Patients with the most appointments">
              <CompactTable columns={frequentPatientColumns} emptyMessage="No frequent patient data yet." rows={patientAnalytics.frequentPatients || []} />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Treatment Analytics">
            <ChartCard title="Follow-up Compliance" subtitle="Completed follow-up visits out of those already due">
              {treatmentAnalytics.followUpTotals?.due ? (
                <div className="rounded-2xl bg-sky-50 p-5 text-center ring-1 ring-sky-100">
                  <p className="text-5xl font-semibold text-sky-950">{treatmentAnalytics.followUpCompliance || 0}%</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">Compliance Rate</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {treatmentAnalytics.followUpTotals.completed} of {treatmentAnalytics.followUpTotals.due} due follow-ups completed
                    {treatmentAnalytics.followUpTotals.upcoming ? ` · ${treatmentAnalytics.followUpTotals.upcoming} still upcoming` : ''}
                  </p>
                </div>
              ) : (
                <EmptyState message={treatmentAnalytics.followUpTotals?.upcoming ? `${treatmentAnalytics.followUpTotals.upcoming} follow-up visit${treatmentAnalytics.followUpTotals.upcoming === 1 ? ' is' : 's are'} scheduled but none are due yet.` : 'No follow-up visits recorded yet.'} />
              )}
            </ChartCard>
            <ChartCard title="Preventive vs Corrective" subtitle="Completed appointments by care type">
              <AnalyticsChart type="doughnut" series={treatmentAnalytics.preventiveVsCorrective} label="Care type" emptyMessage="No completed treatments yet." />
            </ChartCard>
            <ChartCard title="Most Common Procedures" subtitle="Dental record procedure count" className="2xl:col-span-2">
              <MiniBars items={treatmentAnalytics.mostCommonProcedures} emptyMessage="No treatment record data yet." />
            </ChartCard>
          </AnalyticsSection>

          {revenueAnalytics.available ? (
            <AnalyticsSection title="Revenue Analytics">
              <ChartCard title="Monthly Revenue Trend" subtitle="Revenue over time">
                <AnalyticsChart type="line" series={revenueAnalytics.byMonth} label="Revenue" emptyMessage="No revenue data yet." />
              </ChartCard>
              <ChartCard title="Revenue by Service" subtitle="Service-level revenue">
                <AnalyticsChart horizontal series={revenueAnalytics.byService} label="Revenue" emptyMessage="No service revenue yet." />
              </ChartCard>
              <ChartCard title="Payment Method Distribution" subtitle="Cash, GCash, Maya, and card payments">
                <AnalyticsChart type="doughnut" series={revenueAnalytics.byPaymentMethod} label="Payments" emptyMessage="No payment method data yet." />
              </ChartCard>
            </AnalyticsSection>
          ) : null}
        </>
      )}
    </main>
  )
}

export default AdminAnalyticsPage
