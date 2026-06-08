import { act, renderHook, waitFor } from '@testing-library/react'
import currency from 'currency.js'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

jest.mock('@/services/transactionCache', () => ({
  buildCacheKey: jest.fn((acctId: number) => `acct:${acctId}`),
  getCachedTransactions: jest.fn(),
  syncCachedTransactions: jest.fn(),
}))

jest.mock('@/components/finance/ScheduleCPreview', () => ({
  computeScheduleCNetIncome: () => ({ total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }),
}))

import { toast } from 'sonner'

import { getCachedTransactions, syncCachedTransactions } from '@/services/transactionCache'

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

function makeResponse(docs: object[] = [], activeAccountIds: number[] = []) {
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
    activeAccountIds,
    taxFacts: null,
  }
}

function makeForm1040Facts(overrides: Partial<TaxPreviewFacts['form1040']> = {}): TaxPreviewFacts['form1040'] {
  return {
    filingStatus: 'single',
    line1zSources: [],
    line1z: 0,
    line2aSources: [],
    line2a: 0,
    line2bSources: [],
    line2b: 0,
    line3aSources: [],
    line3a: 0,
    line3bSources: [],
    line3b: 0,
    line4aSources: [],
    line4a: 0,
    line4bSources: [],
    line4b: 0,
    line5aSources: [],
    line5a: 0,
    line5bSources: [],
    line5b: 0,
    line6aSources: [],
    line6a: 0,
    line6bSources: [],
    line6b: 0,
    line7Sources: [],
    line7: 0,
    line8Sources: [],
    line8: 0,
    line9: 0,
    line10Sources: [],
    line10: 0,
    line11: 0,
    line12Source: 'standard_deduction',
    line12Sources: [],
    line12: 0,
    line13Sources: [],
    line13: 0,
    line14: 0,
    line15: 0,
    line16TaxComputation: 'ordinary_brackets',
    line16Sources: [],
    line16: 0,
    line17Sources: [],
    line17: 0,
    line18: 0,
    line19: 0,
    line20Sources: [],
    line20: 0,
    line21: 0,
    line22: 0,
    line23Sources: [],
    line23: 0,
    line24: 0,
    line25aSources: [],
    line25a: 0,
    line25bSources: [],
    line25b: 0,
    line25cSources: [],
    line25c: 0,
    line25d: 0,
    line26Sources: [],
    line26: 0,
    line31Sources: [],
    line31: 0,
    line32: 0,
    line33: 0,
    line34: 0,
    line35a: 0,
    line36: 0,
    line37: 0,
    line38: 0,
    ...overrides,
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
      medicareTaxWithheldSources: [],
      medicareTaxWithheld: 0,
      medicareTaxableEarnings: 0,
      medicareTax: 0,
      additionalMedicareThreshold: 200000,
      additionalMedicareTaxableEarnings: 0,
      additionalMedicareTax: 0,
      seTax: 0,
      deductibleSeTax: 0,
    },
    form8959: {
      wageSources: [],
      withholdingSources: [],
      wages: 0,
      threshold: 200000,
      excessWages: 0,
      additionalTax: 0,
      medicareTaxWithheld: 0,
      regularMedicareTaxWithholding: 0,
      additionalMedicareWithholding: 0,
    },
    schedule1: {
      line1aSources: [],
      line1aTotal: 0,
      line2aSources: [],
      line2aTotal: 0,
      line3Sources: [],
      line3Total: 0,
      line5Sources: [],
      line5Total: 0,
      line6Sources: [],
      line6Total: 0,
      line7Sources: [],
      line7Total: 0,
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
      materialParticipationScheduleEInterestSources: [],
      totalMaterialParticipationScheduleEInterest: 0,
      grossInvestmentIncomeFromScheduleB: 0,
      grossInvestmentIncomeFromK1: 0,
      grossInvestmentIncomeTotal: 0,
      line4cNetInvestmentIncomeAfterQualifiedDividends: 0,
      netInvestmentIncomeBeforeQualifiedDividendElection: 0,
      totalQualifiedDividends: 0,
      deductibleInvestmentInterestExpense: 0,
      disallowedCarryforward: 0,
      grossInvestmentIncomeFromK1Sources: [],
      qualifiedDividendSources: [],
      deductibleScheduleEAboveLine: 0,
      deductibleScheduleAItemized: 0,
      carryforwardScheduleE: 0,
      carryforwardScheduleA: 0,
      carryDestinations: [],
      allocationMethod: 'pro_rata',
      allocationMethodDescription: 'Pro-rata allocation under Rev. Rul. 2008-38.',
      tracingSplitSources: [],
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
      otherItemizedTransactions: [],
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
      form4952InvestmentInterestSources: [],
      totalForm4952InvestmentInterest: 0,
      materialParticipationTraderInterestSources: [],
      totalMaterialParticipationTraderInterest: 0,
      totalPassive: 0,
      totalNonpassive: 0,
      totalNonpassiveIncome: 0,
      totalNonpassiveLoss: 0,
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
    form6251: {
      sourceEntries: [],
      manualReviewReasons: [],
      line1TaxableIncome: 0,
      line2aTaxesOrStandardDeduction: 0,
      line2aSource: 'none',
      line2cInvestmentInterest: 0,
      line2dDepletion: 0,
      line2kDispositionOfProperty: 0,
      line2lPost1986Depreciation: 0,
      line2mPassiveActivities: 0,
      line2nLossLimitations: 0,
      line2tIntangibleDrillingCosts: 0,
      line3OtherAdjustments: 0,
      adjustmentTotal: 0,
      amti: 0,
      exemption: 0,
      exemptionBase: 0,
      exemptionReduction: 0,
      exemptionPhaseoutThreshold: 0,
      amtTaxBase: 0,
      amtRateSplitThreshold: 0,
      amtBeforeForeignCredit: 0,
      line8AmtForeignTaxCredit: 0,
      tentativeMinTax: 0,
      regularTax: 0,
      regularForeignTaxCredit: 0,
      regularTaxAfterCredits: 0,
      amt: 0,
      filingStatus: 'single',
      requiresStatementReview: false,
    },
    form8582: {
      activities: [],
      totalPassiveIncome: 0,
      totalPassiveLoss: 0,
      totalPriorYearUnallowed: 0,
      netPassiveResult: 0,
      rentalAllowance: 0,
      totalAllowedLoss: 0,
      totalSuspendedLoss: 0,
      netDeductionToReturn: 0,
      isLossLimited: false,
      magi: 0,
      isMarried: false,
      realEstateProfessional: false,
    },
    form8606: {
      conversions: [],
      distributions: [],
      line1_nondeductibleContributions: 0,
      line2_priorYearBasis: 0,
      line3_totalBasis: 0,
      line6_yearEndFmv: 0,
      line7_distributionsNotConverted: 0,
      line8_convertedToRoth: 0,
      line9_total: 0,
      line10_proRataRatio: 0,
      line11_basisInConversion: 0,
      line12_basisInDistributions: 0,
      line13_totalBasisUsed: 0,
      line14_basisCarriedForward: 0,
      line15c_taxableDistributions: 0,
      line18_taxableConversions: 0,
      taxableToForm1040Line4b: 0,
      hasActivity: false,
    },
    form4797: {
      partISources: [],
      partIISources: [],
      partIIISources: [],
      schedule1Sources: [],
      scheduleDSources: [],
      partINet1231: 0,
      partIIOrdinary: 0,
      partIIIRecapture: 0,
      netToSchedule1Line4: 0,
      netToScheduleDLongTerm: 0,
      hasActivity: false,
    },
    form1040: makeForm1040Facts(),
  } as unknown as TaxPreviewFacts
}

