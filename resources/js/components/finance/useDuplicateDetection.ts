import { useCallback, useEffect, useState } from 'react'

import { type AccountLineItem } from '@/data/finance/AccountLineItem'
import { filterOutDuplicates } from '@/data/finance/isDuplicateTransaction'
import { fetchWrapper } from '@/fetchWrapper'

interface UseDuplicateDetectionOptions {
  accountId: number | 'all'
}

interface UseDuplicateDetectionResult {
  existingTransactions: AccountLineItem[]
  loadingExisting: boolean
  filterDuplicates: (transactions: AccountLineItem[]) => AccountLineItem[]
}

/**
 * Loads existing transactions for duplicate detection.
 * Skips loading for 'all accounts' view since duplicate detection
 * is handled per-account during multi-account imports.
 */
export function useDuplicateDetection({
  accountId,
}: UseDuplicateDetectionOptions): UseDuplicateDetectionResult {
  const [existingTransactions, setExistingTransactions] = useState<AccountLineItem[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)

  // Load all existing transactions upfront (skip if accountId is 'all')
  useEffect(() => {
    if (accountId === 'all') {
      // For "all accounts" page, we can't load existing transactions
      // Multi-account imports will handle duplicate detection per account
      setLoadingExisting(false)
      return
    }

    const loadExistingTransactions = async () => {
      try {
        setLoadingExisting(true)
        const transactions = await fetchWrapper.get(`/api/finance/${accountId}/line_items`)
        setExistingTransactions(transactions)
      } catch (e) {
        console.error('Failed to load existing transactions:', e)
      } finally {
        setLoadingExisting(false)
      }
    }
    loadExistingTransactions()
  }, [accountId])

  const filterDuplicates = useCallback(
    (transactions: AccountLineItem[]): AccountLineItem[] => {
      return filterOutDuplicates(transactions, existingTransactions)
    },
    [existingTransactions],
  )

  return { existingTransactions, loadingExisting, filterDuplicates }
}