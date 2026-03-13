import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

export interface TagTotal {
  [year: string]: number
}

export interface FinanceTag {
  tag_id: number
  tag_label: string
  tag_color: string
  tax_characteristic?: string | null
  transaction_count?: number
  totals?: TagTotal
}

interface UseFinanceTagsOptions {
  enabled?: boolean
  includeCounts?: boolean
  includeTotals?: boolean
  fallbackTags?: FinanceTag[]
}

function isFinanceTag(value: unknown): value is FinanceTag {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.tag_id === 'number' && typeof candidate.tag_label === 'string' && typeof candidate.tag_color === 'string'
}

function normalizeTagList(values: unknown[]): FinanceTag[] {
  return values.filter(isFinanceTag)
}

export function normalizeFinanceTagsResponse(response: unknown): FinanceTag[] {
  if (response && typeof response === 'object') {
    const record = response as { data?: unknown }
    if (Array.isArray(record.data)) {
      return normalizeTagList(record.data)
    }
  }

  return []
}

export function useFinanceTags({ enabled = true, includeCounts = false, includeTotals = false, fallbackTags = [] }: UseFinanceTagsOptions = {}) {
  const [tags, setTags] = useState<FinanceTag[]>(fallbackTags)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use a ref for fallbackTags to prevent infinite re-renders when the caller
  // passes an inline array literal (e.g. fallbackTags={[]} or the default []).
  const fallbackTagsRef = useRef(fallbackTags)
  useEffect(() => {
    fallbackTagsRef.current = fallbackTags
  })

  const fetchTags = useCallback(async () => {
    if (!enabled) {
      setTags(fallbackTagsRef.current)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (includeCounts) params.set('include_counts', 'true')
      if (includeTotals) params.set('totals', 'true')
      const query = params.toString() ? `?${params.toString()}` : ''
      const response = await fetchWrapper.get(`/api/finance/tags${query}`)
      const fetchedTags = normalizeFinanceTagsResponse(response)

      if (fetchedTags.length > 0) {
        setTags(fetchedTags)
      } else {
        setTags(fallbackTagsRef.current)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tags'
      setError(message)
      setTags(fallbackTagsRef.current)
    } finally {
      setIsLoading(false)
    }
  }, [enabled, includeCounts, includeTotals])
  // NOTE: fallbackTags is intentionally excluded from deps — it is accessed via
  // fallbackTagsRef to avoid infinite re-render loops when callers pass an
  // inline array literal as the default value.

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  return {
    tags,
    isLoading,
    error,
    refreshTags: fetchTags,
  }
}
