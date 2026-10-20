import { fdmstApi } from '../api/fdmstApi.js'

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('Unable to read the selected file.'))
  reader.readAsDataURL(file)
})

export const uploadImageFile = async (file, { folder = 'general', maxSizeBytes = 1024 * 1024 } = {}) => {
  const imageData = await readFileAsDataUrl(file)
  const response = await fdmstApi.uploadImage({
    imageData,
    fileName: file.name,
    folder,
    maxSizeBytes,
  })

  return response?.data?.url || ''
}

export const uploadClinicalFile = async (file) => {
  const fileData = await readFileAsDataUrl(file)
  const response = await fdmstApi.uploadClinicalFile({
    fileData,
    fileName: file.name,
  })

  return response?.data || null
}

export const uploadChatFile = async (file) => {
  const fileData = await readFileAsDataUrl(file)
  const response = await fdmstApi.uploadChatFile({
    fileData,
    fileName: file.name,
  })

  return response?.data || null
}
