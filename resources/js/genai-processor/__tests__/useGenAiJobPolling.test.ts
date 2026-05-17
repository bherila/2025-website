import { renderHook, waitFor } from '@testing-library/react'

import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'

const mockGet = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

describe('useGenAiJobPolling', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('should initialize with null state when no jobId', () => {
    const { result } = renderHook(() => useGenAiJobPolling(null))

    expect(result.current.status).toBeNull()
    expect(result.current.results).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.job).toBeNull()
    expect(result.current.estimatedWait).toBeUndefined()
  })

  it('should fetch job data on mount', async () => {
    const mockJob = {
      id: 42,
      status: 'parsed',
      results: [
        { id: 1, job_id: 42, result_index: 0, result_json: '{"test":true}', status: 'pending_review' },
      ],
      error_message: null,
    }

    mockGet.mockResolvedValue(mockJob)

    const { result } = renderHook(() => useGenAiJobPolling(42))

    await waitFor(() => {
      expect(result.current.status).toBe('parsed')
    })

    expect(result.current.results).toHaveLength(1)
    expect(result.current.error).toBeNull()
    expect(result.current.job).toEqual(mockJob)
  })

  it('should set estimatedWait when queued_tomorrow', async () => {
    const mockJob = {
      id: 42,
      status: 'queued_tomorrow',
      scheduled_for: '2026-03-24',
      results: [],
      error_message: null,
    }

    mockGet.mockResolvedValue(mockJob)

    const { result } = renderHook(() => useGenAiJobPolling(42))

    await waitFor(() => {
      expect(result.current.status).toBe('queued_tomorrow')
    })

    expect(result.current.estimatedWait).toContain('2026-03-24')
  })

  it('should set error on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Job not found'))

    const { result } = renderHook(() => useGenAiJobPolling(42))

    await waitFor(() => {
      expect(result.current.error).toBe('Job not found')
    })
  })

  it('should set error message from job data', async () => {
    const mockJob = {
      id: 42,
      status: 'failed',
      results: [],
      error_message: 'Gemini API error',
    }

    mockGet.mockResolvedValue(mockJob)

    const { result } = renderHook(() => useGenAiJobPolling(42))

    await waitFor(() => {
      expect(result.current.status).toBe('failed')
    })

    expect(result.current.error).toBe('Gemini API error')
  })
})
