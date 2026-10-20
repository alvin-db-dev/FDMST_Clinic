import { useRef } from 'react'
import { digitsOnly } from '../utils/validation.js'

function OtpInput({ value = '', onChange, disabled = false, autoFocus = false, idPrefix = 'otp' }) {
  const refs = useRef([])
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '')

  const updateValue = (nextDigits) => {
    onChange?.(nextDigits.join('').slice(0, 6))
  }

  const focusBox = (index) => {
    const next = refs.current[index]
    if (next) {
      next.focus()
      next.select()
    }
  }

  const handleChange = (index, event) => {
    const numeric = digitsOnly(event.target.value)
    if (!numeric) {
      const nextDigits = [...digits]
      nextDigits[index] = ''
      updateValue(nextDigits)
      return
    }

    const nextDigits = [...digits]
    numeric.slice(0, 6 - index).split('').forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    updateValue(nextDigits)
    focusBox(Math.min(index + numeric.length, 5))
  }

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      const nextDigits = [...digits]
      nextDigits[index - 1] = ''
      updateValue(nextDigits)
      focusBox(index - 1)
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusBox(index - 1)
    }

    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  const handlePaste = (index, event) => {
    event.preventDefault()
    const pasted = digitsOnly(event.clipboardData.getData('text')).slice(0, 6)
    if (!pasted) return

    const nextDigits = [...digits]
    pasted.slice(0, 6 - index).split('').forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    updateValue(nextDigits)
    focusBox(Math.min(index + pasted.length, 5))
  }

  return (
    <div className="grid grid-cols-6 gap-2 sm:gap-3" role="group" aria-label="One-time password">
      {digits.map((digit, index) => (
        <input
          key={`${idPrefix}-${index}`}
          ref={(element) => {
            refs.current[index] = element
          }}
          aria-label={`OTP digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && index === 0}
          className="h-12 rounded-2xl border border-slate-200 bg-white text-center text-xl font-bold text-sky-950 shadow-sm outline-none transition placeholder:text-slate-300 focus:-translate-y-0.5 focus:border-sky-700 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:h-14 sm:text-2xl"
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          pattern="[0-9]*"
          type="text"
          value={digit}
        />
      ))}
    </div>
  )
}

export default OtpInput
