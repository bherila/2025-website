import { renderHook, waitFor } from '@testing-library/react'

import { normalizeFinanceTagsResponse, useFinanceTags } from '@/components/finance/useFinanceTags'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

describe('useFinanceTags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('normalizes { data: [...] } API shape', () => {
    const tags = [{ tag_id: 1, tag_label: 'Food', tag_color: 'blue' }]
    expect(normalizeFinanceTagsResponse({ data: tags })).toEqual(tags)
    expect(normalizeFinanceTagsResponse(tags)).toEqual([])
  })

  it('loads tags from API using stable envelope', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue({
      data: [{ tag_id: 1, tag_label: 'Food', tag_color: 'blue' }],
    })

    const { result } = renderHook(() => useFinanceTags())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tags')
    expect(result.current.tags).toEqual([{ tag_id: 1, tag_label: 'Food', tag_color: 'blue' }])
    expect(result.current.error).toBeNull()
  })

  it('uses include_counts query when requested', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useFinanceTags({ includeCounts: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tags?include_counts=true')
  })

  it('uses totals query when includeTotals is requested', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue({ data: [] })

    const { result } = renderHook(() => useFinanceTags({ includeTotals: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tags?totals=true')
  })

  it('falls back to supplied tags on API error', async () => {
    ;(fetchWrapper.get as jest.Mock).mockRejectedValue(new Error('network'))

    const fallbackTags = [{ tag_id: 2, tag_label: 'Travel', tag_color: 'green' }]
    const { result } = renderHook(() => useFinanceTags({ fallbackTags }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tags).toEqual(fallbackTags)
    expect(result.current.error).toBe('network')
  })

  it('does not loop infinitely when called with default inline fallbackTags', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue({ data: [] })

    // Simulate the ManageTagsPage call pattern: no fallbackTags provided
    // which means the default value [] is used — a new array on every render.
    // This should NOT cause an infinite fetch loop.
    const { result } = renderHook(() => useFinanceTags())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // The API should be called exactly once, not in an infinite loop
    expect(fetchWrapper.get).toHaveBeenCalledTimes(1)
  })
})
