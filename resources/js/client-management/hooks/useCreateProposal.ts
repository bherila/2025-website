import { useCallback, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import { getErrorMessage } from './useClientCompanyDetail'

/**
 * Posts a new draft proposal for a company. The endpoint responds with a
 * redirect to the proposal builder, so a success navigates the browser.
 */
export function useCreateProposal(
  companyId: number,
  onError?: (message: string) => void,
): { createProposal: () => Promise<void>; creating: boolean } {
  const [creating, setCreating] = useState(false)

  const createProposal = useCallback(async () => {
    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('client_company_id', companyId.toString())

      const response = await fetchWrapper.postRaw('/client/mgmt/proposal', formData)

      if (response.redirected) {
        window.location.href = response.url
      } else if (response.ok) {
        await response.text()
        if (response.url) {
          window.location.href = response.url
        }
      } else {
        throw new Error('Failed to create proposal')
      }
    } catch (error) {
      console.error('Error creating proposal:', error)
      onError?.(getErrorMessage(error, 'Failed to create proposal'))
    } finally {
      setCreating(false)
    }
  }, [companyId, onError])

  return { createProposal, creating }
}
