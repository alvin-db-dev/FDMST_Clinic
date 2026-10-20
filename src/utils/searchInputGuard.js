const guardedInputTypes = new Set(['', 'text', 'search', 'email', 'tel', 'url'])

// Control characters are intentionally excluded from every free-text field.
// eslint-disable-next-line no-control-regex
const disallowedFieldCharacters = /[\u0000-\u001F\u007F()[\]{}<>;,|:\\/"'`~!#$%^&*+=?@]/g
// eslint-disable-next-line no-control-regex
const disallowedEmailCharacters = /[\u0000-\u001F\u007F()[\]{}<>;,|:\\/"'`~!#$%^&*+=?]/g

export function sanitizeSearchInput(value, element = null) {
  const pattern = element instanceof HTMLInputElement && element.type === 'email'
    ? disallowedEmailCharacters
    : disallowedFieldCharacters
  return String(value || '').replace(pattern, '')
}

function isGuardedField(element) {
  if (element instanceof HTMLTextAreaElement) return true
  return element instanceof HTMLInputElement && guardedInputTypes.has(String(element.type || '').toLowerCase())
}

function insertSanitizedText(element, text) {
  const sanitizedText = sanitizeSearchInput(text, element)
  if (!sanitizedText) return false

  const start = element.selectionStart ?? element.value.length
  const end = element.selectionEnd ?? element.value.length
  element.setRangeText(sanitizedText, start, end, 'end')
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: sanitizedText }))
  return true
}

export function installSearchInputGuard() {
  const handleBeforeInput = (event) => {
    if (!isGuardedField(event.target) || !event.data) return

    const sanitizedText = sanitizeSearchInput(event.data, event.target)
    if (sanitizedText === event.data) return

    event.preventDefault()
    insertSanitizedText(event.target, sanitizedText)
  }

  const handlePaste = (event) => {
    if (!isGuardedField(event.target)) return

    const pastedText = event.clipboardData?.getData('text') || ''
    const sanitizedText = sanitizeSearchInput(pastedText, event.target)
    if (sanitizedText === pastedText) return

    event.preventDefault()
    insertSanitizedText(event.target, sanitizedText)
  }

  const handleInput = (event) => {
    if (!isGuardedField(event.target)) return

    const sanitizedValue = sanitizeSearchInput(event.target.value, event.target)
    if (sanitizedValue === event.target.value) return

    event.target.value = sanitizedValue
    event.target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
  }

  document.addEventListener('beforeinput', handleBeforeInput, true)
  document.addEventListener('paste', handlePaste, true)
  document.addEventListener('input', handleInput, true)
}
