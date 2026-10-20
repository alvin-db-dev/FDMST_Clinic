import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaCalendarCheck,
  FaCheckCircle,
  FaChevronDown,
  FaExclamationTriangle,
  FaFileCsv,
  FaFileExcel,
  FaMoneyBillWave,
  FaPrint,
  FaShoppingCart,
  FaUserClock,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatStatus } from '../../utils/auth.js'

function inRange(dateValue, start, end) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return !start && !end
  if (start && date < new Date(start)) return false
  if (end) {
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)
    if (date > endDate) return false
  }
  return true
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatPeso(value) {
  const amount = Number(value || 0)
  return `PHP ${amount.toLocaleString()}`
}

function appointmentRevenue(item) {
  if (item.status !== 'completed') return 0
  const revenue = Number(item.estimatedRevenueAmount)
  if (Number.isFinite(revenue) && revenue >= 0) return revenue
  const finalPrice = Number(item.finalPrice)
  if (Number.isFinite(finalPrice) && finalPrice >= 0) return finalPrice
  const snapshot = Number(item.servicePriceSnapshot)
  return Number.isFinite(snapshot) && snapshot >= 0 ? snapshot : 0
}

function inventoryUnitValue(item) {
  return Number(item.purchasePrice ?? item.costPrice ?? 0) || 0
}

function getPresetRange(period) {
  const now = new Date()
  const start = new Date(now)

  if (period === 'daily') start.setHours(0, 0, 0, 0)
  if (period === 'weekly') start.setDate(now.getDate() - 6)
  if (period === 'monthly') start.setMonth(now.getMonth() - 1)
  if (period === 'quarterly') start.setMonth(now.getMonth() - 3)
  if (period === 'yearly') start.setFullYear(now.getFullYear() - 1)

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  }
}

function ReportKpiCard({ icon: Icon, label, tone = 'blue', value }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="min-h-28 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.blue}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold leading-tight text-sky-950">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-slate-400">Selected report period</p>
    </article>
  )
}

function ReportSkeletonCard() {
  return (
    <div className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="h-10 w-10 rounded-xl bg-slate-100" />
      <div className="mt-4 h-7 w-20 rounded bg-slate-100" />
      <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
    </div>
  )
}

