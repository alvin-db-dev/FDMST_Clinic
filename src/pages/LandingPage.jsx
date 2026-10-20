import { useEffect, useMemo, useRef, useState } from 'react'
import { fdmstApi } from '../api/fdmstApi.js'

const navItems = [
  { label: 'Home', id: 'hero' },
  { label: 'Services', id: 'services' },
  { label: 'How It Works', id: 'how-it-works' },
]

const services = [
  {
    title: 'Dental Radiographs',
    description: 'Digital imaging support for diagnosis, treatment planning, and monitoring oral health.',
    icon: 'radiograph',
    accent: 'bg-sky-50 text-sky-950 ring-sky-100',
  },
  {
    title: 'Oral Surgery',
    description: 'Surgical dental care for impacted teeth, complex cases, and oral health concerns.',
    icon: 'surgery',
    accent: 'bg-red-50 text-red-600 ring-red-100',
  },
  {
    title: 'Veneers',
    description: 'Cosmetic restorations designed to improve tooth shape, color, and smile symmetry.',
    icon: 'veneers',
    accent: 'bg-amber-50 text-amber-600 ring-amber-100',
  },
  {
    title: 'Tooth Sealant',
    description: 'Protective coating that helps prevent cavities on chewing surfaces of teeth.',
    icon: 'sealant',
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  {
    title: 'Fluoride Treatment',
    description: 'Preventive care that strengthens enamel and helps reduce the risk of tooth decay.',
    icon: 'fluoride',
    accent: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  },
  {
    title: 'Braces / Orthodontic Treatment',
    description: 'Alignment care for improving bite, tooth position, and long-term smile function.',
    icon: 'braces',
    accent: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    title: 'Tooth Extraction',
    description: 'Careful removal of damaged, painful, or non-restorable teeth when needed.',
    icon: 'extraction',
    accent: 'bg-orange-50 text-orange-600 ring-orange-100',
  },
  {
    title: 'Dental Restoration',
    description: 'Tooth-colored fillings and restorative care for damaged or decayed teeth.',
    icon: 'restoration',
    accent: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    title: 'Crowns / Caps',
    description: 'Durable tooth covers that restore strength, shape, and appearance.',
    icon: 'crown',
    accent: 'bg-amber-50 text-amber-600 ring-amber-100',
  },
  {
    title: 'Fixed Partial Dentures (FPD)',
    description: 'Fixed bridgework used to replace missing teeth and restore chewing function.',
    icon: 'bridge',
    accent: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  },
  {
    title: 'Dentures',
    description: 'Removable tooth replacement options designed for comfort and everyday function.',
    icon: 'dentures',
    accent: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  {
    title: 'Oral Prophylaxis / Cleaning',
    description: 'Professional cleaning to remove plaque, tartar, and surface stains.',
    icon: 'cleaning',
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  {
    title: 'Root Canal Therapy (RCT)',
    description: 'Treatment for infected or inflamed tooth pulp to help save the natural tooth.',
    icon: 'rootCanal',
    accent: 'bg-rose-50 text-rose-600 ring-rose-100',
  },
  {
    title: 'Oral Check-up',
    description: 'Routine examination for early detection, prevention, and personalized care advice.',
    icon: 'checkup',
    accent: 'bg-sky-50 text-sky-950 ring-sky-100',
  },
]

const tickerServices = [
  'Prophylaxis',
  'Composite Filling',
  'Root Canal',
  'Tooth Extraction',
  'Orthodontic Braces',
  'Teeth Whitening',
  'Dental Implants',
  'Pediatric Dental',
]

const processSteps = [
  {
    title: 'Browse Dental Promos',
    description:
      'Explore our current patient deals and new client dental offers below. Find the promo that fits your oral health needs — from prophylaxis to whitening to implants.',
    icon: 'search',
    iconClass: 'bg-blue-50 text-sky-950 ring-blue-100',
  },
  {
    title: 'Choose Your Offer',
    description:
      'Select a dental promo and click the claim button. Some offers require a promo code — we’ll send it directly to your registered mobile number or email.',
    icon: 'tag',
    iconClass: 'bg-amber-50 text-amber-500 ring-amber-100',
  },
  {
    title: 'Book Your Appointment',
    description:
      'Use our easy online booking form to schedule your dental visit. Walk-ins are also welcome during clinic hours.',
    icon: 'calendarCheck',
    iconClass: 'bg-emerald-50 text-emerald-500 ring-emerald-100',
  },
  {
    title: 'Experience the Care',
    description:
      'Visit Flores-Dizon Dental and present your promo at the reception. Our dental team is ready to give you the best oral care and a smile you’ll be proud of.',
    icon: 'heartHandshake',
    iconClass: 'bg-red-50 text-red-500 ring-red-100',
  },
]

const faqs = [
  {
    question: 'How do I book a dental appointment?',
    answer:
      'Create or sign in to your patient account, select a dental service, choose an available date and time, and review the details before submitting your request.',
  },
  {
    question: 'What happens after I submit an appointment request?',
    answer:
      'Your request starts as Pending while the clinic reviews it. You can follow its status from your patient dashboard and receive a notification when it is confirmed, rescheduled, or cancelled.',
  },
  {
    question: 'Can I cancel or reschedule my appointment?',
    answer:
      'You may cancel or request a new schedule while the appointment is still pending. Once it has been confirmed, please contact the clinic so the staff can assist you.',
  },
  {
    question: 'Where can I view my appointment and treatment history?',
    answer:
      'Sign in to your patient portal to view appointment progress, completed treatments, provider recommendations, and upcoming follow-up visits.',
  },
  {
    question: 'How do clinic promotions work?',
    answer:
      'Available promotions are shown in the patient portal. When a promotion applies to your selected service, you can enter its promo code during booking and review the discount before confirming your request.',
  },
  {
    question: 'Can a patient under 18 create an account?',
    answer:
      'Yes. A minor’s account remains under the patient’s name, but parent or guardian information is required so the clinic has an authorized primary contact for appointments and important communications.',
  },
]

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const formatTimeLabel = (value) => {
  if (!value) return ''
  const [hourValue, minuteValue = '00'] = String(value).split(':')
  const hour = Number(hourValue)
  const minute = Number(minuteValue)

  if (Number.isNaN(hour) || Number.isNaN(minute)) return value

  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

const formatWorkingDays = (days = []) => {
  const orderedDays = dayOrder.filter((day) => days.includes(day))
  if (!orderedDays.length) return 'By appointment'
  if (orderedDays.length === 7) return 'Monday - Sunday'
  if (orderedDays.join('|') === 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday') return 'Monday - Saturday'
  if (orderedDays.join('|') === 'Monday|Tuesday|Wednesday|Thursday|Friday') return 'Monday - Friday'
  return orderedDays.join(', ')
}

function LineIcon({ type }) {
  const icons = {
    smile: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    tooth: (
      <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
    ),
    radiograph: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="M8 8h8M8 12h3M13 12h3M8 16h8" />
      </>
    ),
    surgery: (
      <>
        <path d="m4 20 7-7" />
        <path d="m10 14 5-5 3 3-5 5Z" />
        <path d="m14 6 4 4" />
      </>
    ),
    veneers: (
      <>
        <path d="M7 4h10l-1 16H8Z" />
        <path d="M10 4v16M14 4v16" />
      </>
    ),
    sealant: (
      <>
        <path d="M8.5 4C10 4 10.8 5 12 5s2-1 3.5-1C18 4 19 6 19 8.5c0 3-2 4.7-2.8 8.2-.4 1.6-1 2.8-2 2.8-1.2 0-1-1.5-2.2-1.5s-1 1.5-2.2 1.5c-1 0-1.6-1.2-2-2.8C7 13.2 5 11.5 5 8.5 5 6 6 4 8.5 4Z" />
        <path d="M8 10h8" />
      </>
    ),
    fluoride: (
      <>
        <path d="M12 3s5 5.2 5 9a5 5 0 0 1-10 0c0-3.8 5-9 5-9Z" />
        <path d="M10 13h4" />
      </>
    ),
    braces: (
      <>
        <path d="M4 9h16M4 15h16" />
        <path d="M7 7v4M12 7v4M17 7v4M7 13v4M12 13v4M17 13v4" />
      </>
    ),
    extraction: (
      <>
        <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
        <path d="m8 8 8 8M16 8l-8 8" />
      </>
    ),
    restoration: (
      <>
        <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    crown: (
      <>
        <path d="m4 9 4 3 4-7 4 7 4-3-2 10H6Z" />
        <path d="M6 19h12" />
      </>
    ),
    bridge: (
      <>
        <path d="M5 17V9a4 4 0 0 1 8 0v8" />
        <path d="M11 17V9a4 4 0 0 1 8 0v8" />
        <path d="M4 17h16" />
      </>
    ),
    dentures: (
      <>
        <path d="M4 11c2-4 14-4 16 0" />
        <path d="M5 14c2.5 4 11.5 4 14 0" />
        <path d="M8 11v5M12 10v7M16 11v5" />
      </>
    ),
    cleaning: (
      <>
        <path d="M5 19c4-1 7-4 8-8" />
        <path d="m12 4 8 8" />
        <path d="m15 7-7 7" />
      </>
    ),
    rootCanal: (
      <>
        <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
        <path d="M12 7v10" />
      </>
    ),
    checkup: (
      <>
        <path d="M9 3h6l1 2h3v16H5V5h3Z" />
        <path d="m9 13 2 2 4-5" />
      </>
    ),
    star: (
      <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.8Z" />
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    tag: (
      <>
        <path d="M20.6 13.1 13 20.7a2 2 0 0 1-2.8 0l-7-7V4h9.6l7.8 7.8a1 1 0 0 1 0 1.3Z" />
        <path d="M7.5 7.5h.01" />
      </>
    ),
    calendarCheck: (
      <>
        <path d="M8 2v4M16 2v4" />
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 15l2 2 4-4" />
      </>
    ),
    heartHandshake: (
      <>
        <path d="M19.5 12.5 12 20l-7.5-7.5a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1Z" />
        <path d="m8.5 12 2 2 5-5" />
      </>
    ),
    userPlus: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </>
    ),
    login: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    chevronRight: (
      <path d="m9 18 6-6-6-6" />
    ),
    mapPin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    phone: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z" />
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    code: (
      <>
        <path d="m8 18-6-6 6-6" />
        <path d="m16 6 6 6-6 6" />
        <path d="m14 4-4 16" />
      </>
    ),
  }

  return (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {icons[type]}
    </svg>
  )
}

function BrandMark({ logo, className = 'h-10 w-10', iconClass = '[&>svg]:h-5 [&>svg]:w-5' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sky-950 text-amber-500 shadow-md ${className} ${logo ? '' : iconClass}`}>
      {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : <LineIcon type="tooth" />}
    </span>
  )
}

function LandingPage() {
  const testimonialsSectionRef = useRef(null)
  const [openFaq, setOpenFaq] = useState(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [clinicSettings, setClinicSettings] = useState(null)
  const [testimonials, setTestimonials] = useState([])
  const [ratingSummary, setRatingSummary] = useState({ averageRating: 0, totalRatings: 0 })
  const [testimonialsLoading, setTestimonialsLoading] = useState(true)
  const clinicLogo = clinicSettings?.clinicLogo || ''
  const clinicName = clinicSettings?.clinicName || 'Flores-Dizon Dental Clinic'
  const clinicLocationLabel = useMemo(() => {
    const address = clinicSettings?.address || ''
    if (!address) return 'Clinic · Talavera'
    return address.includes('Talavera') ? 'Clinic · Talavera' : address
  }, [clinicSettings?.address])
  const appointmentSettings = clinicSettings?.appointmentSettings || {}
  const workingDays = appointmentSettings.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const closedDays = dayOrder.filter((day) => !workingDays.includes(day))
  const clinicHours = `${formatTimeLabel(appointmentSettings.openingTime || '09:00')} - ${formatTimeLabel(appointmentSettings.closingTime || '17:00')}`
  const footerQuickLinks = [
    { label: 'Home', action: () => handleNavClick('hero') },
    { label: 'Services', action: () => handleNavClick('services') },
    { label: 'How It Works', action: () => handleNavClick('how-it-works') },
    { label: 'Register', href: '/register' },
    { label: 'Sign In', href: '/login' },
    { label: 'Book Appointment', href: '/patient/book-appointment' },
  ]

  useEffect(() => {
    let isActive = true

    fdmstApi.getPublicSettings()
      .then((response) => {
        if (isActive) setClinicSettings(response || null)
      })
      .catch(() => {
        if (isActive) setClinicSettings(null)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    fdmstApi.getPublicFeedback()
      .then((response) => {
        if (!isActive) return
        setTestimonials(Array.isArray(response.data) ? response.data : [])
        setRatingSummary(response.summary || { averageRating: 0, totalRatings: 0 })
      })
      .catch(() => {
        if (!isActive) return
        setTestimonials([])
        setRatingSummary({ averageRating: 0, totalRatings: 0 })
      })
      .finally(() => {
        if (isActive) setTestimonialsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    const elements = testimonialsSectionRef.current?.querySelectorAll('[data-testimonial-reveal]')
    if (!elements?.length || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('testimonial-rise')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.15 })

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [testimonialsLoading, testimonials.length])

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const handleNavClick = (sectionId) => {
    scrollToSection(sectionId)
    setIsMenuOpen(false)
  }

  return (
    <main className="min-h-screen bg-white text-slate-700">
      <header className="sticky top-0 z-50 border-t-[3px] border-sky-950 bg-white shadow-sm">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[68px]">
          <button
            className="flex cursor-pointer items-center gap-2.5 rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            onClick={() => handleNavClick('hero')}
            type="button"
          >
            <BrandMark logo={clinicLogo} />
            <span>
              <span className="block whitespace-nowrap text-sm font-semibold leading-none text-sky-950 md:text-base">
                {clinicName}
              </span>
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                {clinicLocationLabel}
              </span>
            </span>
          </button>

          <div className="hidden flex-1 items-center justify-center gap-8 xl:gap-10 lg:flex">
            {navItems.map((item) => (
              <button
                className="cursor-pointer whitespace-nowrap rounded-full px-1 py-2 text-xs font-medium text-sky-950 transition hover:-translate-y-0.5 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 xl:text-sm"
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2.5 lg:flex">
            <a
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-sky-950 bg-white px-4 text-xs font-medium text-sky-950 transition hover:-translate-y-0.5 hover:bg-sky-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 [&>svg]:h-4 [&>svg]:w-4"
              href="/register"
            >
              <LineIcon type="userPlus" />
              Register
            </a>
            <a
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-4 text-xs font-medium text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 [&>svg]:h-4 [&>svg]:w-4"
              href="/login"
            >
              <LineIcon type="login" />
              Sign In
            </a>
            <a
              className="inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-sky-950 px-4 text-xs font-medium text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              href="/patient/book-appointment"
            >
              Book Appointment
            </a>
          </div>

          <button
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-sky-950 shadow-sm transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 lg:hidden [&>svg]:h-5 [&>svg]:w-5"
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
            type="button"
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
          >
            <LineIcon type={isMenuOpen ? 'close' : 'menu'} />
          </button>
        </nav>

        <div
          className={`overflow-hidden bg-white shadow-lg transition-all duration-300 lg:hidden ${
            isMenuOpen ? 'max-h-[620px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="mx-auto grid max-w-7xl gap-2 rounded-b-2xl px-4 pb-4 pt-1 sm:px-6">
            <div className="grid gap-1 border-b border-gray-100 pb-2">
              {navItems.map((item) => (
                <button
                  className="cursor-pointer whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium text-sky-950 transition hover:bg-gray-100 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 pt-1">
              <a
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-sky-950 bg-white px-5 text-sm font-medium text-sky-950 transition hover:bg-sky-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                href="/register"
              >
                <LineIcon type="userPlus" />
                Register
              </a>
              <a
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-sky-950 shadow-sm transition hover:border-sky-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                href="/login"
              >
                <LineIcon type="login" />
                Sign In
              </a>
              <a
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-sky-950 px-5 text-sm font-medium text-white shadow-md transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                href="/patient/book-appointment"
              >
                Book Appointment
              </a>
            </div>
          </div>
        </div>
      </header>

      <section
        id="hero"
        className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-slate-950 bg-[url('/LandingpageBG.png')] bg-cover bg-[position:64%_center] text-white sm:min-h-[520px] md:min-h-[560px] lg:min-h-[650px] lg:bg-[position:center_right]"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-sky-950/75 to-sky-900/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/15 via-transparent to-slate-950/10" />

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-center px-4 pb-20 pt-8 sm:min-h-[520px] sm:px-6 sm:pb-20 sm:pt-12 md:min-h-[560px] md:pt-16 lg:min-h-[650px] lg:items-start lg:pt-[120px]">
          <div className="max-w-[560px]">
            <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-400 sm:mb-5 sm:gap-3 sm:text-sm">
              <BrandMark
                logo={clinicLogo}
                className="h-8 w-8 bg-amber-500 text-white sm:h-9 sm:w-9"
                iconClass="[&>svg]:h-5 [&>svg]:w-5"
              />
              {clinicName} · {clinicLocationLabel.replace(/^Clinic ·\s*/i, '')}
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              Your Smile, <span className="text-amber-500">Our Priority</span>
            </h1>
            <p className="mt-4 max-w-[560px] text-sm font-normal leading-6 text-gray-200 sm:mt-6 sm:text-lg sm:leading-8">
              Comprehensive dental care — from routine prophylaxis and composite fillings to
              orthodontics, root canal treatment, and implants. Exclusive promos available for new
              and existing patients this March.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-gray-200 sm:mt-5 sm:gap-x-6 sm:gap-y-3 sm:text-base">
              <span className="inline-flex items-center gap-2">
                <span className="text-sky-300">
                  <LineIcon type="clock" />
                </span>
                {formatWorkingDays(workingDays)}, {clinicHours}
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
              <button
                className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-center text-sm font-medium text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:h-[52px] sm:px-7 sm:text-base"
                onClick={() => handleNavClick('promotions')}
                type="button"
              >
                Current Patient Deals
              </button>
              <button
                className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-white/80 bg-white/5 px-6 text-center text-sm font-medium text-white shadow-xl transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:h-[52px] sm:px-7 sm:text-base"
                onClick={() => handleNavClick('new-patients')}
                type="button"
              >
                New Patient Offers
              </button>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 h-14 bg-sky-950/95">
          <div className="mx-auto flex h-full max-w-7xl items-center overflow-hidden px-6">
            <div className="landing-service-ticker flex min-w-max items-center gap-8">
              {[...tickerServices, ...tickerServices].map((service, index) => (
                <span
                  className="inline-flex whitespace-nowrap text-xs font-medium text-gray-200 sm:text-sm"
                  key={`${service}-${index}`}
                >
                  <span className="mr-3 text-amber-500">•</span>
                  {service}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="overflow-hidden bg-white px-4 py-12 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex rounded-full bg-sky-950 px-6 py-2 text-xs font-medium uppercase tracking-[0.22em] text-white">
              Simple Process
            </p>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-sky-950 sm:mt-7 sm:text-3xl md:text-4xl">
              How to Redeem a Dental Promo
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-normal leading-6 text-gray-600 sm:mt-5 sm:text-lg sm:leading-8">
              Claiming your dental discount is quick and easy — just follow these four simple
              steps.
            </p>
          </div>

          <div className="relative mt-8 lg:mt-20">
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gray-200 md:block lg:left-0 lg:top-12 lg:h-px lg:w-full lg:translate-x-0" />

            <div className="relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:gap-14 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4 lg:gap-8">
              {processSteps.map((step, index) => (
                <article className="relative min-w-[15.5rem] snap-start rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm md:min-w-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none" key={step.title}>
                  <div
                    className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-md ring-2 sm:h-20 sm:w-20 lg:h-24 lg:w-24 ${step.iconClass}`}
                  >
                    <LineIcon type={step.icon} />
                    <span className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-sky-950 text-xs font-semibold text-white shadow-md sm:h-9 sm:w-9 sm:text-sm">
                      {index + 1}
                    </span>
                  </div>

                  <h3 className="mx-auto mt-5 max-w-[280px] text-lg font-semibold leading-tight text-sky-950 md:mt-8 md:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mx-auto mt-3 max-w-[280px] text-sm font-normal leading-6 text-gray-600 md:mt-4 md:text-base md:leading-8">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="bg-white px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-gray-100 bg-slate-50 px-4 py-8 shadow-sm sm:px-8 sm:py-10 lg:rounded-[2rem] lg:px-10 lg:py-14">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-sky-950 sm:text-3xl md:text-4xl">
                Our Dental Services
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base sm:leading-7">
                Flores-Dizon Dental Clinic provides preventive, restorative, surgical,
                orthodontic, and cosmetic dental care for confident everyday smiles.
              </p>
            </div>

            <div className="mt-5 flex items-center sm:hidden">
              <p className="text-xs font-medium text-slate-500">Swipe to explore services</p>
            </div>

            <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:mt-10 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 sm:grid-cols-2 xl:grid-cols-4">
              {services.map((service) => (
                <article
                  className="group flex min-h-48 min-w-[16rem] snap-start flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-amber-200 hover:shadow-xl sm:min-h-52 sm:min-w-0 sm:p-6"
                  key={service.title}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition group-hover:scale-105 sm:h-12 sm:w-12 ${service.accent}`}>
                      <LineIcon type={service.icon} />
                    </span>
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-400 transition group-hover:bg-amber-50 group-hover:text-amber-600">
                      Dental Care
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold leading-7 text-sky-950">
                    {service.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">
                    {service.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="promotions" className="bg-white px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0">
          <article className="min-w-[18rem] snap-start rounded-3xl bg-sky-900 p-6 text-white shadow-2xl sm:min-w-[22rem] sm:p-8 lg:min-w-0 lg:rounded-[2rem]">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400 sm:text-base">
              Current Patient Promotions
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Continue your care with confidence
            </h2>
            <p className="mt-3 text-sm font-normal leading-6 text-gray-200 sm:mt-4 sm:text-base sm:leading-8">
              Returning patients can schedule follow-up visits for prophylaxis,
              orthodontic consultation, treatment checks, crowns, bridges, and ongoing dental care.
            </p>
            <a
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-medium text-slate-900 shadow-lg transition hover:bg-amber-400 sm:mt-7 sm:py-3 sm:text-base"
              href="/patient/book-appointment"
            >
              Book Appointment
            </a>
          </article>

          <article id="new-patients" className="min-w-[18rem] snap-start rounded-3xl bg-gray-100 p-6 shadow-2xl sm:min-w-[22rem] sm:p-8 lg:min-w-0 lg:rounded-[2rem]">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-500 sm:text-base">
              New Patient Promotions
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Start your first visit the easy way
            </h2>
            <p className="mt-3 text-sm font-normal leading-6 text-gray-600 sm:mt-4 sm:text-base sm:leading-8">
              New patients can register online and prepare their clinic profile before
              booking an appointment with Flores-Dizon Dental Clinic.
            </p>
            <a
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-slate-800 sm:mt-7 sm:py-3 sm:text-base"
              href="/register"
            >
              Register Now
            </a>
          </article>
          </div>
        </div>
      </section>

      <section id="testimonials" ref={testimonialsSectionRef} className="bg-gray-100 px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div data-testimonial-reveal className="mx-auto max-w-3xl text-center">
            <p className="font-medium uppercase tracking-wider text-amber-500">Testimonials</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              What our patients say
            </h2>
            <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-amber-100 bg-white px-5 py-2.5 shadow-sm">
              <span className="flex items-center gap-1" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span className={star <= Math.round(ratingSummary.averageRating) ? 'text-amber-500' : 'text-gray-200'} key={star}><LineIcon type="star" /></span>
                ))}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                Average Rating: {ratingSummary.totalRatings ? `${ratingSummary.averageRating} / 5` : 'No ratings yet'}
              </span>
              {ratingSummary.totalRatings ? <span className="text-sm text-gray-500">({ratingSummary.totalRatings} rating{ratingSummary.totalRatings === 1 ? '' : 's'})</span> : null}
            </div>
          </div>

          {testimonialsLoading ? (
            <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3 md:gap-6">
              {[1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-[1.5rem] bg-white shadow-sm" />)}
            </div>
          ) : testimonials.length ? (
            <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:mt-10 md:grid md:overflow-visible md:px-0 md:pb-0 md:grid-cols-3 md:gap-6">
              {testimonials.map((testimonial, index) => (
                <article data-testimonial-reveal className="min-w-[17rem] snap-start rounded-[1.5rem] bg-white p-6 shadow-sm md:min-w-0 md:p-7" key={testimonial.id} style={{ animationDelay: `${Math.min(index, 4) * 100}ms` }}>
                  <div className="flex items-center gap-1 text-amber-500" aria-label={`${testimonial.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span className={star <= testimonial.rating ? 'text-amber-500' : 'text-gray-200'} key={star}><LineIcon type="star" /></span>
                    ))}
                  </div>
                  <p className="mt-4 text-base font-normal leading-7 text-gray-600 md:text-lg md:leading-8">“{testimonial.quote}”</p>
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <p className="font-medium text-slate-900">{testimonial.name}</p>
                    <p className="text-sm font-normal text-gray-600">{testimonial.role}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div data-testimonial-reveal className="mx-auto mt-8 max-w-xl rounded-[1.5rem] border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm md:mt-10">
              <p className="font-semibold text-slate-900">Patient testimonials are coming soon</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">Reviewed patient feedback will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <section id="faq" className="bg-white px-4 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="font-medium uppercase tracking-wider text-amber-500">FAQ</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>

          <div className="mt-8 space-y-3 sm:mt-10 sm:space-y-4">
            {faqs.map((faq, index) => (
              <article
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                key={faq.question}
              >
                <button
                  className="flex w-full items-center justify-between gap-4 bg-gray-100 px-5 py-4 text-left text-sm font-medium text-slate-900 sm:px-6 sm:py-5 sm:text-base"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  type="button"
                >
                  <span>{faq.question}</span>
                  <span className="text-3xl leading-none text-amber-500">
                    {openFaq === index ? '-' : '+'}
                  </span>
                </button>
                {openFaq === index && (
                  <p className="px-5 py-4 text-sm font-normal leading-7 text-gray-600 sm:px-6 sm:py-5 sm:text-base sm:leading-8">{faq.answer}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#031b2f] text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.25fr_1fr_1.2fr_1.1fr] lg:gap-12 lg:py-16">
          <div className="lg:border-r lg:border-white/10 lg:pr-10">
            <button
              type="button"
              onClick={() => handleNavClick('hero')}
              className="flex max-w-full items-center gap-4 rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <BrandMark logo={clinicLogo} className="h-16 w-16 rounded-2xl bg-white/5 ring-1 ring-white/10" iconClass="[&>svg]:h-9 [&>svg]:w-9" />
              <span className="min-w-0">
                <span className="block truncate text-xl font-bold leading-tight text-white">{clinicName}</span>
                <span className="mt-1 block text-xs font-bold uppercase tracking-[0.2em] text-amber-400">FDMST</span>
              </span>
            </button>
            <p className="mt-6 max-w-sm text-sm leading-7 text-slate-300">
              Delivering quality dental care with compassion, technology, and trust.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">Quick Links</h3>
            <div className="mt-6 grid gap-3">
              {footerQuickLinks.map((link) => (
                link.href ? (
                  <a
                    key={link.label}
                    href={link.href}
                    className="group flex items-center justify-between rounded-xl py-1 text-sm font-medium text-slate-300 transition hover:text-amber-400"
                  >
                    <span>{link.label}</span>
                    <span className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-400">
                      <LineIcon type="chevronRight" />
                    </span>
                  </a>
                ) : (
                  <button
                    key={link.label}
                    type="button"
                    onClick={link.action}
                    className="group flex items-center justify-between rounded-xl py-1 text-left text-sm font-medium text-slate-300 transition hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <span>{link.label}</span>
                    <span className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-400">
                      <LineIcon type="chevronRight" />
                    </span>
                  </button>
                )
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">Contact Us</h3>
            <div className="mt-6 grid gap-4 text-sm leading-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-amber-400"><LineIcon type="mapPin" /></span>
                <span>{clinicSettings?.address || 'Maharlika Highway, Marcos District, 18 AH26, Talavera, Nueva Ecija'}</span>
              </div>
              <a className="flex items-center gap-3 transition hover:text-amber-400" href={`tel:${clinicSettings?.contactNumber || '09123456789'}`}>
                <span className="text-amber-400"><LineIcon type="phone" /></span>
                <span>{clinicSettings?.contactNumber || '+63 912 345 6789'}</span>
              </a>
              <a className="flex items-center gap-3 transition hover:text-amber-400" href={`mailto:${clinicSettings?.email || 'info@floresdizondental.com'}`}>
                <span className="text-amber-400"><LineIcon type="mail" /></span>
                <span>{clinicSettings?.email || 'info@floresdizondental.com'}</span>
              </a>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-amber-400"><LineIcon type="clock" /></span>
                <span>{formatWorkingDays(workingDays)}: {clinicHours}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">Clinic Hours</h3>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm shadow-xl shadow-slate-950/20">
              <div className="flex items-center justify-between gap-4 py-2">
                <span>{formatWorkingDays(workingDays)}</span>
                <span className="font-semibold text-white">{clinicHours}</span>
              </div>
              <div className="mt-2 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <span>{closedDays.length ? closedDays.join(', ') : 'Closed Days'}</span>
                  <span className="font-semibold text-white">{closedDays.length ? 'Closed' : 'None'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <p>© 2026 FDMST - Flores-Dizon Dental Clinic Management System. All rights reserved.</p>
            <p className="font-semibold text-white">&lt;/&gt; BeastCode</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default LandingPage
