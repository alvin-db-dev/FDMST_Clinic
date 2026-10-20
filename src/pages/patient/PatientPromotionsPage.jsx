import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FaCopy, FaGift, FaTag } from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

function PatientPromotionsPage() {
  const toast = useToast()
  const location = useLocation()
  const [promotions, setPromotions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedNotice, setSelectedNotice] = useState('')
  const userRole = authStorage.getUser()?.role

  const selectedPromotionId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('promotion') || ''
  }, [location.search])
  const actionPath = userRole === 'staff' ? '/staff/appointments' : userRole === 'admin' ? '/admin/promotions' : '/patient/book-appointment'
  const actionLabel = userRole === 'patient' ? 'Book Appointment' : 'View Appointments'
  const getPromotionActionPath = (promotion) => {
    if (userRole !== 'patient') return actionPath

    const params = new URLSearchParams()
    const service = promotion.applicableServices?.find((item) => item && item !== 'All Services') || promotion.serviceType
    if (service && service !== 'All Services') params.set('service', service)
    if (promotion.promoCode) params.set('promoCode', promotion.promoCode)
    const query = params.toString()
    return `${actionPath}${query ? `?${query}` : ''}`
  }
  const handleCopyPromoCode = async (promoCode) => {
    if (!promoCode) return
    try {
      await navigator.clipboard.writeText(promoCode)
      toast.success('Promo code copied.')
    } catch {
      toast.error('Unable to copy promo code.')
    }
  }

  const loadPromotions = useCallback(() => {
    let isActive = true
    setIsLoading(true)

    fdmstApi.list('promotions')
      .then((response) => {
        if (!isActive) return
        setPromotions(Array.isArray(response.data) ? response.data : [])
      })
      .catch((error) => {
        if (!isActive) return
        setPromotions([])
        toast.error(error.message || 'Unable to load clinic promotions.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [toast])

  useEffect(() => {
    let cleanup
    queueMicrotask(() => {
      cleanup = loadPromotions()
    })

    return () => {
      cleanup?.()
    }
  }, [loadPromotions])

  useEffect(() => {
    if (!selectedPromotionId) {
      setSelectedNotice('')
      return
    }

    if (isLoading) return

    const selectedPromotion = promotions.find((promotion) => promotion._id === selectedPromotionId)

    if (!selectedPromotion) {
      setSelectedNotice('This promotion is no longer available.')
      return
    }

    setSelectedNotice('')
    requestAnimationFrame(() => {
      document
        .getElementById(`promotion-${selectedPromotionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [isLoading, promotions, selectedPromotionId])

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Clinic Offers</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Clinic Promotions</h1>
              <p className="mt-3 max-w-2xl text-sky-100">
                View current dental offers and clinic announcements inside your portal.
              </p>
            </div>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
              <FaGift className="h-7 w-7" aria-hidden="true" />
            </span>
          </div>
        </section>

        <section className="mt-8">
          {selectedNotice ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800 shadow-sm">
              {selectedNotice}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              Loading promotions...
            </div>
          ) : promotions.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {promotions.map((promotion) => {
                const isSelected = selectedPromotionId === promotion._id

                return (
                  <article
                    key={promotion._id}
                    id={`promotion-${promotion._id}`}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                      isSelected ? 'border-amber-300 ring-4 ring-amber-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex h-36 items-center justify-between bg-sky-950 px-6 text-white">
                      <div>
                        <p className="text-sm font-semibold text-amber-300">{promotion.discountLabel || promotion.promoCode || 'Patient Offer'}</p>
                        <p className="mt-2 max-w-44 text-lg font-semibold leading-6">{promotion.serviceType || 'Dental Care'}</p>
                      </div>
                      {promotion.imageUrl ? (
                        <img src={promotion.imageUrl} alt="" className="h-20 w-24 rounded-2xl object-cover ring-1 ring-white/15" />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-amber-300 ring-1 ring-white/10">
                          <FaTag className="h-7 w-7" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      <h2 className="text-lg font-semibold text-sky-950">{promotion.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{promotion.description || 'Ask the clinic team about this current offer.'}</p>
                      <div className="mt-4 grid gap-2 text-sm">
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                          <span className="font-medium text-slate-500">Promo Code</span>
                          <button
                            type="button"
                            onClick={() => handleCopyPromoCode(promotion.promoCode)}
                            className="inline-flex items-center gap-2 font-semibold text-sky-950 hover:text-amber-600"
                          >
                            {promotion.promoCode || 'N/A'} <FaCopy className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="font-medium text-slate-500">Applicable Services</p>
                          <p className="mt-1 font-semibold text-sky-950">
                            {promotion.applicableServices?.length ? promotion.applicableServices.join(', ') : promotion.serviceType || 'All Services'}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="font-medium text-slate-500">Terms and Conditions</p>
                          <p className="mt-1 text-slate-600">Valid for active eligible services until the expiration date. One redemption per patient account.</p>
                        </div>
                      </div>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Expires {promotion.endDate ? formatDate(promotion.endDate) : 'soon'}
                      </p>
                      <Link to={getPromotionActionPath(promotion)} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900">
                        {actionLabel}
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <FaGift aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold text-sky-950">No active promotions right now</p>
              <p className="mt-2 text-sm text-slate-500">New patient offers will appear here when available.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default PatientPromotionsPage
