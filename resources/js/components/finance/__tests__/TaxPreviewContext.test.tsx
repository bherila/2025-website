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

  it('includes flat-dict broker_1099 income in income1099', async () => {
    // Flat-dict broker_1099 documents (single-account consolidated 1099) store
    // aggregate fields directly instead of a per-account array. They must flow
    // into income1099 so Schedule B, Form 4952, and 1040 estimates are correct.
    const brokerDoc = {
      id: 50,
      form_type: 'broker_1099',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      account_id: 33,
      parsed_data: {
        int_1_interest_income: 100,
        div_1a_total_ordinary: 500,
        div_1b_qualified: 400,
        div_7_foreign_tax_paid: 0,
      },
    };
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([brokerDoc]))
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.income1099.interestIncome.value).toBe(100)
    expect(result.current.income1099.dividendIncome.value).toBe(500)
    expect(result.current.income1099.qualifiedDividends.value).toBe(400)
  })

  it('shares memoized foreign-tax summaries from account documents', async () => {
    const brokerDoc = {
      id: 51,
      form_type: 'broker_1099',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      account_id: 33,
      parsed_data: {
        payer_name: 'Shared Broker',
        div_7_foreign_tax_paid: 25,
        int_6_foreign_tax_paid: 10,
      },
    }

    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([brokerDoc]))
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.foreignTaxSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        totalForeignTaxPaid: 25,
        sourceType: '1099_div',
        sourceDocumentId: 51,
        sourceLabel: 'Shared Broker',
      }),
      expect.objectContaining({
        totalForeignTaxPaid: 10,
        sourceType: '1099_int',
        sourceDocumentId: 51,
        sourceLabel: 'Shared Broker',
      }),
    ]))
  })

  it('aggregates Schedule 1 other income from reviewed 1099-MISC documents', async () => {
    const miscDoc = {
      id: 52,
      form_type: '1099_misc',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      misc_routing: 'sch_1_line_8',
      parsed_data: {
        payer_name: 'Other Income Payer',
        box3_other_income: 900,
      },
      original_filename: 'misc.pdf',
      account_links: [],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') {
        return Promise.resolve({})
      }

      if (url === '/api/finance/user-tax-states?year=2025') {
        return Promise.resolve([])
      }

      if (url === '/api/finance/user-deductions?year=2025') {
        return Promise.resolve([])
      }

      if (url === '/api/finance/tax-loss-carryforwards?year=2025') {
        return Promise.resolve([])
      }

      return Promise.resolve(makeResponse([miscDoc]))
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxReturn.form1040).toEqual(expect.arrayContaining([
      expect.objectContaining({
        line: '8',
        label: 'Other income (Schedule 1)',
        value: 900,
      }),
      expect.objectContaining({
        line: '9',
        value: 900,
      }),
    ]))
    expect(result.current.taxReturn.scheduleE?.grandTotal).toBe(0)
  })

  it('wires Schedule SE into the computed tax return when reviewed K-1 SE income exists', async () => {
    const k1Doc = {
      id: 77,
      form_type: 'k1',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        schemaVersion: '2026.1',
        formType: 'K-1-1065',
        fields: {
          B: { value: 'SE Partnership' },
        },
        codes: {
          '14': [{ code: 'A', value: '10000' }],
        },
      },
    }

    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([k1Doc]))
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxReturn.scheduleSE?.netEarningsFromSE).toBe(10_000)
    expect(result.current.taxReturn.schedule2?.selfEmploymentTax).toBeCloseTo(1_412.96, 2)
    expect(result.current.taxReturn.schedule2?.totalAdditionalTaxes).toBeCloseTo(1_412.96, 2)
  })

  it('feeds saved carryforwards into Form 8582 as prior-year unallowed loss balances', async () => {
    const k1Doc = {
      id: 88,
      form_type: 'k1',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        schemaVersion: '2026.1',
        formType: 'K-1-1065',
        fields: {
          A: { value: '12-3456789' },
          B: { value: 'Passive LP Fund' },
          G2: { value: 'true' },
          '1': { value: '-12000' },
        },
        codes: {},
      },
      employment_entity: { id: 88, display_name: 'Passive LP Fund' },
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/tax-loss-carryforwards?year=2025') {
        return Promise.resolve([
          {
            id: 3,
            activity_name: 'Passive LP Fund (ordinary business)',
            activity_ein: '12-3456789',
            ordinary_carryover: -4000,
            short_term_carryover: 0,
            long_term_carryover: 0,
          },
        ])
      }

      if (url === '/api/finance/user-tax-states?year=2025' || url === '/api/finance/user-deductions?year=2025') {
        return Promise.resolve([])
      }

      if (url === '/api/finance/marriage-status') {
        return Promise.resolve({})
      }

      return Promise.resolve(makeResponse([k1Doc]))
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.palCarryforwards).toHaveLength(1))

    expect(result.current.taxReturn.form8582?.activities[0]?.priorYearUnallowed).toBe(-4000)
    expect(result.current.taxReturn.form8582?.totalPriorYearUnallowed).toBe(-4000)
  })
})
