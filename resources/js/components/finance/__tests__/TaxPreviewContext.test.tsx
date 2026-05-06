import { act, renderHook, waitFor } from '@testing-library/react'
import currency from 'currency.js'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

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
    year: 2025,
    availableYears: [2025],
    payslips: [],
    pendingReviewCount: 0,
    w2Documents: [],
    accountDocuments: docs,
    scheduleCData: null,
    employmentEntities: [],
    accounts: [],
    activeAccountIds: [],
    taxFacts: null,
  }
}

function makeTaxFacts(): TaxPreviewFacts {
  return {
    year: 2025,
    scheduleC: {
      entities: [],
      line31Sources: [],
      grossReceiptsTotal: 0,
      expensesTotal: 0,
      homeOfficeAllowable: 0,
      homeOfficeDisallowed: 0,
      homeOfficePriorCarryforward: 0,
      netProfit: 0,
      netProfitCumulativeByQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 },
      netProfitRoutedToSchedule1: 0,
    },
    scheduleF: {
      grossIncomeSources: [],
      grossFarmIncome: 0,
      expenseSources: [],
      totalFarmExpenses: 0,
      netFarmProfit: 0,
      hasActivity: false,
      line34Sources: [],
    },
    scheduleSE: {
      entries: [],
      wageSources: [],
      scheduleFSources: [],
      netEarningsFromSE: 0,
      seTaxableEarnings: 0,
      socialSecurityWageBase: 176100,
      socialSecurityWages: 0,
      remainingSocialSecurityWageBase: 176100,
      socialSecurityTaxableEarnings: 0,
      socialSecurityTax: 0,
      medicareWages: 0,
      medicareTaxableEarnings: 0,
      medicareTax: 0,
      additionalMedicareThreshold: 200000,
      additionalMedicareTaxableEarnings: 0,
      additionalMedicareTax: 0,
      seTax: 0,
      deductibleSeTax: 0,
    },
    schedule1: {
      line3Sources: [],
      line3Total: 0,
      line5Sources: [],
      line5Total: 0,
      line6Sources: [],
      line6Total: 0,
      line8zSources: [{
        id: 'doc-1-schedule1-8z',
        label: 'Fidelity — 1099-MISC other income',
        amount: 42,
        sourceType: '1099_misc_other_income',
        taxDocumentId: 1,
        taxDocumentAccountId: null,
        accountId: null,
        formType: '1099_misc',
        box: null,
        code: null,
        routing: 'default_schedule_1_8z',
        routingReason: 'Default route',
        notes: null,
        isReviewed: true,
        reviewStatus: 'reviewed',
        reviewAction: null,
      }],
      line8Sources: [{
        id: 'doc-1-schedule1-8z',
        label: 'Fidelity — 1099-MISC other income',
        amount: 42,
        sourceType: '1099_misc_other_income',
        taxDocumentId: 1,
        taxDocumentAccountId: null,
        accountId: null,
        formType: '1099_misc',
        box: null,
        code: null,
        routing: 'default_schedule_1_8z',
        routingReason: 'Default route',
        notes: null,
        isReviewed: true,
        reviewStatus: 'reviewed',
        reviewAction: null,
      }],
      line8bSources: [],
      line8bTotal: 0,
      line8hSources: [],
      line8hTotal: 0,
      line8iSources: [],
      line8iTotal: 0,
      line8zTotal: 42,
      line9TotalOtherIncome: 42,
      line15Sources: [],
      line15Total: 0,
    },
    scheduleB: {
      interestSources: [],
      directInterestTotal: 0,
      k1InterestTotal: 0,
      interestTotal: 0,
      ordinaryDividendSources: [],
      directOrdinaryDividendTotal: 0,
      k1OrdinaryDividendTotal: 0,
      ordinaryDividendTotal: 0,
      qualifiedDividendSources: [],
      qualifiedDividendTotal: 0,
      form4952Line5aTotal: 0,
    },
    form4952: {
      investmentInterestSources: [],
      totalInvestmentInterestExpense: 0,
      investmentExpenseSources: [],
      totalInvestmentExpenses: 0,
      excludedInvestmentExpenseSources: [],
      totalExcludedInvestmentExpenses: 0,
      grossInvestmentIncomeFromScheduleB: 0,
      grossInvestmentIncomeFromK1: 0,
      grossInvestmentIncomeTotal: 0,
      line4cNetInvestmentIncomeAfterQualifiedDividends: 0,
      netInvestmentIncomeBeforeQualifiedDividendElection: 0,
      totalQualifiedDividends: 0,
      deductibleInvestmentInterestExpense: 0,
      disallowedCarryforward: 0,
    },
    scheduleA: {
      stateIncomeTaxSources: [],
      stateIncomeTaxTotal: 0,
      salesTaxSources: [],
      salesTaxTotal: 0,
      selectedLine5aType: 'state_income_tax',
      selectedLine5aTotal: 0,
      realEstateTaxSources: [],
      realEstateTaxTotal: 0,
      saltPaidBeforeCap: 0,
      saltCap: 40000,
      saltDeduction: 0,
      mortgageInterestSources: [],
      mortgageInterestTotal: 0,
      investmentInterestSources: [],
      grossInvestmentInterestTotal: 0,
      investmentInterestTotal: 0,
      disallowedInvestmentInterest: 0,
      totalInterest: 0,
      charitableCashSources: [],
      charitableCashTotal: 0,
      charitableNoncashSources: [],
      charitableNoncashTotal: 0,
      charitableTotal: 0,
      otherItemizedSources: [],
      otherItemizedTotal: 0,
      totalItemizedDeductions: 0,
      standardDeductionSingle: 15750,
      standardDeductionMarriedFilingJointly: 31500,
      shouldItemizeSingle: false,
      shouldItemizeMarriedFilingJointly: false,
    },
    scheduleE: {
      miscIncomeSources: [],
      miscIncomeTotal: 0,
      box1Sources: [],
      totalBox1: 0,
      box2Sources: [],
      totalBox2: 0,
      box3Sources: [],
      totalBox3: 0,
      box4Sources: [],
      totalBox4: 0,
      totalBox5: 0,
      box11ZZSources: [],
      totalBox11ZZ: 0,
      box13ZZSources: [],
      totalBox13ZZ: 0,
      traderNiiSources: [],
      totalTraderNii: 0,
      totalPassive: 0,
      totalNonpassive: 0,
      grandTotal: 0,
    },
    scheduleD: {
      form8949Rollups: [],
      line1aGainLoss: 0,
      line1bGainLoss: 0,
      line2GainLoss: 0,
      line3Sources: [],
      line3GainLoss: 0,
      line4GainLoss: 0,
      line5Sources: [],
      line5GainLoss: 0,
      line6Carryover: 0,
      line7NetShortTerm: 0,
      line8aGainLoss: 0,
      line8bGainLoss: 0,
      line9GainLoss: 0,
      line10Sources: [],
      line10GainLoss: 0,
      line11GainLoss: 0,
      line12Sources: [],
      line12GainLoss: 0,
      line13Sources: [],
      line13CapitalGainDistributions: 0,
      line14Carryover: 0,
      line15NetLongTerm: 0,
      line16Combined: 0,
      line21LimitedLossOrGain: 0,
      appliedToReturn: 0,
      carryforward: 0,
      totalBusinessCapGains: 0,
      totalPersonalCapGains: 0,
      limitedBusinessCapGains: 0,
      limitedPersonalCapGains: 0,
      ambiguous11SSources: [],
      ambiguous11SAmount: 0,
    },
    form8949: {
      reportingMode: 'form_8949_transactions',
      rows: [],
      scheduleDRollups: [],
      washSaleAdjustments: [],
      rowCount: 0,
      washSaleAdjustmentCount: 0,
      washSaleAdjustmentTotal: 0,
    },
    form1116: {
      passiveIncomeSources: [],
      totalPassiveIncome: 0,
      generalIncomeSources: [],
      totalGeneralIncome: 0,
      foreignTaxSources: [],
      totalForeignTaxes: 0,
      line4bSources: [],
      totalLine4b: 0,
      sourcedByPartnerElectionSources: [],
      totalSourcedByPartnerIncome: 0,
      creditValue: 0,
      deductionValueAtThirtySevenPercent: 0,
      recommendation: null,
      totalK1Box5: 0,
      turboTaxAlert: false,
    },
    form8960: {
      taxableInterest: 0,
      ordinaryDividends: 0,
      netCapGains: 0,
      passiveIncome: 0,
      nonpassiveTradingIncome: 0,
      investmentInterestExpense: 0,
      grossNII: 0,
      totalDeductions: 0,
      netInvestmentIncome: 0,
      magi: null,
      thresholdSingle: 200000,
      thresholdMarriedFilingJointly: 250000,
      magiExcessSingle: null,
      magiExcessMarriedFilingJointly: null,
      niitTaxSingle: null,
      niitTaxMarriedFilingJointly: null,
      needsMagi: true,
      componentSources: [],
    },
    form8995: {
      entities: [],
      line1Sources: [],
      totalQbi: 0,
      totalQbiComponent: 0,
      line6Sources: [],
      qualifiedReitDividends: 0,
      qualifiedPtpIncome: 0,
      reitPtpComponent: 0,
      taxableIncomeBeforeQbi: 0,
      netCapitalGain: 0,
      taxableIncomeLessNetCapitalGain: 0,
      taxableIncomeCap: 0,
      deduction: 0,
      thresholdSingle: 197300,
      thresholdMarriedFilingJointly: 394600,
      aboveThreshold: false,
      reviewSources: [],
    },
  } as unknown as TaxPreviewFacts
}

