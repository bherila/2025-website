import { fetchWrapper } from '@/fetchWrapper'

export async function downloadFinanceExport(url: string, payload: Record<string, unknown>, fallbackFilename: string): Promise<void> {
  const response = await fetchWrapper.postRaw(url, payload)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Export failed with status ${response.status}`)
  }

  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition')
  const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}
