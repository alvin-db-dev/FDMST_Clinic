import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaBoxOpen, FaSearch, FaShoppingCart, FaTimes } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
const categoryColors = [
  'bg-blue-50 text-blue-700 ring-blue-100',
  'bg-emerald-50 text-emerald-700 ring-emerald-100',
  'bg-amber-50 text-amber-700 ring-amber-100',
  'bg-violet-50 text-violet-700 ring-violet-100',
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-cyan-50 text-cyan-700 ring-cyan-100',
]

function statusLabel(status) {
  if (status === 'out_of_stock') return 'Out of Stock'
  if (status === 'low_stock') return 'Low Stock'
  return 'In Stock'
}

function statusClass(status) {
  if (status === 'out_of_stock') return 'bg-red-50 text-red-700'
  if (status === 'low_stock') return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function categoryClass(category = '') {
  const index = [...category].reduce((total, char) => total + char.charCodeAt(0), 0) % categoryColors.length
  return categoryColors[index]
}

function StaffInventoryPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [appointments, setAppointments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [usageForm, setUsageForm] = useState({ appointmentId: '', dentistName: '', patientName: '', prescriptionReference: '', quantity: '', unitPrice: '', notes: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [inventoryResponse, appointmentResponse] = await Promise.all([
        fdmstApi.list('inventory?limit=100'),
        fdmstApi.getAppointments({ period: 'all', status: 'completed', limit: 100 }),
      ])
      setItems(inventoryResponse.data || [])
      setAppointments(appointmentResponse.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load inventory.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    const activeItems = items.filter((item) => item.isActive !== false)
    if (!term) return activeItems

    return activeItems.filter((item) => [item.itemName, item.category, item.supplier, item.unit]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [items, query])

  const summary = useMemo(() => ({
    total: items.length,
    lowStock: items.filter((item) => item.status === 'low_stock').length,
    outOfStock: items.filter((item) => item.status === 'out_of_stock').length,
  }), [items])
  const saleTotal = useMemo(() => {
    const quantity = Number(usageForm.quantity) || 0
    const unitPrice = Number(usageForm.unitPrice) || 0
    return quantity * unitPrice
  }, [usageForm.quantity, usageForm.unitPrice])

  const openUsageModal = (item) => {
    setSelectedItem(item)
    setUsageForm({ appointmentId: '', dentistName: '', patientName: '', prescriptionReference: '', quantity: '', unitPrice: String(item.sellingPrice ?? item.purchasePrice ?? 0), notes: '' })
    setFieldErrors({})
  }

  const closeUsageModal = () => {
    if (isSaving) return
    setSelectedItem(null)
    setUsageForm({ appointmentId: '', dentistName: '', patientName: '', prescriptionReference: '', quantity: '', unitPrice: '', notes: '' })
    setFieldErrors({})
  }

  const handleUsageChange = (event) => {
    const { name, value } = event.target
    setUsageForm((current) => ({
      ...current,
      [name]: name === 'quantity' ? value.replace(/[^\d.]/g, '') : value,
    }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const submitUsage = async (event) => {
    event.preventDefault()
    if (!selectedItem) return

    const errors = {}
    const quantity = Number(usageForm.quantity)
    const unitPrice = Number(usageForm.unitPrice)

    if (!quantity || quantity <= 0) errors.quantity = 'Enter a quantity greater than zero.'
    if (quantity > Number(selectedItem.quantity || 0)) errors.quantity = 'Insufficient stock for this deduction.'
    if (Number.isNaN(unitPrice) || unitPrice < 0) errors.unitPrice = 'Unit price must be zero or greater.'
    if (!usageForm.patientName.trim() && !usageForm.appointmentId) errors.patientName = 'Enter a patient or buyer name.'
    if (selectedItem.requiresPrescription && !usageForm.prescriptionReference.trim()) {
      errors.prescriptionReference = 'Prescription reference is required for this item.'
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }

    setIsSaving(true)
    try {
      const response = await fdmstApi.sellInventoryItem(selectedItem._id, {
        appointmentId: usageForm.appointmentId,
        dentistName: usageForm.dentistName,
        patientName: usageForm.patientName,
        prescriptionReference: usageForm.prescriptionReference,
        quantity,
        notes: usageForm.notes,
      })
      toast.success(response.message || 'Sale/release recorded.')
      setItems((current) => current.map((item) => item._id === response.item?._id ? response.item : item))
      closeUsageModal()
    } catch (error) {
      toast.error(error.message || 'Unable to record sale/release.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="px-6 py-8">
      <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
        <div className="bg-sky-950 px-6 py-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-amber-300 ring-1 ring-white/20">
                <FaBoxOpen className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold">Inventory Shop</h1>
                <p className="mt-1 text-sm text-sky-100">Browse clinic supplies, sell medicines, and release clinic-provided items.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                <p className="text-xl font-semibold">{summary.total}</p>
                <p className="text-xs text-sky-100">Items</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                <p className="text-xl font-semibold">{summary.lowStock}</p>
                <p className="text-xs text-sky-100">Low</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                <p className="text-xl font-semibold">{summary.outOfStock}</p>
                <p className="text-xs text-sky-100">Out</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold text-sky-950">Available Supplies</h2>
              <p className="mt-1 text-sm text-slate-500">{filteredItems.length} of {items.length} items shown</p>
            </div>
          </div>
          <label className="relative w-full lg:max-w-sm">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplies, category, supplier..." />
          </label>
        </div>

          {isLoading ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-3xl bg-slate-100" />
              ))}
            </div>
          ) : filteredItems.length ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => (
                <article key={item._id} className="group flex min-h-72 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-950/10">
                  <div className="relative flex h-28 items-center justify-center bg-slate-50">
                    <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${categoryClass(item.category)}`}>
                      {item.category || 'Uncategorized'}
                    </span>
                    <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105">
                      <FaBoxOpen className="h-7 w-7" />
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="min-h-20">
                      <h3 className="line-clamp-2 text-lg font-semibold text-sky-950">{item.itemName}</h3>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.notes || item.supplier || 'Clinic supply item'}</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock</p>
                        <p className="mt-1 text-lg font-semibold text-sky-950">{item.quantity ?? 0} <span className="text-sm font-medium text-slate-500">{item.unit || 'pcs'}</span></p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reorder</p>
                        <p className="mt-1 text-lg font-semibold text-sky-950">{item.reorderLevel ?? 0}</p>
                      </div>
                    </div>

                    <p className="mt-4 truncate text-xs font-medium text-slate-400">Supplier: {item.supplier || 'Not specified'}</p>

                    <button
                      type="button"
                      onClick={() => openUsageModal(item)}
                      disabled={Number(item.quantity || 0) <= 0}
                      title="Sell item"
                      aria-label={`Sell ${item.itemName}`}
                      className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-950 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaShoppingCart aria-hidden="true" />
                      Sell Item
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200">
                <FaBoxOpen className="h-7 w-7" />
              </span>
              <p className="mt-4 text-lg font-semibold text-sky-950">No inventory items found.</p>
              <p className="mt-2 text-sm text-slate-500">Try a different search term or ask an Admin to add inventory items.</p>
            </div>
          )}
        </div>
      </section>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form onSubmit={submitUsage} className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-sky-950/20">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Sell / Release Item</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedItem.itemName} • Available: {selectedItem.quantity} {selectedItem.unit} • {selectedItem.requiresPrescription ? 'Prescription required' : 'No prescription required'}</p>
              </div>
              <button type="button" onClick={closeUsageModal} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close">
                <FaTimes />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Patient or Buyer Name
                  <input className={inputClass} name="patientName" value={usageForm.patientName} onChange={handleUsageChange} placeholder="Enter patient or buyer name" />
                  {fieldErrors.patientName ? <span className="text-xs font-medium text-red-600">{fieldErrors.patientName}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Appointment / Treatment Reference
                  <select className={inputClass} name="appointmentId" value={usageForm.appointmentId} onChange={handleUsageChange}>
                    <option value="">Optional completed appointment</option>
                    {appointments.map((appointment) => (
                      <option key={appointment.id} value={appointment.id}>
                        {appointment.patientName} • {appointment.service} • {appointment.appointmentTime}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.appointmentId ? <span className="text-xs font-medium text-red-600">{fieldErrors.appointmentId}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Assigned Dentist
                  <input className={inputClass} name="dentistName" value={usageForm.dentistName} onChange={handleUsageChange} placeholder="Dentist name if applicable" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Prescription Reference
                  <input className={inputClass} name="prescriptionReference" value={usageForm.prescriptionReference} onChange={handleUsageChange} placeholder="Required for prescription items" />
                  {fieldErrors.prescriptionReference ? <span className="text-xs font-medium text-red-600">{fieldErrors.prescriptionReference}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Quantity
                  <input className={inputClass} name="quantity" value={usageForm.quantity} onChange={handleUsageChange} placeholder={`Enter quantity in ${selectedItem.unit}`} inputMode="numeric" />
                  {fieldErrors.quantity ? <span className="text-xs font-medium text-red-600">{fieldErrors.quantity}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600">
                  Unit Price
                  <input className={`${inputClass} bg-slate-50 text-slate-500`} name="unitPrice" value={usageForm.unitPrice} readOnly disabled title="Selling price is fixed by Admin." />
                  {fieldErrors.unitPrice ? <span className="text-xs font-medium text-red-600">{fieldErrors.unitPrice}</span> : null}
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Notes
                  <textarea className={`${inputClass} min-h-28 py-3`} name="notes" value={usageForm.notes} onChange={handleUsageChange} placeholder="Optional release or sale notes" />
                </label>
              </div>

              <aside className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-500">Sale Summary</p>
                <h3 className="mt-2 text-lg font-semibold text-sky-950">{selectedItem.itemName}</h3>
                <div className="mt-5 grid gap-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="text-slate-500">Available</span><strong className="text-sky-950">{selectedItem.quantity} {selectedItem.unit}</strong></div>
                  <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="text-slate-500">Quantity</span><strong className="text-sky-950">{usageForm.quantity || 0}</strong></div>
                  <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="text-slate-500">Unit Price</span><strong className="text-sky-950">₱{Number(usageForm.unitPrice || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-slate-500">Total Amount</p>
                    <p className="mt-1 text-3xl font-semibold text-sky-950">₱{saleTotal.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeUsageModal} disabled={isSaving} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60">
                {isSaving ? 'Recording...' : 'Confirm Sale / Release'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default StaffInventoryPage
