import { fetchWrapper } from '@/fetchWrapper'

export interface PhrApiError {
  status: number
  message: string
}

export async function phrGetJson(url: string): Promise<unknown> {
  try {
    return await fetchWrapper.get(url)
  } catch (caught) {
    const message = (() => {
      if (typeof caught === 'string') return caught
      if (caught && typeof caught === 'object' && 'message' in caught) return String(caught.message)
      return 'Request failed.'
    })()
    const notFound = message === 'Not Found' || message.includes('No query results for model')
    throw { status: notFound ? 404 : 0, message } satisfies PhrApiError
  }
}

export function isPhrApiError(error: unknown): error is PhrApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  )
}
