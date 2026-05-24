import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportJobData, GenAiImportResultData } from '@/genai-processor/types'

import { RsuImportJobCard } from '../RsuImportJobCard'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
  },
}))

const mockRefetch = jest.fn()
const mockPollingState = {
  status: 'parsed' as const,
  results: [] as GenAiImportResultData[],
  error: null as string | null,
  job: null as GenAiImportJobData | null,
  estimatedWait: undefined as string | undefined,
  refetch: mockRefetch,
}

jest.mock('@/genai-processor/useGenAiJobPolling', () => ({
  useGenAiJobPolling: () => mockPollingState,
}))

function parsedResult(payload: Record<string, unknown>): GenAiImportResultData {
  return {
    id: 7,
    job_id: 42,
    result_index: 0,
    result_json: JSON.stringify(payload),
    status: 'pending_review',
    imported_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('RsuImportJobCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPollingState.status = 'parsed'
    mockPollingState.error = null
    mockPollingState.estimatedWait = undefined
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({})
  })

  it('confirms a reviewed RSU vest result', async () => {
    const onResultFinalized = jest.fn()
    mockPollingState.results = [
      parsedResult({
        award_id: 'RSU-2026',
        grant_date: '2026-01-15',
        vest_date: '2027-01-15',
        share_count: 100,
        symbol: 'meta',
        grant_price: 415.25,
        vest_price: 505.5,
      }),
    ]

    render(<RsuImportJobCard jobId={42} filename="grant.pdf" onResultFinalized={onResultFinalized} />)

    fireEvent.click(screen.getByText('Import vest'))

    await waitFor(() => {
      expect(fetchWrapper.post).toHaveBeenCalledWith('/api/rsu/genai-import/42/results/7/confirm', {
        award_id: 'RSU-2026',
        grant_date: '2026-01-15',
        vest_date: '2027-01-15',
        share_count: 100,
        symbol: 'META',
        grant_price: 415.25,
        vest_price: 505.5,
      })
    })
    expect(mockRefetch).toHaveBeenCalled()
    expect(onResultFinalized).toHaveBeenCalled()
  })

  it('shows validation feedback before posting invalid data', () => {
    mockPollingState.results = [
      parsedResult({
        award_id: '',
        grant_date: '2026-01-15',
        vest_date: '2027-01-15',
        share_count: 100,
        symbol: 'META',
      }),
    ]

    render(<RsuImportJobCard jobId={42} filename="grant.pdf" onResultFinalized={jest.fn()} />)

    fireEvent.click(screen.getByText('Import vest'))

    expect(screen.getByText('Award ID is required')).toBeInTheDocument()
    expect(fetchWrapper.post).not.toHaveBeenCalled()
  })
})
