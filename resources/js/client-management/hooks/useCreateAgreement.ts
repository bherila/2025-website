import { useCallback, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import { getErrorMessage } from './useClientCompanyDetail'

/**
 * Posts a new draft agreement for a company. The endpoint responds with a
 * redirect to the new agreement editor, so a success navigates the browser.
 */
export function useCreateAgreement(
  companyId: number,
  onError?: (message: string) => void,
): { createAgreement: () => Promise<void>; creating: boolean } {
  const [creating, setCreating] = useState(false)

  const createAgreement = useCallback(async () => {
    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('client_company_id', companyId.toString())

      const response = await fetchWrapper.postRaw('/client/mgmt/agreement', formData)

      if (response.redirected) {
        window.location.href = response.url
      } else if (response.ok) {
        await response.text()
        if (response.url) {
          window.location.href = response.url
        }
      } else {
        throw new Error('Failed to create agreement')
      }
    } catch (error) {
      console.error('Error creating agreement:', error)
      onError?.(getErrorMessage(error, 'Failed to create agreement'))
    } finally {
      setCreating(false)
    }
  }, [companyId, onError])

  return { createAgreement, creating }
}
