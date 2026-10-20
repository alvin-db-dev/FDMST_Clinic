import { FaStar } from 'react-icons/fa'

export default function FeedbackStars({ rating = 0, onChange, label = 'Rating', size = 'md' }) {
  const interactive = typeof onChange === 'function'
  const iconClass = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'

  return (
    <div className="flex items-center gap-1" aria-label={`${label}: ${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const icon = <FaStar className={`${iconClass} ${star <= rating ? 'text-amber-400' : 'text-slate-200'}`} aria-hidden="true" />

        return interactive ? (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="rounded-lg p-1 transition hover:scale-110 focus:outline-none focus:ring-4 focus:ring-amber-100"
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            aria-pressed={rating === star}
          >
            {icon}
          </button>
        ) : <span key={star}>{icon}</span>
      })}
    </div>
  )
}
