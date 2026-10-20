import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FaBullhorn,
  FaCalendarAlt,
  FaCheck,
  FaChevronDown,
  FaCloudUploadAlt,
  FaEdit,
  FaExclamationTriangle,
  FaEye,
  FaImage,
  FaPlus,
  FaPowerOff,
  FaSearch,
  FaTag,
  FaTimes,
  FaTrash,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'
import { readFileAsDataUrl, uploadImageFile } from '../../utils/imageUpload.js'

const initialForm = {
  title: '',
  description: '',
  imageUrl: '',
  discountLabel: '',
  discountType: 'fixed',
  discountValue: '',
  serviceType: 'All Services',
  applicableServices: ['All Services'],
  promoCode: '',
  startDate: '',
  endDate: '',
  maxRedemptions: '',
  status: 'active',
  audience: 'all',
}

const promotionInputClass = `${inputClass} w-full min-w-0 rounded-xl`
const promotionTextareaClass = `${promotionInputClass} min-h-24 resize-none py-3`
const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxImageSize = 2 * 1024 * 1024
const promoServices = [
  'All Services',
  'Dental Radiographs',
  'Oral Surgery',
  'Veneers',
  'Tooth Sealant',
  'Fluoride Treatment',
  'Braces / Orthodontic Treatment',
  'Tooth Extraction',
  'Dental Restoration',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dentures',
  'Oral Prophylaxis / Cleaning',
  'Root Canal Therapy (RCT)',
  'Oral Check-up',
]