function makeTaxFactsWithScheduleSE(netEarningsFromSE = 10_000, form1040Overrides: Partial<TaxPreviewFacts['form1040']> = {}): TaxPreviewFacts {
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
    medicareTaxWithheldSources: [],
    medicareTaxWithheld: 0,
    medicareTaxableEarnings: seTaxableEarnings,
    medicareTax,
    additionalMedicareThreshold: 200000,
    additionalMedicareTaxableEarnings: 0,
    additionalMedicareTax: 0,
    seTax,
    deductibleSeTax: currency(seTax).divide(2).value,
  } as unknown as TaxPreviewFacts['scheduleSE']
  facts.form1040 = makeForm1040Facts({ line23: seTax, ...form1040Overrides })

  return facts
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TaxPreviewProvider initialData={SHELL}>{children}</TaxPreviewProvider>
}

beforeEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
})

// --- tests -----------------------------------------------------------------

describe('TaxPreviewContext', () => {
  it('stores backend tax facts from the dataset and allows patch replacement', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setTaxFacts(makeTaxFacts()))

    expect(result.current.taxFacts?.schedule1.line8zTotal).toBe(42)
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

    expect(result.current.taxFacts?.scheduleSE.entries[0]?.sourceType).toBe('schedule_se_schedule_f')
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

  it('registers polling with setTimeout and backoff when a document is pending', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'pending')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait for initial load to complete - polling should have started
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    
    // The document is pending, so polling is active
    expect(result.current.accountDocuments).toHaveLength(1)
    expect(result.current.accountDocuments[0]?.genai_status).toBe('pending')
  })

  it('registers polling with setTimeout and backoff when a document is processing', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'processing')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait for initial load - polling should be active for processing documents
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    
    expect(result.current.accountDocuments).toHaveLength(1)
    expect(result.current.accountDocuments[0]?.genai_status).toBe('processing')
  })

  it('keeps polling in-flight documents with capped 5s, 10s, 30s backoff intervals', async () => {
    jest.useFakeTimers()
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue(makeResponse([makeDoc(1, 'pending')]))

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const pollCalls = () => (fetchWrapper.get as jest.Mock).mock.calls
      .filter(([url]) => url === '/api/finance/tax-preview-data?year=2025')

    expect(pollCalls()).toHaveLength(0)

    for (const interval of [5_000, 10_000, 30_000, 30_000, 30_000, 30_000]) {
      await act(async () => {
        jest.advanceTimersByTime(interval)
        await Promise.resolve()
      })
    }

    expect(pollCalls()).toHaveLength(6)

    await act(async () => {
      jest.advanceTimersByTime(30_000)
      await Promise.resolve()
    })

    expect(pollCalls()).toHaveLength(7)
    jest.useRealTimers()
  })

  it('does not run short-dividend sync until a consuming form requests it', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue(makeResponse([], [101, 202]))
    ;(getCachedTransactions as jest.Mock).mockResolvedValue(null)
    ;(syncCachedTransactions as jest.Mock).mockResolvedValue({ transactions: [] })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(syncCachedTransactions).not.toHaveBeenCalled()

    act(() => result.current.loadShortDividendSummary())

    await waitFor(() => expect(syncCachedTransactions).toHaveBeenCalledTimes(2))
    expect(syncCachedTransactions).toHaveBeenCalledWith('acct:101', '/api/finance/101/line_items/sync')
    expect(syncCachedTransactions).toHaveBeenCalledWith('acct:202', '/api/finance/202/line_items/sync')
  })

  // Note: Terminal status transition behavior is tested below with "fires a toast when a document transitions
  // from pending to parsed". When documents transition to parsed, the context automatically refreshes tax facts.

  it('does not register setTimeout when all documents are already parsed', async () => {
    jest.useFakeTimers()
    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const spy = jest.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait until the fetch is fully settled (state updated + effects flushed)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not schedule any polling timeouts since document is already parsed
    expect(spy).not.toHaveBeenCalledWith(expect.any(Function), 5_000)
    spy.mockRestore()
    jest.useRealTimers()
  })

  it('stops polling via cleanup when documents leave in-flight state', async () => {
    (fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(makeResponse([makeDoc(1, 'pending')]))
      .mockResolvedValue(makeResponse([makeDoc(1, 'parsed')]))

    const clearSpy = jest.spyOn(globalThis, 'clearTimeout')
    const { result } = renderHook(() => useTaxPreview(), { wrapper })

    // Wait for the first fetch to fully settle so the polling timeout is registered
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Simulate the poll returning parsed status - this will cause the effect to re-run
    // and the cleanup function will call clearTimeout
    await act(async () => { await result.current.refreshAll() })
    
    // The cleanup should be called when effect re-runs due to allDocuments change
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

    expect(result.current.estimatedTaxPayments).toBeUndefined()
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

      const facts = makeTaxFacts()
      facts.form1040 = makeForm1040Facts({ line8: 900, line9: 900 })

      return Promise.resolve({ ...makeResponse([miscDoc]), taxFacts: facts })
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxFacts?.form1040.line8).toBe(900)
    expect(result.current.taxFacts?.form1040.line9).toBe(900)
    expect(result.current.taxFacts?.scheduleE.grandTotal).toBe(0)
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

      const facts = makeTaxFactsWithScheduleSE(10_000, {
        line2b: 200,
        line3b: 300,
        line4a: 10_000,
        line4b: 8_000,
        line5a: 7_000,
        line5b: 6_500,
        line8: 1_000,
        line9: 16_000,
        line10: 706.48,
        line11: 15_293.52,
        line25b: 1_900,
        line25d: 1_900,
      })
      facts.form8960 = {
        ...facts.form8960,
        taxableInterest: 200,
        ordinaryDividends: 300,
      }

      return Promise.resolve({
        ...makeResponse([k1Doc, ira1099R, pension1099R]),
        taxFacts: facts,
      })
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxFacts?.form1040).toEqual(expect.objectContaining({
      line2b: 200,
      line3b: 300,
      line4a: 10_000,
      line4b: 8_000,
      line5a: 7_000,
      line5b: 6_500,
      line8: 1_000,
      line9: 16_000,
      line10: 706.48,
      line11: 15_293.52,
      line25d: 1_900,
    }))

    expect(result.current.taxFacts?.form8960.taxableInterest).toBe(200)
    expect(result.current.taxFacts?.form8960.ordinaryDividends).toBe(300)
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

    expect(result.current.taxFacts?.scheduleSE.netEarningsFromSE).toBe(10_000)
    expect(result.current.taxFacts?.scheduleSE.seTax).toBeCloseTo(1_412.96, 2)
    expect(result.current.taxFacts?.form1040.line23).toBeCloseTo(1_412.96, 2)
  })

  it('combines wage and self-employment additional Medicare tax on Schedule 2', async () => {
    const w2Doc = {
      id: 88,
      form_type: 'w2',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2025,
      parsed_data: {
        employer_name: 'Wage Co',
        box1_wages: 210_000,
        box5_medicare_wages: 210_000,
      },
      original_filename: 'w2.pdf',
    }
    const facts = makeTaxFactsWithScheduleSE(10_000)
    facts.scheduleSE.additionalMedicareTaxableEarnings = 1333.33
    facts.scheduleSE.additionalMedicareTax = 12
    facts.form8959 = {
      wages: 210_000,
      threshold: 200_000,
      excessWages: 10_000,
      additionalTax: 90,
      medicareTaxWithheld: 0,
      regularMedicareTaxWithholding: 0,
      additionalMedicareWithholding: 0,
      wageSources: [{
        id: 'w2-88-schedule-se-box5_medicare_wages-form8959-line1',
        label: 'Wage Co — W-2 Medicare wages',
        amount: 210_000,
        sourceType: 'schedule_se_w2_medicare_wages',
        taxDocumentId: 88,
        taxDocumentAccountId: null,
        accountId: null,
        formType: 'w2',
        box: null,
        code: null,
        routing: 'form_8959_line_1',
        routingReason: 'Medicare wages flow to Form 8959 line 1 for wage-side Additional Medicare Tax.',
        notes: null,
        isReviewed: true,
        reviewStatus: 'reviewed',
        reviewAction: null,
      }],
      withholdingSources: [],
    }
    facts.form1040 = makeForm1040Facts({ line23: 102, line24: 102 })

    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce({ ...makeResponse([]), w2Documents: [w2Doc], taxFacts: facts })
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.taxFacts?.form8959.additionalTax).toBe(90)
    expect(result.current.taxFacts?.scheduleSE.additionalMedicareTax).toBe(12)
    expect(result.current.taxFacts?.form1040.line23).toBe(102)
  })

  it('excludes passive Schedule E losses from the Form 461 excess business loss input', async () => {
    const facts = makeTaxFacts()
    facts.scheduleE = {
      ...facts.scheduleE,
      totalPassive: -100_000,
      totalNonpassive: -400_000,
      grandTotal: -500_000,
    }

    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce({ ...makeResponse([]), taxFacts: facts })
      .mockResolvedValue([])

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.form461.aggregateBusinessIncomeLoss).toBe(-400_000)
    expect(result.current.form461.eblLimit).toBe(317_000)
    expect(result.current.form461.excessBusinessLoss).toBe(83_000)
    expect(result.current.form461.isTriggered).toBe(true)
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

    expect(result.current.taxFacts?.scheduleSE).toBeUndefined()
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

      const facts = makeTaxFacts()
      facts.form8582 = {
        ...facts.form8582,
        activities: [{
          activityName: 'Passive LP Fund (ordinary business)',
          ein: '12-3456789',
          isRentalRealEstate: false,
          activeParticipation: false,
          currentIncome: 0,
          currentLoss: -12_000,
          priorYearUnallowed: -4_000,
          overallGainOrLoss: -16_000,
          allowedLossThisYear: 0,
          suspendedLossCarryforward: -16_000,
        }],
        totalPassiveLoss: -12_000,
        totalPriorYearUnallowed: -4_000,
        netPassiveResult: -16_000,
        totalSuspendedLoss: -16_000,
        isLossLimited: true,
      }

      return Promise.resolve({ ...makeResponse([k1Doc]), taxFacts: facts })
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.palCarryforwards).toHaveLength(1))

    expect(result.current.taxFacts?.form8582.activities[0]?.priorYearUnallowed).toBe(-4000)
    expect(result.current.taxFacts?.form8582.totalPriorYearUnallowed).toBe(-4000)
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
      if (url === '/api/finance/tax-preview-data?year=2024&include_tax_facts=1') {
        const facts = makeTaxFacts()
        facts.year = 2024
        facts.scheduleD = {
          ...facts.scheduleD,
          line7NetShortTerm: -10_000,
          line15NetLongTerm: -5_000,
          line16Combined: -15_000,
          line21LimitedLossOrGain: -3_000,
          appliedToReturn: -3_000,
          carryforward: -12_000,
        }

        return Promise.resolve({
          ...makeResponse([priorYearBrokerDoc]),
          year: 2024,
          availableYears: [2025, 2024],
          taxFacts: facts,
        })
      }

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
    expect(result.current.taxFacts).toBeNull()
  })

  it('loads capital loss carryovers from the nearest available prior tax year', async () => {
    const priorYearBrokerDoc = {
      id: 102,
      form_type: '1099_b',
      genai_status: 'parsed',
      is_reviewed: true,
      tax_year: 2023,
      parsed_data: {
        payer_name: 'Gap Broker',
        transactions: [
          { description: 'Older short loss', realized_gain_loss: -10_000, is_short_term: true, form_8949_box: 'A', is_covered: true },
          { description: 'Older long loss', realized_gain_loss: -5_000, is_short_term: false, form_8949_box: 'D', is_covered: true },
        ],
      },
      original_filename: 'gap-broker.pdf',
      account_links: [],
    }

    ;(fetchWrapper.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/finance/marriage-status') return Promise.resolve({})
      if (url === '/api/finance/user-tax-states?year=2025') return Promise.resolve([])
      if (url === '/api/finance/user-deductions?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-loss-carryforwards?year=2025') return Promise.resolve([])
      if (url === '/api/finance/tax-preview-data?year=2025&include_tax_facts=1') return Promise.resolve({
        ...makeResponse([]),
        availableYears: [2025, 2023],
      })
      if (url === '/api/finance/tax-preview-data?year=2023&include_tax_facts=1') {
        const facts = makeTaxFacts()
        facts.year = 2023
        facts.scheduleD = {
          ...facts.scheduleD,
          line7NetShortTerm: -10_000,
          line15NetLongTerm: -5_000,
          line16Combined: -15_000,
          line21LimitedLossOrGain: -3_000,
          appliedToReturn: -3_000,
          carryforward: -12_000,
        }

        return Promise.resolve({
          ...makeResponse([priorYearBrokerDoc]),
          year: 2023,
          availableYears: [2025, 2023],
          taxFacts: facts,
        })
      }

      return Promise.resolve(makeResponse())
    })

    const { result } = renderHook(() => useTaxPreview(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await waitFor(() => expect(result.current.priorYearCapitalLossCarryover).toEqual(expect.objectContaining({
      shortTermCarryover: 7000,
      longTermCarryover: 5000,
    })))
    expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2023&include_tax_facts=1')
    expect(fetchWrapper.get).not.toHaveBeenCalledWith('/api/finance/tax-preview-data?year=2024&include_tax_facts=1')
  })
})