function makeTaxFactsWithScheduleSE(netEarningsFromSE = 10_000): TaxPreviewFacts {
  const facts = makeTaxFacts()
  const seTaxableEarnings = currency(netEarningsFromSE).multiply(0.9235).value
  const socialSecurityTax = currency(seTaxableEarnings).multiply(0.124).value
  const medicareTax = currency(seTaxableEarnings).multiply(0.029).value
  const seTax = currency(socialSecurityTax).add(medicareTax).value

  facts.scheduleSE = {
    entries: [{
      id: 'k1-77-schedule-se-box-14A-0',
      label: 'SE Partnership — K-1 Box 14A net earnings from self-employment',
      amount: netEarningsFromSE,
      sourceType: 'schedule_se_k1_box_14a',
    }],
    wageSources: [],
    scheduleFSources: [],
    netEarningsFromSE,
    seTaxableEarnings,
    socialSecurityWageBase: 176100,
    socialSecurityWages: 0,
    remainingSocialSecurityWageBase: 176100,
    socialSecurityTaxableEarnings: seTaxableEarnings,
    socialSecurityTax,
    medicareWages: 0,
    medicareTaxableEarnings: seTaxableEarnings,
    medicareTax,
    additionalMedicareThreshold: 200000,
    additionalMedicareTaxableEarnings: 0,
    additionalMedicareTax: 0,
    seTax,
    deductibleSeTax: currency(seTax).divide(2).value,
  } as unknown as TaxPreviewFacts['scheduleSE']

  return facts
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TaxPreviewProvider initialData={SHELL}>{children}</TaxPreviewProvider>
}