function statusBadge(status) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
    expired: 'bg-red-50 text-red-700 ring-red-100',
  }

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${styles[status] || styles.inactive}`}>
      {status || 'inactive'}
    </span>
  )
}

function getPromotionReminder(promotion, now = new Date()) {
  const endDate = promotion.endDate?.slice(0, 10)
  if (!endDate) {
    return promotion.status === 'expired'
      ? { label: 'Needs Update', message: 'This promotion is marked expired. Review its dates and status before making it available again.', tone: 'text-red-600 hover:text-red-700' }
      : null
  }

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(now)
  const daysLeft = Math.round((Date.parse(endDate) - Date.parse(today)) / 86400000)
  if (promotion.status === 'expired' || daysLeft < 0) {
    return { label: promotion.status === 'expired' ? 'Needs Update' : 'Expired', message: `This promotion ended on ${formatDate(promotion.endDate)}. Update the end date and status to make it available again.`, tone: 'text-red-600 hover:text-red-700' }
  }
  if (promotion.status === 'active' && daysLeft <= 7) {
    return { label: 'Expires Soon', message: `This promotion ends ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}. Review its details or extend the end date if it should continue.`, tone: 'text-amber-700 hover:text-amber-800' }
  }
  return null
}

function getPromotionDiscountText(promotion) {
  if (!(Number(promotion.discountValue) > 0)) return promotion.discountLabel || 'General offer'
  return promotion.discountType === 'percentage' ? `${promotion.discountValue}% off` : `₱${promotion.discountValue} off`
}

function AdminPromotionsPage() {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [promotions, setPromotions] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [reminderPromotion, setReminderPromotion] = useState(null)
  const [serviceOptions, setServiceOptions] = useState(promoServices)
  const [serviceSearch, setServiceSearch] = useState('')
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false)
  const [servicePickerAbove, setServicePickerAbove] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const imageInputRef = useRef(null)
  const servicePickerRef = useRef(null)
  const isSavingRef = useRef(false)
  const isFormOpen = isCreateOpen || Boolean(editingId)

  const loadPromotions = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fdmstApi.list('promotions')
      setPromotions(response.data || [])
    } catch (error) {
      if (!silent) toast.error(error.message || 'Unable to load promotions.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadPromotions)
    const timer = setInterval(() => loadPromotions({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadPromotions])

  useEffect(() => {
    let active = true
    fdmstApi.list('clinic-settings').then((response) => {
      if (!active) return
      const configured = (response.data?.[0]?.services || [])
        .filter((service) => service.status !== 'inactive')
        .map((service) => service.serviceName)
        .filter(Boolean)
      if (configured.length) setServiceOptions(['All Services', ...new Set(configured)])
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isServicePickerOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!servicePickerRef.current?.contains(event.target)) setIsServicePickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [isServicePickerOpen])

  useEffect(() => {
    if (!isFormOpen && !reminderPromotion) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      if (isServicePickerOpen) setIsServicePickerOpen(false)
      else if (reminderPromotion) setReminderPromotion(null)
      else if (!isSaving) {
        setForm(initialForm)
        setEditingId('')
        setIsCreateOpen(false)
        setFieldErrors({})
        setSubmitError('')
        setImageFile(null)
        setImagePreview('')
        setUploadedImageUrl('')
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isFormOpen, isSaving, isServicePickerOpen, reminderPromotion])

  const filteredPromotions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return promotions.filter((promotion) => {
      const matchesQuery = !normalizedQuery || [
        promotion.title,
        promotion.description,
        promotion.discountLabel,
        promotion.serviceType,
        promotion.promoCode,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery))
      const matchesStatus = statusFilter === 'all' || promotion.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [promotions, query, statusFilter])

  const availableServices = useMemo(() => [...new Set([...serviceOptions, ...(form.applicableServices || [])])]
    .filter((service) => service.toLowerCase().includes(serviceSearch.trim().toLowerCase())), [serviceOptions, form.applicableServices, serviceSearch])

  const selectedServices = form.applicableServices || []
  const previewImage = imagePreview || form.imageUrl

  const resetForm = () => {
    setForm(initialForm)
    setEditingId('')
    setIsCreateOpen(false)
    setFieldErrors({})
    setSubmitError('')
    setServiceSearch('')
    setIsServicePickerOpen(false)
    setServicePickerAbove(false)
    setImageFile(null)
    setImagePreview('')
    setUploadedImageUrl('')
    setIsDraggingImage(false)
  }

  const openCreatePromotion = () => {
    resetForm()
    setIsCreateOpen(true)
  }

  const openPromotionDraft = useCallback((draft) => {
    setEditingId('')
    setForm({
      ...initialForm,
      ...draft,
      status: 'inactive',
      applicableServices: draft.applicableServices?.length
        ? draft.applicableServices
        : [draft.serviceType || 'All Services'],
    })
    setFieldErrors({})
    setSubmitError('')
    setServiceSearch('')
    setIsServicePickerOpen(false)
    setServicePickerAbove(false)
    setImageFile(null)
    setImagePreview('')
    setUploadedImageUrl('')
    setIsDraggingImage(false)
    setIsCreateOpen(true)
  }, [])

  useEffect(() => {
    const draft = location.state?.promotionDraft
    if (!draft) return
    openPromotionDraft(draft)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate, openPromotionDraft])

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextStartDate = name === 'startDate' ? value : form.startDate
    const nextEndDate = name === 'endDate' ? value : form.endDate
    setForm((current) => {
      const next = { ...current, [name]: value }
      if (name === 'discountType' || name === 'discountValue') {
        const previousLabel = current.discountType === 'percentage' ? `${current.discountValue}% off` : `₱${current.discountValue} off`
        if (current.discountLabel === previousLabel) {
          next.discountLabel = next.discountType === 'percentage' ? `${next.discountValue}% off` : `₱${next.discountValue} off`
        }
      }
      if (name === 'endDate' && current.status === 'expired') {
        const selectedEndDate = value ? new Date(`${value}T23:59:59`) : null
        if (!selectedEndDate || selectedEndDate > new Date()) {
          next.status = 'active'
        }
      }
      return next
    })
    setFieldErrors((current) => ({
      ...current,
      [name]: '',
      ...(name === 'startDate' || name === 'endDate' ? {
        endDate: nextStartDate && nextEndDate && nextEndDate < nextStartDate
          ? 'End date must be after the start date.' : '',
      } : {}),
    }))
    setSubmitError('')
  }

  const updateSelectedServices = (selected) => {
    setForm((current) => ({
      ...current,
      serviceType: selected[0] || '',
      applicableServices: selected,
    }))
    setFieldErrors((current) => ({ ...current, applicableServices: '' }))
  }

  const toggleService = (service) => {
    if (service === 'All Services') {
      updateSelectedServices(['All Services'])
      setIsServicePickerOpen(false)
      return
    }
    const current = selectedServices.filter((item) => item !== 'All Services')
    const next = current.includes(service) ? current.filter((item) => item !== service) : [...current, service]
    updateSelectedServices(next)
  }

  const toggleServicePicker = () => {
    if (!isServicePickerOpen) {
      const bounds = servicePickerRef.current?.getBoundingClientRect()
      setServicePickerAbove(Boolean(bounds && window.innerHeight - bounds.bottom < 260 && bounds.top > 260))
    }
    setIsServicePickerOpen((open) => !open)
  }

  const removeService = (service) => {
    const next = selectedServices.filter((item) => item !== service)
    updateSelectedServices(next)
  }

  const selectImageFile = async (file) => {
    if (!file) return

    if (!acceptedImageTypes.includes(file.type)) {
      setFieldErrors((current) => ({ ...current, imageUrl: 'Choose a JPG, PNG, or WebP image.' }))
      return
    }

    if (file.size > maxImageSize) {
      setFieldErrors((current) => ({ ...current, imageUrl: 'Image must be 2 MB or smaller.' }))
      return
    }

    try {
      const preview = await readFileAsDataUrl(file)
      setImageFile(file)
      setImagePreview(preview)
      setUploadedImageUrl('')
      setFieldErrors((current) => ({ ...current, imageUrl: '' }))
    } catch (error) {
      setFieldErrors((current) => ({ ...current, imageUrl: error.message || 'Unable to preview the selected image.' }))
    }
  }

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    selectImageFile(file)
  }

  const handleImageDrop = (event) => {
    event.preventDefault()
    setIsDraggingImage(false)
    selectImageFile(event.dataTransfer.files?.[0])
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview('')
    setUploadedImageUrl('')
    setForm((current) => ({ ...current, imageUrl: '' }))
    setFieldErrors((current) => ({ ...current, imageUrl: '' }))
  }

  const validate = () => {
    const errors = {}
    if (!form.title.trim()) errors.title = 'Promotion title is required.'
    if (!form.promoCode.trim()) errors.promoCode = 'Promo code is required.'
    if (!selectedServices.length) errors.applicableServices = 'Select at least one service or All Services.'
    if (fieldErrors.imageUrl) errors.imageUrl = fieldErrors.imageUrl
    const discountValue = Number(form.discountValue)
    if (!Number.isFinite(discountValue) || discountValue <= 0 || (form.discountType === 'percentage' && discountValue > 100)) {
      errors.discountValue = form.discountType === 'percentage'
        ? 'Percentage discount must be greater than 0 and no more than 100.'
        : 'Fixed discount must be greater than 0.'
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      errors.endDate = 'End date must be after the start date.'
    }
    if (form.maxRedemptions && (!Number.isInteger(Number(form.maxRedemptions)) || Number(form.maxRedemptions) < 1)) {
      errors.maxRedemptions = 'Enter a whole number greater than zero, or leave blank for unlimited use.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSavingRef.current) return
    if (!validate()) return

    isSavingRef.current = true
    setIsSaving(true)
    setSubmitError('')

    try {
      let imageUrl = form.imageUrl.trim()
      if (imageFile) {
        setIsUploadingImage(true)
        try {
          imageUrl = uploadedImageUrl || await uploadImageFile(imageFile, { folder: 'promotions', maxSizeBytes: maxImageSize })
          setUploadedImageUrl(imageUrl)
        } finally {
          setIsUploadingImage(false)
        }
      }
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        imageUrl,
        discountLabel: form.discountLabel.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        serviceType: form.serviceType.trim(),
        applicableServices: form.applicableServices?.length ? form.applicableServices : [form.serviceType],
        promoCode: form.promoCode.trim(),
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
      }
      const saved = editingId
        ? await fdmstApi.update('promotions', editingId, payload)
        : await fdmstApi.create('promotions', payload)
      setPromotions((current) => editingId
        ? current.map((promotion) => promotion._id === saved._id ? saved : promotion)
        : [saved, ...current])
      await loadPromotions({ silent: true })
      toast.success(editingId ? 'Promotion updated successfully.' : 'Promotion created successfully.')
      resetForm()
    } catch (error) {
      setFieldErrors(error.errors || {})
      setSubmitError(error.message || 'Unable to save promotion.')
      toast.error(error.message || 'Unable to save promotion.')
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
      setIsUploadingImage(false)
    }
  }

  const editPromotion = (promotion) => {
    setIsCreateOpen(false)
    setImageFile(null)
    setImagePreview('')
    setUploadedImageUrl('')
    setSubmitError('')
    setEditingId(promotion._id)
    setForm({
      ...initialForm,
      ...promotion,
      startDate: promotion.startDate ? promotion.startDate.slice(0, 10) : '',
      endDate: promotion.endDate ? promotion.endDate.slice(0, 10) : '',
      discountValue: promotion.discountValue ?? '',
      maxRedemptions: promotion.maxRedemptions ?? '',
      applicableServices: promotion.applicableServices?.length ? promotion.applicableServices : [promotion.serviceType || 'All Services'],
    })
    setFieldErrors({})
  }

  const updateStatus = async (promotion) => {
    const nextStatus = promotion.status === 'active' ? 'inactive' : 'active'
    try {
      const saved = await fdmstApi.update('promotions', promotion._id, { ...promotion, status: nextStatus })
      setPromotions((current) => current.map((item) => item._id === saved._id ? saved : item))
      toast.success(`Promotion ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`)
    } catch (error) {
      toast.error(error.message || 'Unable to update promotion status.')
    }
  }

  const deletePromotion = async (promotion) => {
    if (!window.confirm(`Delete "${promotion.title}"?`)) return

    try {
      await fdmstApi.remove('promotions', promotion._id)
      setPromotions((current) => current.filter((item) => item._id !== promotion._id))
      toast.success('Promotion deleted.')
    } catch (error) {
      toast.error(error.message || 'Unable to delete promotion.')
    }
  }

  const promotionEditor = (
    <article className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[90rem] flex-col overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-200">
                <FaBullhorn className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="promotion-form-title" className="text-xl font-semibold text-sky-950">{editingId ? 'Update Promotion' : 'Add Promotion'}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{editingId ? 'Review and update this clinic promotion.' : 'Create a new promotion for your clinic.'}</p>
              </div>
            </div>
            <button type="button" onClick={resetForm} disabled={isSaving} autoFocus className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-sky-950 disabled:opacity-50" aria-label="Close promotion form"><FaTimes /></button>
          </div>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 sm:p-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,0.9fr)]">
            <div className="grid min-w-0 content-start gap-4">
              <div>
                <h3 className="text-sm font-semibold text-sky-950">Basic Information</h3>
                <p className="mt-1 text-xs text-slate-500">Name and describe the offer patients will see.</p>
              </div>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Promotion Title
              <input className={promotionInputClass} name="title" value={form.title} onChange={handleChange} placeholder="e.g. Free Dental Check-up" required />
              {fieldErrors.title ? <span className="text-xs text-red-600">{fieldErrors.title}</span> : null}
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Promo Code
              <input className={promotionInputClass} name="promoCode" value={form.promoCode} onChange={handleChange} placeholder="FD2026" required />
              {fieldErrors.promoCode ? <span className="text-xs text-red-600">{fieldErrors.promoCode}</span> : null}
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Description
              <textarea className={promotionTextareaClass} name="description" value={form.description} onChange={handleChange} placeholder="Brief promotion details" />
            </label>
            <section className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-sky-950">Promotion Image</h3>
              <p className="mt-1 text-xs text-slate-500">Add a banner to help patients recognize this offer.</p>
              <input ref={imageInputRef} accept={acceptedImageTypes.join(',')} className="sr-only" onChange={handleImageFileChange} type="file" tabIndex={-1} />
              <div
                className={`mt-3 flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed text-center transition ${isDraggingImage ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-slate-50'}`}
                onDragOver={(event) => { event.preventDefault(); setIsDraggingImage(true) }}
                onDragLeave={() => setIsDraggingImage(false)}
                onDrop={handleImageDrop}
              >
                {previewImage ? <img src={previewImage} alt="Promotion preview" className="h-36 w-full object-contain" /> : (
                  <div className="px-4 py-5 text-slate-500"><FaCloudUploadAlt className="mx-auto h-7 w-7 text-amber-600" aria-hidden="true" /><p className="mt-2 text-sm font-medium">Drag an image here</p><p className="mt-1 text-xs">JPG, PNG, or WebP, up to 2 MB</p></div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={isSaving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-sky-950 transition hover:bg-slate-50 disabled:opacity-50"><FaImage className="h-4 w-4" />{previewImage ? 'Replace Image' : 'Choose File'}</button>
                {previewImage ? <button type="button" onClick={removeImage} disabled={isSaving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-100 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"><FaTrash className="h-3.5 w-3.5" />Remove</button> : null}
              </div>
              {fieldErrors.imageUrl ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.imageUrl}</p> : null}
            </section>
            </div>
            <div className="grid min-w-0 content-start gap-4">
              <div>
                <h3 className="text-sm font-semibold text-sky-950">Discount Details</h3>
                <p className="mt-1 text-xs text-slate-500">Set the value and where the offer applies.</p>
              </div>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Discount / Details
              <input className={promotionInputClass} name="discountLabel" value={form.discountLabel} onChange={handleChange} placeholder="20% off, Free consultation, etc." />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Discount Type
                <select className={promotionInputClass} name="discountType" value={form.discountType} onChange={handleChange}>
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Discount Value
                <input
                  className={promotionInputClass}
                  name="discountValue"
                  type="number"
                  min="0"
                  max={form.discountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={form.discountValue}
                  onChange={handleChange}
                  placeholder={form.discountType === 'percentage' ? '20' : '500'}
                  required
                />
                {fieldErrors.discountValue ? <span className="text-xs text-red-600">{fieldErrors.discountValue}</span> : null}
              </label>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-sky-950">Applicable Services</h3>
              <p className="mt-1 text-xs text-slate-500">Select individual services or All Services.</p>
            </div>
            <div className="grid gap-4">
              <div ref={servicePickerRef} className="relative min-w-0">
                <span className="text-sm font-semibold text-sky-950">Applicable Service(s)</span>
                <div className="mt-2 flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                  {selectedServices.length ? selectedServices.map((service) => (
                    <span key={service} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-950">
                      <span className="truncate">{service}</span>
                      <button type="button" onClick={() => removeService(service)} className="shrink-0 rounded p-0.5 transition hover:bg-sky-100" aria-label={`Remove ${service}`}><FaTimes className="h-3 w-3" /></button>
                    </span>
                  )) : <span className="px-2 text-sm text-slate-400">Select services</span>}
                  <button type="button" onClick={toggleServicePicker} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100" aria-label="Choose applicable services" aria-expanded={isServicePickerOpen}><FaChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                {isServicePickerOpen ? (
                  <div className={`absolute left-0 right-0 z-30 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ${servicePickerAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <label className="relative block"><FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input autoFocus value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Search services..." className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-sky-500" /></label>
                    <div className="mt-2 max-h-48 overflow-y-auto">
                      {availableServices.length ? availableServices.map((service) => <button key={service} type="button" onClick={() => toggleService(service)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-sky-50"><span className="min-w-0 truncate">{service}</span>{selectedServices.includes(service) ? <FaCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}</button>) : <p className="px-3 py-2 text-sm text-slate-500">No matching services.</p>}
                    </div>
                  </div>
                ) : null}
                {fieldErrors.applicableServices ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.applicableServices}</p> : null}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-sky-950">Promotion Period</h3>
              <p className="mt-1 text-xs text-slate-500">Set the dates this promotion is available.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Start Date
                <input className={promotionInputClass} type="date" name="startDate" value={form.startDate} onChange={handleChange} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                End Date
                <input className={promotionInputClass} type="date" name="endDate" min={form.startDate || undefined} value={form.endDate} onChange={handleChange} />
                {fieldErrors.endDate ? <span className="text-xs text-red-600">{fieldErrors.endDate}</span> : null}
              </label>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-sky-950">Redemption Limit</h3>
              <p className="mt-1 text-xs text-slate-500">Leave blank for unlimited redemptions.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Maximum Redemptions
              <input className={promotionInputClass} name="maxRedemptions" type="number" min="1" value={form.maxRedemptions} onChange={handleChange} placeholder="Optional" />
              {fieldErrors.maxRedemptions ? <span className="text-xs text-red-600">{fieldErrors.maxRedemptions}</span> : null}
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Status
              <select className={promotionInputClass} name="status" value={form.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
              </label>
            </div>
            </div>
            <aside className="min-w-0 border-t border-slate-200 pt-5 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="flex items-center gap-2 text-sky-950"><FaEye className="h-4 w-4 text-amber-600" aria-hidden="true" /><h3 className="text-sm font-semibold">Live Preview</h3></div>
              <p className="mt-1 text-xs text-slate-500">This preview updates as you fill in the form.</p>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {previewImage ? <img src={previewImage} alt="" className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-slate-50 text-slate-300"><FaImage className="h-9 w-9" aria-hidden="true" /></div>}
                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-950">{form.promoCode.trim().toUpperCase() || 'PROMO CODE'}</span>
                    {statusBadge(form.status)}
                  </div>
                  <div><h4 className="break-words text-lg font-semibold text-sky-950">{form.title.trim() || 'Promotion title'}</h4><p className="mt-2 break-words text-sm leading-6 text-slate-600">{form.description.trim() || 'Your promotion description will appear here.'}</p></div>
                  <div className="border-t border-slate-100 pt-3 text-sm"><p className="font-semibold text-sky-950">{getPromotionDiscountText(form)}</p><p className="mt-1 text-slate-500">{selectedServices.length ? selectedServices.join(', ') : 'Select applicable services'}</p></div>
                  <div className="flex items-start gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600"><FaCalendarAlt className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /><span>{form.startDate ? formatDate(form.startDate) : 'Anytime'} - {form.endDate ? formatDate(form.endDate) : 'No end date'}</span></div>
                </div>
              </div>
            </aside>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
              <p role={submitError ? 'alert' : undefined} className="min-w-0 text-sm font-medium text-red-600">{submitError}</p>
              <div className="ml-auto flex flex-wrap justify-end gap-3">
              <button type="button" onClick={resetForm} disabled={isSaving} className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving}>
                {editingId ? <FaEdit className="h-4 w-4" aria-hidden="true" /> : <FaPlus className="h-4 w-4" aria-hidden="true" />}
                {isSaving ? isUploadingImage ? 'Uploading image...' : 'Saving...' : editingId ? 'Save Changes' : 'Add Promotion'}
              </button>
              </div>
            </div>
          </form>
    </article>
  )

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section>
        <article className="rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Promotions Management</h2>
              <p className="mt-1 text-sm text-slate-500">Create, update, deactivate, or remove clinic promotions.</p>
            </div>
            <button type="button" onClick={openCreatePromotion} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900">
              <FaPlus className="h-4 w-4" aria-hidden="true" /> Add Promotion
            </button>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 pb-5 sm:flex-row sm:items-center sm:gap-0 sm:px-6">
            <label className="relative w-full sm:min-w-0 sm:flex-1">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className={`${inputClass} w-full min-w-0 pl-11 sm:rounded-r-none`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search promotions..." />
            </label>
            <select className={`${inputClass} w-full sm:w-48 sm:shrink-0 sm:rounded-l-none sm:border-l-0`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Loading promotions...</p>
          ) : filteredPromotions.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Promotion</th>
                    <th className="px-5 py-4">Details</th>
                    <th className="px-5 py-4">Promo Code</th>
                    <th className="px-5 py-4">Dates</th>
                    <th className="min-w-36 px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPromotions.map((promotion) => {
                    const reminder = getPromotionReminder(promotion)
                    const discountText = getPromotionDiscountText(promotion)
                    return (
                    <tr key={promotion._id} className="border-t border-slate-100">
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          {promotion.imageUrl ? (
                            <img src={promotion.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100"><FaTag /></span>
                          )}
                          <div>
                            <p className="font-semibold text-sky-950">{promotion.title}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{promotion.description || 'No description'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-slate-600">
                        <div className="font-semibold text-slate-700">{discountText}</div>
                        {promotion.discountLabel && promotion.discountLabel !== discountText
                          ? <div className="mt-1 text-xs text-slate-500">{promotion.discountLabel}</div>
                          : null}
                        <div className="mt-1 text-xs text-slate-400">
                          {(promotion.applicableServices?.length ? promotion.applicableServices : [promotion.serviceType || 'All Services']).join(', ')}
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        {promotion.promoCode ? (
                          <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-950 ring-1 ring-sky-100">
                            {promotion.promoCode}
                          </span>
                        ) : (
                          <span className="text-slate-400">No code</span>
                        )}
                      </td>
                      <td className="px-5 py-5 text-slate-600">{promotion.startDate ? formatDate(promotion.startDate) : 'Anytime'} - {promotion.endDate ? formatDate(promotion.endDate) : 'No end date'}</td>
                      <td className="min-w-36 px-5 py-5 align-middle">
                        <div className="flex flex-col items-start gap-1.5">
                          {statusBadge(promotion.status)}
                          {reminder ? <button type="button" onClick={() => setReminderPromotion(promotion)} className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold transition hover:underline hover:underline-offset-2 ${reminder.tone}`} title={reminder.message} aria-label={`${promotion.title}: ${reminder.label}. View reminder`}><FaExclamationTriangle className="h-3 w-3 shrink-0" />{reminder.label}</button> : null}
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editPromotion(promotion)} className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sky-50 px-3 text-xs font-semibold text-sky-950 transition hover:bg-sky-100" aria-label={`Update ${promotion.title}`} title={`Update ${promotion.title}`}><FaEdit />Update Promotion</button>
                          <button type="button" onClick={() => updateStatus(promotion)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 transition hover:bg-amber-100" aria-label={`Toggle ${promotion.title}`} title={promotion.status === 'active' ? 'Deactivate promotion' : 'Activate promotion'}><FaPowerOff /></button>
                          <button type="button" onClick={() => deletePromotion(promotion)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 transition hover:bg-red-100" aria-label={`Delete ${promotion.title}`} title="Delete promotion"><FaTrash /></button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No promotions found.
            </div>
          )}
        </article>
      </section>
      {isFormOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-sky-950/50 px-4 py-4" role="dialog" aria-modal="true" aria-labelledby="promotion-form-title">
          {promotionEditor}
        </div>
      ) : null}
      {reminderPromotion ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-sky-950/40 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="promotion-reminder-title">
          <div className="w-full max-w-sm rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="promotion-reminder-title" className="text-lg font-semibold text-sky-950">{getPromotionReminder(reminderPromotion)?.label || 'Promotion Reminder'}</h2>
                <p className="mt-1 text-sm font-medium text-slate-600">{reminderPromotion.title}</p>
              </div>
              <button type="button" onClick={() => setReminderPromotion(null)} autoFocus className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50" aria-label="Close promotion reminder"><FaTimes /></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{getPromotionReminder(reminderPromotion)?.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReminderPromotion(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Close</button>
              <button type="button" onClick={() => { editPromotion(reminderPromotion); setReminderPromotion(null) }} className="h-10 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-900">Update Promotion</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default AdminPromotionsPage
