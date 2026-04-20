import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

jest.mock('@/components/finance/ScheduleCPreview', () => ({
  computeScheduleCNetIncome: () => ({ total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }),
}))

import { toast } from 'sonner'

import { TaxPreviewProvider, useTaxPreview } from '../TaxPreviewContext'

// --- helpers ---------------------------------------------------------------

const SHELL = { year: 2025, availableYears: [2025] }

function makeDoc(id: number, genai_status: string, form_type = '1099_int') {
  return {
    id,
    form_type,
    genai_status,
    is_reviewed: false,
    original_filename: `doc-${id}.pdf`,
    tax_year: 2025,
    parsed_data: null,
  }
}

function makeResponse(docs: object[] = []) {
  return {
    availableYears: [2025],
    payslips: [],
    pendingReviewCount: 0,
    w2Documents: [],
    accountDocuments: docs,
    scheduleCData: null,
    employmentEntities: [],
    accounts: [],
    activeAccountIds: [],
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TaxPreviewProvider initialData={SHELL}>{children}</TaxPreviewProvider>
}

beforeEach(() => jest.clearAllMocks())

// --- tests -----------------------------------------------------------------

describe('TaxPreviewContext', () => {
  it('does not show loading spinner on background polls', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'pending')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'pending')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Simulate a background poll
    await act(async () => { await result.current.refreshAll() })
    expect(result.current.isLoading).toBe(false)
  })

  it('registers a 5 s setInterval when a document is pending', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'pending')]))

    const spy = jest.spyOn(globalThis, 'setInterval')
    renderHook(() => useTaxPreview(), { wrapper })

    // Wait until the polling effect fires — it will call setInterval(fn, 5000)
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000))
    spy.mockRestore()
  })

  it('registers a 5 s setInterval when a document is processing', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'processing')]))

    const spy = jest.spyOn(globalThis, 'setInterval')
    renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000))
    spy.mockRestore()
  })

  it('does not register setInterval when all documents are already parsed', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const spy = jest.spyOn(globalThis, 'setInterval')
    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait until the fetch is fully settled (state updated + effects flushed)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(spy).not.toHaveBeenCalledWith(expect.any(Function), 5_000)
    spy.mockRestore()
  })

  it('calls clearInterval after all documents leave in-flight state', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'pending')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const clearSpy = jest.spyOn(globalThis, 'clearInterval')
    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait for the first fetch to fully settle so the polling interval is registered
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Simulate the poll returning parsed status
    await act(async () => { await result.current.refreshAll() })
    await waitFor(() => expect(clearSpy).toHaveBeenCalled())

    clearSpy.mockRestore()
  })

  it('fires a toast when a document transitions from pending to parsed', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'pending')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait for first fetch to fully settle so prevDocStatusRef is populated
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refreshAll() })
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('ready to review'),
      expect.objectContaining({ description: 'doc-1.pdf' }),
    )
  })

  it('fires a toast when a document transitions from processing to parsed', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'processing')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refreshAll() })
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
  })

  it('does not fire a toast when a document is already parsed on initial load', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('omits estimated tax payment results when marriage status is true because MFS is not yet supported', async () => {
    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') {
        return Promise.resolve({ 2025: true })
      }

      if (url === '/api/finance/user-tax-states?year=2025') {
        return Promise.resolve([])
      }

      if (url === '/api/finance/user-deductions?year=2025') {
        return Promise.resolve([])
      }

      return Promise.resolve(makeResponse())
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.isMarried).toBe(true))

    await act(async () => {
      result.current.setPriorYearTax(100_000)
      result.current.setPriorYearAgi(200_000)
    })

    expect(result.current.taxReturn.estimatedTaxPayments).toBeUndefined()
  })
})
