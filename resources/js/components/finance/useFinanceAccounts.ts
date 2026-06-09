import { useCallback, useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

export interface FinAccount {
  acct_id: number
  acct_name: string
  acct_number?: string | null
  acct_is_debt?: boolean
  acct_is_retirement?: boolean
  when_closed?: string | null
}

interface FinanceAccountsResponse {
  assetAccounts?: FinAccount[]
  liabilityAccounts?: FinAccount[]
  retirementAccounts?: FinAccount[]
}

export function useFinanceAccounts(options: { enabled?: boolean } = {}): {
  accounts: FinAccount[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
} {
  const enabled = options.enabled ?? true
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchWrapper.get('/api/finance/accounts') as FinanceAccountsResponse
      setAccounts([
        ...(data.assetAccounts ?? []),
        ...(data.liabilityAccounts ?? []),
        ...(data.retirementAccounts ?? []),
      ])
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught))
      setError(nextError)
      console.error('Failed to fetch finance accounts:', caught)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    void refetch()
  }, [enabled, refetch])

  return { accounts, isLoading, error, refetch }
}