beforeEach(() => jest.clearAllMocks())

// --- tests -----------------------------------------------------------------

describe('TaxPreviewContext', () => {
  it('stores backend tax facts from the dataset and allows patch replacement', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setTaxFacts(makeTaxFacts()))

    expect(result.current.taxFacts?.schedule1.line8zTotal).toBe(42)
    expect(result.current.taxReturn.schedule1?.partI.line8z_otherIncome).toBe(0)
  })

  it('preserves unknown Schedule SE source types from backend facts', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const facts = makeTaxFactsWithScheduleSE()
    facts.scheduleSE.entries = facts.scheduleSE.entries.map(entry => ({
      ...entry,
      sourceType: 'schedule_se_schedule_f',
    }))

    act(() => result.current.setTaxFacts(facts))

    expect(result.current.taxReturn.scheduleSE?.entries[0]?.sourceType).toBe('schedule_se_schedule_f')
  })

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

  it('keeps document polling lightweight while status remains in-flight', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'pending')]))

    const spy = jest.spyOn(globalThis, 'setInterval')
    renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000))

    const pollCalls = spy.mock.calls.filter(([, delay]) => delay === 5_000)
    expect(pollCalls).toHaveLength(1)
    const pollCall = pollCalls[0]
    if (pollCall === undefined) {
      throw new Error('Expected exactly one tax-preview polling interval')
    }

    const pollCallback = pollCall[0] as () => void
    (fetchWrapper.get as jest.Mock).mockClear()
    await act(async () => {
      pollCallback()
    })

    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2025'))
    expect(fetchWrapper.get).not.toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2025&include_tax_facts=1')
    spy.mockRestore()
  })

  it('refreshes tax facts when document polling observes a terminal status transition', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'pending')]))
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'parsed')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const spy = jest.spyOn(globalThis, 'setInterval')
    renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000))

    const pollCalls = spy.mock.calls.filter(([, delay]) => delay === 5_000)
    expect(pollCalls).toHaveLength(1)
    const pollCall = pollCalls[0]
    if (pollCall === undefined) {
      throw new Error('Expected exactly one tax-preview polling interval')
    }

    const pollCallback = pollCall[0] as () => void
    (fetchWrapper.get as jest.Mock).mockClear()
    await act(async () => {
      pollCallback()
    })

    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2025'))
    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2025&include_tax_facts=1'))
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
        box1_interest: 100,
        box1a_ordinary: 500,
        box1b_qualified: 400,
        box7_foreign_tax: 0,
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
        box7_foreign_tax: 25,
        box6_foreign_tax: 10,
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
      misc_routing: null,
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
        label: 'Additional income from Schedule 1, line 10',
        value: 900,
      }),
      expect.objectContaining({
        line: '9',
        value: 900,
      }),
    ]))
    expect(result.current.taxReturn.scheduleE?.grandTotal).toBe(0)
  })

  it('routes K-1 Schedule B and Schedule E amounts plus 1099-R distributions into Form 1040 and withholding summaries', async () => {
    const k1Doc = {
      id: 61,
      form_type: 'k1',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        schemaVersion: '2026.1',
        formType: 'K-1-1065',
        fields: {
          A: { value: '12-3456789' },
          B: { value: 'Blue Harbor Fund' },
          '1': { value: '1000' },
          '5': { value: '200' },
          '6a': { value: '300' },
        },
        codes: {
          '14': [{ code: 'A', value: '10000' }],
        },
      },
      employment_entity: { id: 61, display_name: 'Blue Harbor Fund' },
    }

    const ira1099R = {
      id: 62,
      form_type: '1099_r',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        payer_name: 'IRA Custodian',
        box1_gross_distribution: 10000,
        box2a_taxable_amount: 8000,
        box4_fed_tax: 1200,
        box7_ira_sep_simple: true,
      },
      original_filename: 'ira-1099r.pdf',
      account_links: [],
    }

    const pension1099R = {
      id: 63,
      form_type: '1099_r',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        payer_name: 'Pension Plan',
        box1_gross_distribution: 7000,
        box2a_taxable_amount: 6500,
        box4_fed_tax: 700,
        box7_ira_sep_simple: false,
      },
      original_filename: 'pension-1099r.pdf',
      account_links: [],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (
        url === '/api/finance/marriage-status'
        || url === '/api/finance/user-tax-states?year=2025'
        || url === '/api/finance/user-deductions?year=2025'
        || url === '/api/finance/tax-loss-carryforwards?year=2025'
      ) {
        return Promise.resolve([])
      }

      return Promise.resolve({ ...makeResponse([k1Doc, ira1099R, pension1099R]), taxFacts: makeTaxFactsWithScheduleSE() })
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxReturn.form1040).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: '2b', value: 200 }),
      expect.objectContaining({ line: '3b', value: 300 }),
      expect.objectContaining({ line: '4a', value: 10_000 }),
      expect.objectContaining({ line: '4b', value: 8_000 }),
      expect.objectContaining({ line: '5a', value: 7_000 }),
      expect.objectContaining({ line: '5b', value: 6_500 }),
      expect.objectContaining({ line: '8', value: 1_000 }),
      expect.objectContaining({ line: '9', value: 16_000 }),
      expect.objectContaining({ line: '10', value: 706.48 }),
      expect.objectContaining({ line: '11', value: 15_293.52 }),
    ]))

    expect(result.current.taxReturn.form8960?.taxableInterest).toBe(200)
    expect(result.current.taxReturn.form8960?.ordinaryDividends).toBe(300)
    expect(result.current.taxReturn.overviewSections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        heading: 'Estimated Tax Positions',
        rows: expect.arrayContaining([
          expect.objectContaining({
            item: 'Federal withholding (payroll + 1099-R)',
            amount: 1_900,
          }),
        ]),
      }),
    ]))
  })

  it('aggregates Schedule 1 other income from broker_1099 1099-MISC child links by default', async () => {
    const brokerDoc = {
      id: 53,
      form_type: 'broker_1099',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      misc_routing: null,
      parsed_data: [
        {
          account_identifier: 'ACCT-1',
          account_name: 'Consolidated Broker',
          form_type: '1099_misc',
          tax_year: 2025,
          parsed_data: {
            payer_name: 'Referral Partner',
            box3_other_income: 450,
          },
        },
      ],
      original_filename: 'broker.pdf',
      account_links: [{
        id: 530,
        tax_document_id: 53,
        account_id: 10,
        form_type: '1099_misc',
        tax_year: 2025,
        ai_identifier: 'ACCT-1',
        is_reviewed: true,
      }],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') return Promise.resolve({})
      if (url === '/api/finance/user-tax-states?year=2025') return Promise.resolve([])
      if (url === '/api/finance/user-deductions?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-loss-carryforwards?year=2025') return Promise.resolve([])
      return Promise.resolve(makeResponse([brokerDoc]))
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.schedule1OtherIncome).toBe(450)
  })

  it('aggregates flat broker_1099 MISC boxes to Schedule 1 line 8z when the parent is reviewed', async () => {
    const brokerDoc = {
      id: 54,
      form_type: 'broker_1099',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      misc_routing: null,
      parsed_data: {
        payer_name: 'Flat Broker',
        box3_other_income: 3838.89,
        box8_substitute_payments: 0.44,
      },
      original_filename: 'flat-broker.pdf',
      account_links: [{
        id: 540,
        tax_document_id: 54,
        account_id: 10,
        form_type: '1099_misc',
        tax_year: 2025,
        ai_identifier: null,
        is_reviewed: false,
      }],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') return Promise.resolve({})
      if (url === '/api/finance/user-tax-states?year=2025') return Promise.resolve([])
      if (url === '/api/finance/user-deductions?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-loss-carryforwards?year=2025') return Promise.resolve([])
      return Promise.resolve(makeResponse([brokerDoc]))
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.schedule1OtherIncome).toBe(3839.33)
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
      .mockResolvedValueOnce({ ...makeResponse([k1Doc]), taxFacts: makeTaxFactsWithScheduleSE() })
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxReturn.scheduleSE?.netEarningsFromSE).toBe(10_000)
    expect(result.current.taxReturn.schedule2?.selfEmploymentTax).toBeCloseTo(1_412.96, 2)
    expect(result.current.taxReturn.schedule2?.totalAdditionalTaxes).toBeCloseTo(1_412.96, 2)
  })

  it('leaves wage-base values blank while backend Schedule SE facts are empty', async () => {
    const wrapper2024 = ({ children }: { children: React.ReactNode }) => (
      <TaxPreviewProvider initialData={{ year: 2024, availableYears: [2024] }}>{children}</TaxPreviewProvider>
    )

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') return Promise.resolve({})
      if (url === '/api/finance/user-tax-states?year=2024') return Promise.resolve([])
      if (url === '/api/finance/user-deductions?year=2024') return Promise.resolve([])
      if (url === '/api/finance/tax-loss-carryforwards?year=2024') return Promise.resolve([])

      return Promise.resolve({ ...makeResponse([]), year: 2024, availableYears: [2024] })
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper: wrapper2024 })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxReturn.scheduleSE?.socialSecurityWageBase).toBe(0)
    expect(result.current.taxReturn.scheduleSE?.remainingSocialSecurityWageBase).toBe(0)
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

  it('feeds prior-year capital loss carryovers into current-year Schedule D', async () => {
    const priorYearBrokerDoc = {
      id: 101,
      form_type: '1099_b',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2024,
      parsed_data: {
        payer_name: 'Prior Broker',
        transactions: [
          { description: 'Prior short loss', realized_gain_loss: -10_000, is_short_term: true, form_8949_box: 'A', is_covered: true },
          { description: 'Prior long loss', realized_gain_loss: -5_000, is_short_term: false, form_8949_box: 'D', is_covered: true },
        ],
      },
      original_filename: 'prior-broker.pdf',
      account_links: [],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') return Promise.resolve({})
      if (url === '/api/finance/user-tax-states?year=2025') return Promise.resolve([])
      if (url === '/api/finance/user-deductions?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-loss-carryforwards?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-preview-data?year=2025&include_tax_facts=1') return Promise.resolve({
        ...makeResponse([]),
        availableYears: [2025, 2024],
      })
      if (url === '/api/finance/tax-preview-data?year=2024') return Promise.resolve({
        ...makeResponse([priorYearBrokerDoc]),
        availableYears: [2025, 2024],
      })
      return Promise.resolve(makeResponse())
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.priorYearCapitalLossCarryover).toEqual(expect.objectContaining({
      shortTermCarryover: 7000,
      longTermCarryover: 5000,
    }))
    expect(result.current.taxReturn.scheduleD?.schD_line6).toBe(-7000)
    expect(result.current.taxReturn.scheduleD?.schD_line14).toBe(-5000)
  })
})