function AdminReportsPage() {
  const toast = useToast()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [period, setPeriod] = useState('custom')
  const [appointments, setAppointments] = useState([])
  const [inventory, setInventory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeReportDetails, setActiveReportDetails] = useState('appointments')
  const [exportOpen, setExportOpen] = useState(false)

  const loadReports = useCallback(async () => {
    try {
      const [appointmentResponse, inventoryResponse] = await Promise.all([
        fdmstApi.getAppointments({ period: 'all', limit: 100 }),
        fdmstApi.list('inventory'),
      ])
      setAppointments(appointmentResponse.data || [])
      setInventory(inventoryResponse.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load reports.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { Promise.resolve().then(loadReports) }, [loadReports])

  const filteredAppointments = useMemo(() => appointments.filter((item) => inRange(item.appointmentDate, startDate, endDate)), [appointments, startDate, endDate])
  const hasInventoryDateFilter = Boolean(startDate || endDate)
  const filteredInventorySales = useMemo(() => inventory.flatMap((item) => (item.transactionHistory || [])
    .filter((entry) => entry.type === 'sale' && inRange(entry.recordedAt, startDate, endDate))
    .map((entry) => ({ ...entry, itemId: item._id, itemName: item.itemName }))), [inventory, startDate, endDate])
  const inventoryReportRows = useMemo(() => inventory.map((item) => {
    const periodTransactions = (item.transactionHistory || []).filter((entry) => inRange(entry.recordedAt, startDate, endDate))

    if (hasInventoryDateFilter && !periodTransactions.length) return null

    const sales = periodTransactions.filter((entry) => entry.type === 'sale')
    const quantitySold = sales.reduce((total, entry) => total + Math.abs(Number(entry.quantityChanged) || 0), 0)
    const salesRevenue = sales.reduce((total, entry) => total + (Number(entry.totalAmount) || 0), 0)
    const lastMovement = periodTransactions
      .map((entry) => entry.recordedAt)
      .filter(Boolean)
      .sort((left, right) => new Date(right) - new Date(left))[0]

    return {
      ...item,
      quantitySold,
      salesCount: sales.length,
      salesRevenue,
      stockValue: inventoryUnitValue(item) * (Number(item.quantity) || 0),
      lastMovement,
    }
  }).filter(Boolean), [hasInventoryDateFilter, inventory, startDate, endDate])
  const completed = filteredAppointments.filter((item) => item.status === 'completed').length
  const noShow = filteredAppointments.filter((item) => item.status === 'no_show').length
  const estimatedRevenue = filteredAppointments.reduce((total, item) => total + appointmentRevenue(item), 0)
  const inventorySalesRevenue = filteredInventorySales.reduce((total, item) => total + (Number(item.totalAmount) || 0), 0)
  const totalRevenue = estimatedRevenue + inventorySalesRevenue
  const lowStock = inventory.filter((item) => ['low_stock', 'out_of_stock'].includes(item.status)).length

  const summary = useMemo(() => [
    { icon: FaCalendarCheck, label: 'Appointments', tone: 'blue', value: filteredAppointments.length },
    { icon: FaCheckCircle, label: 'Completed Appointments', tone: 'emerald', value: completed },
    { icon: FaUserClock, label: 'No-Show Appointments', tone: 'slate', value: noShow },
    { icon: FaMoneyBillWave, label: 'Clinic Revenue Estimate', tone: 'sky', value: formatPeso(estimatedRevenue) },
    { icon: FaShoppingCart, label: 'Inventory Sales Revenue', tone: 'violet', value: formatPeso(inventorySalesRevenue) },
    { icon: FaMoneyBillWave, label: 'Total Revenue', tone: 'emerald', value: formatPeso(totalRevenue) },
    { icon: FaShoppingCart, label: 'Inventory Sale', tone: 'blue', value: filteredInventorySales.length },
    { icon: FaExclamationTriangle, label: 'Inventory Alerts', tone: 'amber', value: lowStock },
  ], [completed, estimatedRevenue, filteredAppointments.length, filteredInventorySales.length, inventorySalesRevenue, lowStock, noShow, totalRevenue])
  const reportGroups = useMemo(() => [
    {
      title: 'Appointment Reports',
      cards: summary.slice(0, 3),
    },
    {
      title: 'Revenue Reports',
      cards: summary.slice(3, 6),
    },
    {
      title: 'Inventory Reports',
      cards: summary.slice(6, 8),
    },
  ], [summary])

  const reportRows = useMemo(() => [
    ['Metric', 'Value'],
    ...summary.map((item) => [item.label, item.value]),
    [],
    ['Appointment ID', 'Appointment Date', 'Appointment Time', 'Patient', 'Service', 'Dentist', 'Final Status', 'Service Price', 'Promo Code', 'Discount', 'Final Price', 'Estimated Revenue', 'Updated By', 'Completion/No-Show Timestamp'],
    ...filteredAppointments.map((item) => [
      item.id || item._id || '',
      item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString() : '',
      item.appointmentTime || '',
      item.patientName || '',
      item.service || '',
      item.dentistName || '',
      item.status || '',
      formatPeso(item.servicePriceSnapshot || 0),
      item.promoCode || '',
      formatPeso(item.discountAmount || 0),
      formatPeso(item.finalPrice ?? item.servicePriceSnapshot ?? 0),
      formatPeso(appointmentRevenue(item)),
      item.completedByEmail || item.noShowByEmail || item.statusUpdatedByEmail || '',
      item.completedAt || item.noShowAt ? new Date(item.completedAt || item.noShowAt).toLocaleString() : '',
    ]),
    [],
    ['Inventory Item', 'Category', 'Current Stock', 'Unit', 'Reorder Level', 'Supplier', 'Status', 'Selling Price', 'Stock Value', 'Sales Count', 'Quantity Sold', 'Sales Revenue', 'Last Movement'],
    ...inventoryReportRows.map((item) => [
      item.itemName || '',
      item.category || '',
      item.quantity ?? 0,
      item.unit || '',
      item.reorderLevel ?? 0,
      item.supplier || '',
      item.status || '',
      formatPeso(item.sellingPrice || 0),
      formatPeso(item.stockValue || 0),
      item.salesCount,
      item.quantitySold,
      formatPeso(item.salesRevenue || 0),
      item.lastMovement ? new Date(item.lastMovement).toLocaleString() : '',
    ]),
  ], [filteredAppointments, inventoryReportRows, summary])

  const exportReport = (type = 'csv') => downloadCsv(`fdmst-${period}-admin-report.${type === 'excel' ? 'xls' : 'csv'}`, reportRows)

  const applyPeriod = (nextPeriod) => {
    setPeriod(nextPeriod)
    if (nextPeriod === 'custom') return
    const range = getPresetRange(nextPeriod)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  return (
    <main className="bg-slate-50/60 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          {['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map((item) => (
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition ${period === item ? 'bg-sky-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              key={item}
              onClick={() => applyPeriod(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-2 text-sm font-semibold text-slate-500">Start Date<input className={inputClass} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPeriod('custom') }} /></label>
          <label className="grid gap-2 text-sm font-semibold text-slate-500">End Date<input className={inputClass} type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPeriod('custom') }} /></label>
          <div className="relative mt-auto">
            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-900 md:w-auto"
              onClick={() => setExportOpen((value) => !value)}
            >
              <FaFileCsv className="h-4 w-4" />
              Export
              <FaChevronDown className="h-3 w-3" />
            </button>
            {exportOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setExportOpen(false)
                    exportReport('csv')
                  }}
                >
                  <FaFileCsv className="h-4 w-4 text-sky-700" /> Export CSV
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setExportOpen(false)
                    exportReport('excel')
                  }}
                >
                  <FaFileExcel className="h-4 w-4 text-sky-700" /> Export Excel
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setExportOpen(false)
                    window.print()
                  }}
                >
                  <FaPrint className="h-4 w-4 text-sky-700" /> Print/PDF
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      {isLoading ? (
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, index) => <ReportSkeletonCard key={index} />)}
        </section>
      ) : (
        <>
          <section className="mt-8 grid gap-5">
            {reportGroups.map((group) => (
              <div className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm" key={group.title}>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{group.title}</h2>
                <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.cards.map((item) => <ReportKpiCard key={item.label} {...item} />)}
                </div>
              </div>
            ))}
          </section>
          <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-white px-5 pt-5 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Report Details</p>
                  <h2 className="mt-2 text-lg font-semibold text-sky-950">
                    {activeReportDetails === 'appointments' ? 'Appointment Report Details' : 'Inventory Report Details'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeReportDetails === 'appointments'
                      ? 'Filtered appointment records for export and print review.'
                      : 'Current stock, item valuation, and sales activity for the selected report period.'}
                  </p>
                </div>

                <div className="flex w-full gap-2 overflow-x-auto lg:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveReportDetails('appointments')}
                    className={`min-w-44 rounded-t-2xl border px-5 py-3 text-sm font-semibold transition ${activeReportDetails === 'appointments' ? 'border-gray-200 bg-white text-sky-950 shadow-sm' : 'border-gray-100 bg-white text-slate-500 hover:text-sky-950'}`}
                  >
                    Appointment
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReportDetails('inventory')}
                    className={`min-w-44 rounded-t-2xl border px-5 py-3 text-sm font-semibold transition ${activeReportDetails === 'inventory' ? 'border-gray-200 bg-white text-sky-950 shadow-sm' : 'border-gray-100 bg-white text-slate-500 hover:text-sky-950'}`}
                  >
                    Inventory
                  </button>
                </div>
              </div>
            </div>

            {activeReportDetails === 'appointments' ? (
              <div className="max-h-[34rem] overflow-auto">
                <table className="min-w-[1080px] w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm shadow-slate-200/60">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Patient</th>
                      <th className="px-4 py-3 font-semibold">Service</th>
                      <th className="px-4 py-3 font-semibold">Dentist</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Service Price</th>
                      <th className="px-4 py-3 font-semibold">Promo Code</th>
                      <th className="px-4 py-3 font-semibold">Discount</th>
                      <th className="px-4 py-3 font-semibold">Final Price</th>
                      <th className="px-4 py-3 font-semibold">Estimated Revenue</th>
                      <th className="px-4 py-3 font-semibold">Updated By</th>
                      <th className="px-4 py-3 font-semibold">Outcome Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.length ? filteredAppointments.map((item) => (
                      <tr className="border-t border-gray-100" key={item.id || item._id}>
                        <td className="px-4 py-3">{item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString() : 'Not set'}</td>
                        <td className="px-4 py-3 font-medium text-sky-950">{item.patientName || 'Unknown patient'}</td>
                        <td className="px-4 py-3">{item.service || 'Not specified'}</td>
                        <td className="px-4 py-3">{item.dentistName || 'Unassigned'}</td>
                        <td className="px-4 py-3">{formatStatus(item.status) || 'Unknown'}</td>
                        <td className="px-4 py-3">{formatPeso(item.servicePriceSnapshot || 0)}</td>
                        <td className="px-4 py-3">{item.promoCode || '—'}</td>
                        <td className="px-4 py-3">{formatPeso(item.discountAmount || 0)}</td>
                        <td className="px-4 py-3">{formatPeso(item.finalPrice ?? item.servicePriceSnapshot ?? 0)}</td>
                        <td className="px-4 py-3">{formatPeso(appointmentRevenue(item))}</td>
                        <td className="px-4 py-3">{item.completedByEmail || item.noShowByEmail || item.statusUpdatedByEmail || '—'}</td>
                        <td className="px-4 py-3">{item.completedAt || item.noShowAt ? new Date(item.completedAt || item.noShowAt).toLocaleString() : '—'}</td>
                      </tr>
                    )) : (
                      <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="12">No appointment records found for this report.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="max-h-[34rem] overflow-auto">
                <table className="min-w-[1080px] w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm shadow-slate-200/60">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Current Stock</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Reorder Level</th>
                      <th className="px-4 py-3 font-semibold">Supplier</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Selling Price</th>
                      <th className="px-4 py-3 font-semibold">Stock Value</th>
                      <th className="px-4 py-3 font-semibold">Sales Count</th>
                      <th className="px-4 py-3 font-semibold">Qty Sold</th>
                      <th className="px-4 py-3 font-semibold">Sales Revenue</th>
                      <th className="px-4 py-3 font-semibold">Last Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryReportRows.length ? inventoryReportRows.map((item) => (
                      <tr className="border-t border-gray-100" key={item._id}>
                        <td className="px-4 py-3 font-medium text-sky-950">{item.itemName || 'Unnamed item'}</td>
                        <td className="px-4 py-3">{item.category || 'Uncategorized'}</td>
                        <td className="px-4 py-3">{item.quantity ?? 0}</td>
                        <td className="px-4 py-3">{item.unit || 'pcs'}</td>
                        <td className="px-4 py-3">{item.reorderLevel ?? 0}</td>
                        <td className="px-4 py-3">{item.supplier || '—'}</td>
                        <td className="px-4 py-3">{formatStatus(item.status) || 'In Stock'}</td>
                        <td className="px-4 py-3">{formatPeso(item.sellingPrice || 0)}</td>
                        <td className="px-4 py-3">{formatPeso(item.stockValue || 0)}</td>
                        <td className="px-4 py-3">{item.salesCount}</td>
                        <td className="px-4 py-3">{item.quantitySold}</td>
                        <td className="px-4 py-3">{formatPeso(item.salesRevenue || 0)}</td>
                        <td className="px-4 py-3">{item.lastMovement ? new Date(item.lastMovement).toLocaleString() : '—'}</td>
                      </tr>
                    )) : (
                      <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="13">No inventory records found for this report.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default AdminReportsPage
