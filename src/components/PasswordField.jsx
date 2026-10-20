import { useId, useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'

function PasswordField({
  autoComplete,
  className,
  inputClassName,
  label,
  leftIcon: LeftIcon,
  minLength,
  name,
  onChange,
  placeholder = '••••••••',
  required,
  value,
}) {
  const inputId = useId()
  const [isVisible, setIsVisible] = useState(false)
  const Icon = isVisible ? FaEyeSlash : FaEye

  return (
    <label className={className || 'grid gap-2 text-sm font-semibold text-slate-500'} htmlFor={inputId}>
      {label}
      <span className="relative">
        {LeftIcon ? (
          <LeftIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        ) : null}
        <input
          id={inputId}
          autoComplete={autoComplete}
          className={`${inputClassName} w-full pr-14`}
          minLength={minLength}
          name={name}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          type={isVisible ? 'text' : 'password'}
          value={value}
        />
        <button
          type="button"
          onClick={() => setIsVisible((currentValue) => !currentValue)}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-100"
          aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
    </label>
  )
}

export default PasswordField
