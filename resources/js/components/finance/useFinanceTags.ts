import { useCallback, useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

export interface FinanceTag {
  tag_id: number
  tag_label: string
  tag_color: string
  transaction_count?: number
}

interface UseFinanceTagsOptions {
  enabled?: boolean
  includeCounts?: boolean
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

export function useFinanceTags({ enabled = true, includeCounts = false, fallbackTags = [] }: UseFinanceTagsOptions = {}) {
  const [tags, setTags] = useState<FinanceTag[]>(fallbackTags)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTags = useCallback(async () => {
    if (!enabled) {
      setTags(fallbackTags)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const query = includeCounts ? '?include_counts=true' : ''
      const response = await fetchWrapper.get(`/api/finance/tags${query}`)
      const fetchedTags = normalizeFinanceTagsResponse(response)

      if (fetchedTags.length > 0) {
        setTags(fetchedTags)
      } else {
        setTags(fallbackTags)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tags'
      setError(message)
      setTags(fallbackTags)
    } finally {
      setIsLoading(false)
    }
  }, [enabled, fallbackTags, includeCounts])

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
