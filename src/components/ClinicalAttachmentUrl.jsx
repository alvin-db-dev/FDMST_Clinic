import { useEffect, useState } from 'react'
import { fdmstApi } from '../api/fdmstApi.js'

const isLocalClinicalFileUrl = (url) => {
  if (!url) return false
  try {
    return new URL(url, window.location.origin).pathname === '/api/uploads/clinical-file-view'
  } catch {
    return false
  }
}

export default function ClinicalAttachmentUrl({ attachment, children }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    let objectUrl = ''

    if (!isLocalClinicalFileUrl(attachment.url)) {
      setError('')
      setUrl(attachment.url || '')
      return undefined
    }

    setError('')
    setUrl('')
    fdmstApi.getClinicalFile(attachment.path)
      .then((file) => {
        objectUrl = URL.createObjectURL(file)
        if (isCurrent) {
          setUrl(objectUrl)
        } else {
          URL.revokeObjectURL(objectUrl)
        }
      })
      .catch((error) => {
        console.error(`Unable to load clinical attachment "${attachment.name || attachment.path}":`, error)
        if (isCurrent) setError('Unable to load attachment. Please try again or contact an administrator.')
      })

    return () => {
      isCurrent = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.name, attachment.path, attachment.url])

  return children(url, error)
}
