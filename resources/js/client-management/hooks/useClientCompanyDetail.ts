import { useCallback, useEffect, useState } from 'react'

import type { ClientCompany } from '@/client-management/types/common'
import { fetchWrapper } from '@/fetchWrapper'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

export function normalizeCompanyResponse(value: unknown): ClientCompany {
  if (!isRecord(value)) {
    throw new Error('Unexpected response from the company detail API.')
  }

  const company = value as unknown as ClientCompany

  return {
    ...company,
    users: Array.isArray(company.users) ? company.users : [],
    agreements: Array.isArray(company.agreements) ? company.agreements : [],
  }
}

/**
 * Loads a client company's detail record and exposes a refetch helper. Errors
 * are surfaced through the optional `onError` callback.
 */
export function useClientCompanyDetail(
  companyId: number,
  onError?: (message: string) => void,
): {
  company: ClientCompany | null
  setCompany: (company: ClientCompany) => void
  loading: boolean
  fetchCompany: () => Promise<void>
} {
  const [company, setCompany] = useState<ClientCompany | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCompany = useCallback(async () => {
    setLoading(true)
    try {
      const found = normalizeCompanyResponse(await fetchWrapper.get(`/api/client/mgmt/companies/${companyId}`))
      setCompany(found)
    } catch (error) {
      console.error('Error fetching company:', error)
      onError?.(getErrorMessage(error, 'Failed to load company details.'))
    } finally {
      setLoading(false)
    }
  }, [companyId, onError])

  useEffect(() => {
    void fetchCompany()
  }, [fetchCompany])

  return { company, setCompany, loading, fetchCompany }
}
