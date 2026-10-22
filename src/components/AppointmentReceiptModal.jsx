import { useEffect, useRef, useState } from 'react'
import {
  FaCheckCircle,
  FaFileInvoiceDollar,
  FaPrint,
  FaTimes,
  FaTooth,
} from 'react-icons/fa'
import { fdmstApi } from '../api/fdmstApi.js'

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return '₱0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function AppointmentReceiptModal({ appointment, onClose }) {
  const [clinicSettings, setClinicSettings] = useState(null)
  const printRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    fdmstApi.getPublicSettings()
      .then((settings) => {
        if (isMounted && settings) setClinicSettings(settings)
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  if (!appointment) return null

  const clinicName = clinicSettings?.clinicName || 'Flores-Dizon Dental Clinic'
  const clinicAddress = clinicSettings?.address || 'Maharlika Highway, Marcos District, 18 AH26, Talavera, Nueva Ecija'
  const clinicContact = clinicSettings?.contactNumber || '+63 912 345 6789'
  const clinicEmail = clinicSettings?.email || 'info@floresdizondental.com'

  const appointmentIdDisplay = appointment.appointmentId || `APT-${String(appointment._id || appointment.id || '').slice(-6).toUpperCase()}`
  const receiptNumber = `REC-${String(appointment.appointmentId || appointment._id || appointment.id || '').slice(-8).toUpperCase()}`

  const originalPrice = Number.isFinite(Number(appointment.originalPrice))
    ? Number(appointment.originalPrice)
    : Number.isFinite(Number(appointment.servicePriceSnapshot))
      ? Number(appointment.servicePriceSnapshot)
      : Number.isFinite(Number(appointment.finalPrice))
        ? Number(appointment.finalPrice)
        : 0

  const storedDiscountAmount = Number(appointment.discountAmount)
  const configuredPromoValue = Number(appointment.promoDiscountValue)
  const calculatedPromoDiscount = appointment.promoDiscountType === 'percentage'
    ? originalPrice * Math.min(Math.max(configuredPromoValue || 0, 0), 100) / 100
    : Math.min(Math.max(configuredPromoValue || 0, 0), originalPrice)
  const discountAmount = Number.isFinite(storedDiscountAmount) && storedDiscountAmount > 0
    ? storedDiscountAmount
    : appointment.promoCode || appointment.promoTitle
      ? Math.min(Math.round(calculatedPromoDiscount * 100) / 100, originalPrice)
      : 0
  const finalPrice = discountAmount > 0
    ? Math.max(Math.round((originalPrice - discountAmount) * 100) / 100, 0)
    : Number.isFinite(Number(appointment.finalPrice))
      ? Number(appointment.finalPrice)
      : originalPrice

  const isCompleted = appointment.status === 'completed' || Boolean(appointment.hasTreatmentRecord)
  const isCancelled = ['cancelled', 'declined'].includes(appointment.status)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-sky-950/50 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Inline Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #appointment-receipt-print-area,
          #appointment-receipt-print-area * {
            visibility: visible;
          }
          #appointment-receipt-print-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 24px;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="relative my-8 flex w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Actions (Hidden in Print) */}
        <div className="no-print flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-900">
              <FaFileInvoiceDollar className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-sky-950">Official Receipt</h3>
              <p className="text-xs text-slate-500">{appointmentIdDisplay}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-950 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-900"
            >
              <FaPrint className="h-3.5 w-3.5" /> Print Receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Close receipt"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div
          id="appointment-receipt-print-area"
          ref={printRef}
          className="p-6 sm:p-8 text-slate-800"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b-2 border-slate-900/80 pb-6">
            <div className="flex items-center gap-3.5">
              {clinicSettings?.clinicLogo ? (
                <img
                  src={clinicSettings.clinicLogo}
                  alt={clinicName}
                  className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-950 text-white shadow-sm">
                  <FaTooth className="h-7 w-7 text-amber-400" />
                </span>
              )}
              <div>
                <h1 className="text-xl font-black tracking-tight text-sky-950 sm:text-2xl">{clinicName}</h1>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Dental Healthcare Clinic</p>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">{clinicAddress}</p>
                <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{clinicContact}</span>
                  <span>•</span>
                  <span>{clinicEmail}</span>
                </p>
              </div>
            </div>

            <div className="sm:text-right">
              <span className="inline-block rounded-lg bg-sky-950 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
                Official Receipt
              </span>
              <p className="mt-2 text-xs font-semibold text-slate-500">Receipt No.</p>
              <p className="text-sm font-black font-mono text-sky-950">{receiptNumber}</p>
              <p className="mt-1 text-xs text-slate-500">Issue Date: <strong className="text-slate-700">{formatDate(new Date())}</strong></p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patient Details</p>
              <p className="mt-1 text-base font-black text-sky-950">{appointment.patientName || 'Patient'}</p>
              <p className="mt-0.5 text-xs text-slate-600">Contact: {appointment.contactNumber || 'Not provided'}</p>
              <p className="text-xs text-slate-600">Email: {appointment.email || 'Not provided'}</p>
            </div>

            <div className="sm:border-l sm:border-slate-200 sm:pl-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Appointment Information</p>
              <p className="mt-1 text-sm font-bold text-sky-950">ID: {appointmentIdDisplay}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Schedule: <strong className="text-slate-800">{formatDate(appointment.appointmentDate)}</strong> at <strong className="text-slate-800">{appointment.appointmentTime}</strong>
              </p>
              <p className="text-xs text-slate-600">
                Attending Dentist: <strong className="text-slate-800">{appointment.dentistName || 'Clinic Provider'}</strong>
              </p>
            </div>
          </div>

          {/* Service & Items Table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100 font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3">Description / Service</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Original Rate</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                <tr>
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-sky-950 text-sm">{appointment.service || 'Dental Consultation & Treatment'}</p>
                    {appointment.promoTitle || appointment.promoCode ? (
                      <p className="mt-0.5 text-[11px] text-emerald-700 font-medium">
                        Promo Applied: {appointment.promoTitle || appointment.promoCode}
                      </p>
                    ) : null}
                    {appointment.reason ? (
                      <p className="mt-0.5 text-[11px] text-slate-500 italic">
                        Reason: {appointment.reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      isCompleted
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : isCancelled
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                    }`}>
                      {isCompleted ? 'Completed' : (appointment.status || 'Confirmed')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-slate-600">
                    {formatCurrency(originalPrice)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                    {formatCurrency(finalPrice)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Totals Section */}
            <div className="border-t border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-1.5 sm:w-72 sm:ml-auto text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(originalPrice)}</span>
                </div>

                {discountAmount > 0 || appointment.promoCode || appointment.promoTitle ? (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Promo deduction ({appointment.promoCode || appointment.promoTitle || 'Promo'})</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                ) : null}

                <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-sky-950">
                  <span>Total Due</span>
                  <span className="text-base text-emerald-700">{formatCurrency(finalPrice)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status & Stamp */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-950'
              }`}>
                <FaCheckCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Status</p>
                <p className="text-sm font-black text-sky-950">
                  {isCompleted ? 'PAID IN FULL — VISIT COMPLETED' : 'RESERVED APPOINTMENT FEE'}
                </p>
                <p className="text-[11px] text-slate-500">Method: Clinic Front Desk / Cash</p>
              </div>
            </div>

            <div className="text-center sm:text-right border-t sm:border-t-0 border-slate-200 pt-3 sm:pt-0 w-full sm:w-auto">
              <div className="h-8 border-b border-slate-400 w-44 mx-auto sm:ml-auto" />
              <p className="mt-1 text-[11px] font-bold text-slate-700">Authorized Signature</p>
              <p className="text-[10px] text-slate-400">{clinicName}</p>
            </div>
          </div>

          {/* Footer Note */}
          <p className="mt-6 text-center text-[10px] text-slate-400">
            This official electronic receipt serves as proof of appointment and clinical service booking. For any questions, please contact our front desk at {clinicContact}.
          </p>
        </div>

        {/* Modal Bottom Actions (Hidden in Print) */}
        <div className="no-print flex flex-col-reverse sm:flex-row items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4 rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-900"
          >
            <FaPrint className="h-3.5 w-3.5" /> Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  )
}

export default AppointmentReceiptModal
