import { act,renderHook } from '@testing-library/react'

import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'

// Helper to create a mock File
function createMockFile(name = 'test.pdf', size = 1024, type = 'application/pdf'): File {
  const blob = new Blob(['mock-content'], { type })
  return new File([blob], name, { type })
}

describe('useGenAiFileUpload', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = jest.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockFetch = () => globalThis.fetch as jest.Mock

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions' }),
    )

    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(typeof result.current.upload).toBe('function')
  })

  it('should complete the upload flow successfully', async () => {
    mockFetch()
      // Step 1: request-upload
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            signed_url: 'https://s3.example.com/upload',
            s3_key: 'genai-import/1/test.pdf',
            expires_in: 900,
          }),
      } as Response)
      // Step 2: S3 PUT
      .mockResolvedValueOnce({ ok: true } as Response)
      // Step 3: create job
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            job_id: 42,
            status: 'pending',
          }),
      } as Response)

    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions', acctId: 1 }),
    )

    const file = createMockFile()
    let uploadResult: Awaited<ReturnType<typeof result.current.upload>>

    await act(async () => {
      uploadResult = await result.current.upload(file)
    })

    expect(uploadResult!.jobId).toBe(42)
    expect(uploadResult!.status).toBe('pending')
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toBeNull()

    // Verify fetch calls
    expect(mockFetch()).toHaveBeenCalledTimes(3)

    // Verify request-upload call
    const uploadReqCall = mockFetch().mock.calls[0]
    expect(uploadReqCall[0]).toBe('/api/genai/import/request-upload')
    expect(uploadReqCall[1]?.method).toBe('POST')

    // Verify S3 PUT call
    const s3Call = mockFetch().mock.calls[1]
    expect(s3Call[0]).toBe('https://s3.example.com/upload')
    expect(s3Call[1]?.method).toBe('PUT')

    // Verify create job call
    const jobCall = mockFetch().mock.calls[2]
    expect(jobCall[0]).toBe('/api/genai/import/jobs')
    expect(jobCall[1]?.method).toBe('POST')
  })

  it('should set error on request-upload failure', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({ error: 'Storage not configured' }),
    } as Response)

    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions' }),
    )

    const file = createMockFile()
    let caughtError: Error | null = null

    await act(async () => {
      try {
        await result.current.upload(file)
      } catch (e) {
        caughtError = e as Error
      }
    })

    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe('Storage not configured')
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toBe('Storage not configured')
  })

  it('should set error on S3 upload failure', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            signed_url: 'https://s3.example.com/upload',
            s3_key: 'key',
            expires_in: 900,
          }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions' }),
    )

    const file = createMockFile()
    let caughtError: Error | null = null

    await act(async () => {
      try {
        await result.current.upload(file)
      } catch (e) {
        caughtError = e as Error
      }
    })

    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe('Failed to upload file to storage')
    expect(result.current.error).toBe('Failed to upload file to storage')
  })

  it('should set error on job creation failure', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            signed_url: 'https://s3.example.com/upload',
            s3_key: 'key',
            expires_in: 900,
          }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: 'Invalid job type' }),
      } as Response)

    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions' }),
    )

    const file = createMockFile()
    let caughtError: Error | null = null

    await act(async () => {
      try {
        await result.current.upload(file)
      } catch (e) {
        caughtError = e as Error
      }
    })

    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe('Invalid job type')
    expect(result.current.error).toBe('Invalid job type')
  })

  it('should handle deduplicated responses', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            signed_url: 'https://s3.example.com/upload',
            s3_key: 'key',
            expires_in: 900,
          }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            job_id: 99,
            status: 'parsed',
            deduplicated: true,
          }),
      } as Response)

    const { result } = renderHook(() =>
      useGenAiFileUpload({ jobType: 'finance_transactions' }),
    )

    const file = createMockFile()
    let uploadResult: Awaited<ReturnType<typeof result.current.upload>>

    await act(async () => {
      uploadResult = await result.current.upload(file)
    })

    expect(uploadResult!.jobId).toBe(99)
    expect(uploadResult!.status).toBe('parsed')
    expect(uploadResult!.deduplicated).toBe(true)
  })
})
