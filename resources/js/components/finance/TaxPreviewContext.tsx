'use client'

import currency from 'currency.js'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { isFK1StructuredData } from '@/components/finance/k1'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { collectForeignTaxSummaries, type ForeignTaxSummary } from '@/finance/1116'
import { type PalCarryforwardEntry, TAX_LOSS_CARRYFORWARD_ENDPOINT } from '@/finance/8582/form8582'
import { computeCapitalLossCarryover } from '@/finance/capitalLoss/capitalLossCarryover'
import { computeEstimatedTaxPayments, type EstimatedTaxPaymentsData } from '@/lib/finance/estimatedTaxPayments'
import { extractK1Form461Disclosure, getK1PartnerName } from '@/lib/finance/k1Utils'
import { analyzeShortDividends, type ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { extractLinkParsedData, getDocAmounts } from '@/lib/finance/taxDocumentUtils'
import { scheduleCNetIncomeFromFacts, scheduleDAggregatesForForm461FromFacts } from '@/lib/finance/taxPreviewFactsAdapters'
import { form461 } from '@/lib/tax/form461'
import { buildCacheKey, getCachedTransactions, syncCachedTransactions } from '@/services/transactionCache'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { EmploymentEntity, F1099DivParsedData, F1099GParsedData, F1099IntParsedData, TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS, isLine8MiscRouting } from '@/types/finance/tax-document'
import type { CapitalLossCarryoverLines, Form461Lines, UserDeductionEntry } from '@/types/finance/tax-return'
import type { TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

import type { Schedule1Line8Breakdown } from './Schedule1Preview'
import type { ScheduleCResponse } from './ScheduleCPreview'

export interface TaxPreviewShellData {
  year: number
  availableYears: number[]
}

export interface TaxPreviewAccount {
  acct_id: number
  acct_name: string
  acct_is_debt?: boolean | null
  acct_is_retirement?: boolean | null
  when_closed?: string | null
}

export interface TaxPreviewDataset {
  year: number
  availableYears: number[]
  payslips: fin_payslip[]
  pendingReviewCount: number
  w2Documents: TaxDocument[]
  accountDocuments: TaxDocument[]
  scheduleCData: ScheduleCResponse
  employmentEntities: EmploymentEntity[]
  accounts: TaxPreviewAccount[]
  activeAccountIds: number[]
  taxFacts?: TaxPreviewFacts | null
}

interface RefreshAllOptions {
  includeTaxFacts?: boolean
}

interface TaxPreviewContextValue {
  year: number
  availableYears: number[]
  isLoading: boolean
  error: string | null
  payslips: fin_payslip[]
  pendingReviewCount: number
  w2Documents: TaxDocument[]
  accountDocuments: TaxDocument[]
  reviewedW2Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  reviewedK1Docs: TaxDocument[]
  priorYearCapitalLossCarryover: CapitalLossCarryoverLines | null
  reviewed1099RDocs: TaxDocument[]
  foreignTaxSummaries: ForeignTaxSummary[]
  scheduleCData: ScheduleCResponse | null
  scheduleCNetIncome: { total: number; byQuarter: { q1: number; q2: number; q3: number; q4: number } }
  form461: Form461Lines
  capitalLossCarryover: CapitalLossCarryoverLines
  estimatedTaxPayments?: EstimatedTaxPaymentsData
  employmentEntities: EmploymentEntity[]
  accounts: TaxPreviewAccount[]
  activeAccountIds: number[]
  taxFacts: TaxPreviewFacts | null
  setTaxFacts: Dispatch<SetStateAction<TaxPreviewFacts | null>>
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
  /** Aggregated 1099-MISC "Other income" routed to Schedule 1 line 8 (total of all sub-lines). */
  schedule1OtherIncome: number
  /** Per-sub-line breakdown of Schedule 1 line 8 income (8b gambling, 8h jury, 8i prizes, 8z other). */
  schedule1Line8Breakdown: Schedule1Line8Breakdown
  /** Unemployment compensation from 1099-G box 1 (Schedule 1 line 7). */
  schedule1Line7Unemployment: number
  /** Taxable state/local income tax refunds from 1099-G box 2 (Schedule 1 line 1a). */
  schedule1Line1aTaxableRefunds: number
  /** User-entered SSA-1099 gross benefits for the year (Pub 915 worksheet input). */
  ssaGrossBenefits: number
  setSsaGrossBenefits: Dispatch<SetStateAction<number>>
  /** Whether the user is married for the selected tax year (from marriage status settings). */
  isMarried: boolean
  /** State codes the user filed in for the selected tax year (e.g. ['CA', 'NY']). */
  activeTaxStates: string[]
  /** Callback to add/remove a state — triggers a re-fetch. */
  setActiveTaxStates: Dispatch<SetStateAction<string[]>>
  /** User-entered Schedule A deductions for the year (property tax, mortgage, etc.). */
  userDeductions: UserDeductionEntry[]
  /** Callback to replace the deductions list after a mutation. */
  setUserDeductions: Dispatch<SetStateAction<UserDeductionEntry[]>>
  /** Per-activity PAL carryforward entries from prior years (Form 8582). */
  palCarryforwards: PalCarryforwardEntry[]
  /** Callback to replace the carryforward list after a mutation. */
  setPalCarryforwards: Dispatch<SetStateAction<PalCarryforwardEntry[]>>
  /** Whether the taxpayer qualifies as a real estate professional (§469(c)(7)). Persisted to localStorage. */
  realEstateProfessional: boolean
  /** Setter for realEstateProfessional — persisted to localStorage per tax year. */
  setRealEstateProfessional: Dispatch<SetStateAction<boolean>>
  /** Aggregated short dividend summary across all active accounts, or null if not yet loaded. */
  shortDividendSummary: ShortDividendSummary | null
  /** Trigger short dividend analysis load (for consuming forms like Schedule A / Form 4952). */
  loadShortDividendSummary: () => void
  /** Prior year total tax — user-entered for safe-harbor estimated payment planning. */
  priorYearTax: number
  /** Setter for priorYearTax — persisted to localStorage per tax year. */
  setPriorYearTax: Dispatch<SetStateAction<number>>
  /** Prior year AGI — user-entered for safe-harbor threshold planning. */
  priorYearAgi: number
  /** Setter for priorYearAgi — persisted to localStorage per tax year. */
  setPriorYearAgi: Dispatch<SetStateAction<number>>
  setPayslips: Dispatch<SetStateAction<fin_payslip[]>>
  setPendingReviewCount: Dispatch<SetStateAction<number>>
  setW2Documents: Dispatch<SetStateAction<TaxDocument[]>>
  setAccountDocuments: Dispatch<SetStateAction<TaxDocument[]>>
  setScheduleCData: Dispatch<SetStateAction<ScheduleCResponse | null>>
  setEmploymentEntities: Dispatch<SetStateAction<EmploymentEntity[]>>
  setAccounts: Dispatch<SetStateAction<TaxPreviewAccount[]>>
  setActiveAccountIds: Dispatch<SetStateAction<number[]>>
  refreshAll: (options?: RefreshAllOptions) => Promise<void>
}

const TaxPreviewContext = createContext<TaxPreviewContextValue | null>(null)

const IN_FLIGHT_STATUSES = new Set(['pending', 'processing'])
const POLLING_INTERVALS_MS = [5000, 10000, 30000] // 5s → 10s → 30s with backoff
const MAX_POLLING_ATTEMPTS = 5

export function TaxPreviewProvider({
  initialData,
  children,
}: {
  initialData?: TaxPreviewShellData | null
  children: ReactNode
}) {
  const year = initialData?.year ?? new Date().getFullYear()
  const [availableYears, setAvailableYears] = useState<number[]>(initialData?.availableYears ?? [])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedOnce = useRef(false)
  const prevDocStatusRef = useRef<Map<number, string>>(new Map())
  const [payslips, setPayslips] = useState<fin_payslip[]>([])
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [w2Documents, setW2Documents] = useState<TaxDocument[]>([])
  const [accountDocuments, setAccountDocuments] = useState<TaxDocument[]>([])
  const [priorYearCapitalLossCarryover, setPriorYearCapitalLossCarryover] = useState<CapitalLossCarryoverLines | null>(null)
  const [scheduleCData, setScheduleCData] = useState<ScheduleCResponse | null>(null)
  const [employmentEntities, setEmploymentEntities] = useState<EmploymentEntity[]>([])
  const [accounts, setAccounts] = useState<TaxPreviewAccount[]>([])
  const [activeAccountIds, setActiveAccountIds] = useState<number[]>([])
  const [taxFacts, setTaxFacts] = useState<TaxPreviewFacts | null>(null)
  const [shortDividendSummary, setShortDividendSummary] = useState<ShortDividendSummary | null>(null)
  const [shortDividendLoadRequested, setShortDividendLoadRequested] = useState(false)
  const [isMarried, setIsMarried] = useState(false)
  const [activeTaxStates, setActiveTaxStates] = useState<string[]>([])
  const [userDeductions, setUserDeductions] = useState<UserDeductionEntry[]>([])
  const [palCarryforwards, setPalCarryforwards] = useState<PalCarryforwardEntry[]>([])

  const priorYearTaxKey = `tax-preview-prior-year-tax-${year}`
  const [priorYearTax, setPriorYearTaxRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(priorYearTaxKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setPriorYearTax: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setPriorYearTaxRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(priorYearTaxKey, String(next))
        }
        return next
      })
    },
    [priorYearTaxKey],
  )
  const priorYearAgiKey = `tax-preview-prior-year-agi-${year}`
  const [priorYearAgi, setPriorYearAgiRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(priorYearAgiKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setPriorYearAgi: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setPriorYearAgiRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(priorYearAgiKey, String(next))
        }
        return next
      })
    },
    [priorYearAgiKey],
  )
  const ssaGrossBenefitsKey = `tax-preview-ssa-gross-benefits-${year}`
  const [ssaGrossBenefits, setSsaGrossBenefitsRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(ssaGrossBenefitsKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setSsaGrossBenefits: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setSsaGrossBenefitsRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(ssaGrossBenefitsKey, String(next))
        }
        return next
      })
    },
    [ssaGrossBenefitsKey],
  )

  const realEstateProfessionalKey = `tax-preview-re-professional-${year}`
  const [realEstateProfessional, setRealEstateProfessionalRaw] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(realEstateProfessionalKey) === 'true'
  })
  const setRealEstateProfessional: Dispatch<SetStateAction<boolean>> = useCallback(
    (value) => {
      setRealEstateProfessionalRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(realEstateProfessionalKey, String(next))
        }
        return next
      })
    },
    [realEstateProfessionalKey],
  )

  const priorYearCarryoverCache = useRef<Map<number, CapitalLossCarryoverLines | null>>(new Map())
  const carryoverRequestId = useRef(0)

  const normalizeAvailableYears = useCallback((input: unknown): number[] => {
    if (!Array.isArray(input)) {
      return []
    }

    return [...new Set(input)]
      .map((year) => Number(year))
      .filter((year) => Number.isInteger(year) && year > 0)
      .sort((a, b) => b - a)
  }, [])

  const getPriorYearCarryover = useCallback(async function getPriorYearCarryover(
    targetYear: number,
  ): Promise<CapitalLossCarryoverLines | null> {
    if (targetYear <= 0) {
      return null
    }

    const cached = priorYearCarryoverCache.current.get(targetYear)
    if (cached !== undefined) {
      return cached
    }

    try {
      const response = (await fetchWrapper.get(`/api/finance/tax-preview-data?year=${targetYear}&include_tax_facts=1`)) as TaxPreviewDataset
      const scheduleD = response.taxFacts?.scheduleD
      const carryover = scheduleD
        ? computeCapitalLossCarryover(scheduleD.line7NetShortTerm, scheduleD.line15NetLongTerm)
        : null
      priorYearCarryoverCache.current.set(targetYear, carryover)
      return carryover
    } catch {
      // On endpoint errors for prior-year recursion, fall back to null so current-year
      // calculations still render safely.
      priorYearCarryoverCache.current.set(targetYear, null)
      return null
    }
  }, [])

  const refreshPriorYearCarryover = useCallback(async (yearsFromResponse: number[], targetYear: number) => {
    const requestId = ++carryoverRequestId.current
    if (targetYear <= 0) {
      setPriorYearCapitalLossCarryover(null)
      return
    }

    const normalizedYears = normalizeAvailableYears(yearsFromResponse)
    if (normalizedYears.length === 0) {
      setPriorYearCapitalLossCarryover(null)
      return
    }

    const carryoverYear = normalizedYears.find((availableYear) => availableYear <= targetYear)
    if (carryoverYear === undefined) {
      setPriorYearCapitalLossCarryover(null)
      return
    }

    const carryover = await getPriorYearCarryover(carryoverYear)
    if (carryoverRequestId.current === requestId) {
      setPriorYearCapitalLossCarryover(carryover)
    }
  }, [getPriorYearCarryover, normalizeAvailableYears])

  const refreshAll = useCallback(async (options: RefreshAllOptions = {}) => {
    const includeTaxFacts = options.includeTaxFacts ?? true
    if (!hasLoadedOnce.current) {
      setIsLoading(true)
    }
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (includeTaxFacts) {
        params.set('include_tax_facts', '1')
      }
      const response = (await fetchWrapper.get(`/api/finance/tax-preview-data?${params.toString()}`)) as TaxPreviewDataset
      setAvailableYears(response.availableYears ?? [])
      setPayslips(Array.isArray(response.payslips) ? response.payslips : [])
      setPendingReviewCount(response.pendingReviewCount ?? 0)
      setW2Documents(Array.isArray(response.w2Documents) ? response.w2Documents : [])
      setAccountDocuments(Array.isArray(response.accountDocuments) ? response.accountDocuments : [])
      setScheduleCData(response.scheduleCData ?? null)
      setEmploymentEntities(Array.isArray(response.employmentEntities) ? response.employmentEntities : [])
      setAccounts(Array.isArray(response.accounts) ? response.accounts : [])
      setActiveAccountIds(Array.isArray(response.activeAccountIds) ? response.activeAccountIds : [])
      if (includeTaxFacts || response.taxFacts !== undefined) {
        setTaxFacts(response.taxFacts ?? null)
      }
      setError(null)
      priorYearCarryoverCache.current.clear()
      await refreshPriorYearCarryover(response.availableYears, year - 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax preview data')
      setPriorYearCapitalLossCarryover(null)
    } finally {
      hasLoadedOnce.current = true
      setIsLoading(false)
    }
  }, [refreshPriorYearCarryover, year])
  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    void (async () => {
      try {
        const status = (await fetchWrapper.get('/api/finance/marriage-status')) as Record<string, boolean>
        if (String(year) in status) {
          setIsMarried(status[String(year)] ?? false)
        } else {
          const priorYear = Object.keys(status)
            .map(Number)
            .filter(y => y < year)
            .sort((a, b) => b - a)[0]
          setIsMarried(priorYear !== undefined ? (status[String(priorYear)] ?? false) : false)
        }
      } catch {
        // Non-fatal — default to false (single)
      }
    })()
  }, [year])

  useEffect(() => {
    void (async () => {
      try {
        const states = (await fetchWrapper.get(`/api/finance/user-tax-states?year=${year}`)) as string[]
        setActiveTaxStates(Array.isArray(states) ? states : [])
      } catch (err) {
        console.error('Failed to load user tax states for year', year, err)
        setActiveTaxStates([])
      }
    })()
  }, [year])

  useEffect(() => {
    void (async () => {
      try {
        const deductions = (await fetchWrapper.get(`/api/finance/user-deductions?year=${year}`)) as UserDeductionEntry[]
        setUserDeductions(Array.isArray(deductions) ? deductions : [])
      } catch (err) {
        console.error('Failed to load user deductions for year', year, err)
        setUserDeductions([])
      }
    })()
  }, [year])

  useEffect(() => {
    void (async () => {
      try {
        const cfs = (await fetchWrapper.get(`${TAX_LOSS_CARRYFORWARD_ENDPOINT}?year=${year}`)) as PalCarryforwardEntry[]
        setPalCarryforwards(Array.isArray(cfs) ? cfs : [])
      } catch (err) {
        console.error('Failed to load PAL carryforwards for year', year, err)
        setPalCarryforwards([])
      }
    })()
  }, [year])

  const allDocuments = useMemo(
    () => [...w2Documents, ...accountDocuments],
    [w2Documents, accountDocuments],
  )

  // Fire a toast when any document transitions from in-flight → parsed.
  useEffect(() => {
    const prev = prevDocStatusRef.current
    let shouldRefreshTaxFacts = false

    for (const doc of allDocuments) {
      const prevStatus = prev.get(doc.id)
      const currentStatus = doc.genai_status ?? ''
      if (prevStatus && IN_FLIGHT_STATUSES.has(prevStatus) && doc.genai_status === 'parsed') {
        const label = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
        toast.success(`${label} is ready to review`, {
          description: doc.original_filename ?? undefined,
        })
      }
      if (prevStatus && IN_FLIGHT_STATUSES.has(prevStatus) && !IN_FLIGHT_STATUSES.has(currentStatus)) {
        shouldRefreshTaxFacts = true
      }
    }

    const next = new Map<number, string>()
    for (const doc of allDocuments) {
      if (doc.genai_status) next.set(doc.id, doc.genai_status)
    }
    prevDocStatusRef.current = next

    if (shouldRefreshTaxFacts) {
      void refreshAll()
    }
  }, [allDocuments, refreshAll])

  // Poll with backoff while any document is still being processed by the AI.
  useEffect(() => {
    const hasInFlight = allDocuments.some(d => IN_FLIGHT_STATUSES.has(d.genai_status ?? ''))
    if (!hasInFlight) return

    let attempt = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const poll = () => {
      if (attempt >= MAX_POLLING_ATTEMPTS) {
        return
      }

      void refreshAll({ includeTaxFacts: false })

      attempt++
      if (attempt < MAX_POLLING_ATTEMPTS) {
        const intervalIndex = Math.min(attempt - 1, POLLING_INTERVALS_MS.length - 1)
        const nextInterval = POLLING_INTERVALS_MS[intervalIndex]
        timeoutId = setTimeout(poll, nextInterval)
      }
    }

    // Start first poll immediately
    poll()

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [allDocuments, refreshAll])

  // Load short dividend analysis for all active accounts.
  // We fetch transactions for each active account, run analyzeShortDividends,
  // then merge the results into a single summary.
  // GATED: Only loads when consuming form (Schedule A / Form 4952) explicitly requests it.
  const loadShortDividendSummary = useCallback(() => {
    setShortDividendLoadRequested(true)
  }, [])

  useEffect(() => {
    if (!shortDividendLoadRequested) return
    if (activeAccountIds.length === 0) return

    let cancelled = false
    void (async () => {
      try {
        const perAccountResults = await Promise.all(
          activeAccountIds.map(async (acctId) => {
            const cacheKey = buildCacheKey(acctId)
            const cached = await getCachedTransactions(cacheKey)
            const synced = await syncCachedTransactions(cacheKey, `/api/finance/${acctId}/line_items/sync`)
            const transactions = synced?.transactions ?? cached?.transactions
            if (!transactions) {
              return null
            }
            const parsed = AccountLineItemSchema.array().safeParse(transactions)
            if (!parsed.success) return null
            return analyzeShortDividends(parsed.data)
          }),
        )

        if (cancelled) return

        // Merge results across accounts
        const allEntries = perAccountResults.flatMap((r) => r?.entries ?? [])
        const itemized = allEntries.filter((e) => e.treatment === 'itemized_deduction')
        const costBasis = allEntries.filter((e) => e.treatment === 'cost_basis')
        const unknown = allEntries.filter((e) => e.treatment === 'unknown')

        const sumCharged = (arr: typeof itemized) =>
          arr.reduce((acc, e) => acc.add(e.amountCharged), currency(0)).value

        setShortDividendSummary({
          entries: allEntries,
          itemizedDeductionEntries: itemized,
          costBasisEntries: costBasis,
          unknownEntries: unknown,
          totalItemizedDeduction: sumCharged(itemized),
          totalCostBasis: sumCharged(costBasis),
          totalUnknown: sumCharged(unknown),
        })
      } catch {
        // Non-fatal: short dividend analysis is supplementary
      }
    })()

    return () => { cancelled = true }
  }, [shortDividendLoadRequested, activeAccountIds])

  const reviewedW2Docs = useMemo(
    () => w2Documents.filter((doc) => doc.is_reviewed),
    [w2Documents],
  )

  const reviewed1099Docs = useMemo(
    () => accountDocuments.filter((doc) => doc.is_reviewed && doc.form_type !== 'k1'),
    [accountDocuments],
  )

  const reviewedK1Docs = useMemo(
    () => accountDocuments.filter((doc) => doc.is_reviewed && doc.form_type === 'k1'),
    [accountDocuments],
  )

  const foreignTaxSummaries = useMemo(
    () => collectForeignTaxSummaries(accountDocuments),
    [accountDocuments],
  )

  const income1099 = useMemo(() => {
    let interestIncome = currency(0)
    let dividendIncome = currency(0)
    let qualifiedDividends = currency(0)

    for (const doc of reviewed1099Docs) {
      if (!doc.parsed_data) continue
      if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
        interestIncome = interestIncome.add((doc.parsed_data as F1099IntParsedData).box1_interest ?? 0)
      } else if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
        dividendIncome = dividendIncome.add((doc.parsed_data as F1099DivParsedData).box1a_ordinary ?? 0)
        qualifiedDividends = qualifiedDividends.add((doc.parsed_data as F1099DivParsedData).box1b_qualified ?? 0)
      } else if (doc.form_type === 'broker_1099' && !Array.isArray(doc.parsed_data)) {
        // Flat-dict broker_1099 (single-account consolidated 1099): read aggregate fields directly.
        const p = doc.parsed_data as Record<string, unknown>
        interestIncome = interestIncome.add((p.box1_interest as number | undefined) ?? 0)
        dividendIncome = dividendIncome.add((p.box1a_ordinary as number | undefined) ?? 0)
        qualifiedDividends = qualifiedDividends.add((p.box1b_qualified as number | undefined) ?? 0)
      }
    }

    return { interestIncome, dividendIncome, qualifiedDividends }
  }, [reviewed1099Docs])

  const schedule1Line8Breakdown = useMemo<Schedule1Line8Breakdown>(() => {
    const breakdown: Schedule1Line8Breakdown = { line8b: 0, line8h: 0, line8i: 0, line8z: 0 }

    const addToBreakdown = (routing: string | null | undefined, amount: number) => {
      if (routing === 'sch_1_8b') {
        breakdown.line8b += amount
      } else if (routing === 'sch_1_8h') {
        breakdown.line8h += amount
      } else if (routing === 'sch_1_8i') {
        breakdown.line8i += amount
      } else {
        breakdown.line8z += amount
      }
    }

    reviewed1099Docs.forEach((doc) => {
      const links = doc.account_links ?? []

      if (links.length > 0) {
        links.forEach((link) => {
          if (link.form_type !== '1099_misc') {
            return
          }
          const entryData = extractLinkParsedData(doc, link)
            ?? (!Array.isArray(doc.parsed_data) ? doc.parsed_data as Record<string, unknown> : null)
          if (entryData == null) {
            return
          }
          const effectiveRouting = link.misc_routing ?? doc.misc_routing
          const shouldInclude = isLine8MiscRouting(effectiveRouting) || effectiveRouting == null
          if (!shouldInclude) {
            return
          }
          addToBreakdown(effectiveRouting, getDocAmounts(doc, link).other ?? 0)
        })
        return
      }

      const parsedData = !doc.parsed_data || Array.isArray(doc.parsed_data)
        ? null
        : doc.parsed_data as Record<string, unknown>

      if (doc.form_type !== '1099_misc' || parsedData == null) {
        return
      }

      const effectiveRouting = doc.misc_routing
      const shouldInclude = isLine8MiscRouting(effectiveRouting) || effectiveRouting == null
      if (!shouldInclude) {
        return
      }
      addToBreakdown(effectiveRouting, getDocAmounts(doc).other ?? 0)
    })

    return breakdown
  }, [reviewed1099Docs])

  const schedule1OtherIncome = useMemo(
    () => schedule1Line8Breakdown.line8b
      + schedule1Line8Breakdown.line8h
      + schedule1Line8Breakdown.line8i
      + schedule1Line8Breakdown.line8z,
    [schedule1Line8Breakdown],
  )

  const schedule1Line7Unemployment = useMemo(
    () => reviewed1099Docs.reduce((acc, doc) => {
      if (doc.form_type !== '1099_g') {
        return acc
      }
      const p = doc.parsed_data as F1099GParsedData | null
      return acc.add(p?.box1_unemployment ?? 0)
    }, currency(0)).value,
    [reviewed1099Docs],
  )

  const schedule1Line1aTaxableRefunds = useMemo(
    () => reviewed1099Docs.reduce((acc, doc) => {
      if (doc.form_type !== '1099_g') {
        return acc
      }
      const p = doc.parsed_data as F1099GParsedData | null
      return acc.add(p?.box2_state_local_refunds ?? 0)
    }, currency(0)).value,
    [reviewed1099Docs],
  )

  const reviewed1099RDocs = useMemo(
    () => reviewed1099Docs.filter((doc) => doc.form_type === '1099_r'),
    [reviewed1099Docs],
  )

  const scheduleCNetIncome = useMemo(() => scheduleCNetIncomeFromFacts(taxFacts?.scheduleC), [taxFacts])

  const structuredK1Docs = useMemo(
    () => reviewedK1Docs
      .map((doc) => ({ doc, data: isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null }))
      .filter((entry): entry is { doc: TaxDocument; data: FK1StructuredData } => entry.data !== null),
    [reviewedK1Docs],
  )

  const form461Lines = useMemo<Form461Lines>(() => {
    const scheduleCFacts = taxFacts?.scheduleC
    const scheduleEFacts = taxFacts?.scheduleE
    const scheduleDFacts = taxFacts?.scheduleD

    const eblData = form461({
      taxYear: year,
      isSingle: !isMarried,
      schedule1_line3: scheduleCFacts?.netProfit ?? 0,
      schedule1_line5: scheduleEFacts?.grandTotal ?? 0,
      f461_line11: Math.abs(Math.min(0, scheduleEFacts?.totalPassive ?? 0)),
      scheduleDData: scheduleDAggregatesForForm461FromFacts(scheduleDFacts),
      override_f461_line15: null,
    })
    const k1Disclosures = structuredK1Docs.flatMap(({ doc, data }) => {
      const disclosure = extractK1Form461Disclosure(data)
      if (!disclosure) {
        return []
      }

      return [{
        docId: doc.id,
        partnerName: getK1PartnerName(data, doc.employment_entity?.display_name ?? 'Partnership'),
        ...disclosure,
      }]
    })

    return {
      aggregateBusinessIncomeLoss: eblData.f461_line14,
      eblLimit: eblData.f461_line15,
      excessBusinessLoss: eblData.f461_line16,
      isTriggered: eblData.f461_line16 > 0,
      isMarried,
      k1Disclosures,
    }
  }, [isMarried, structuredK1Docs, taxFacts, year])

  const capitalLossCarryover = useMemo<CapitalLossCarryoverLines>(() => {
    if (!taxFacts) {
      return {
        netShortTerm: 0,
        netLongTerm: 0,
        combined: 0,
        appliedToOrdinaryIncome: 0,
        shortTermCarryover: 0,
        longTermCarryover: 0,
        totalCarryover: 0,
        hasCarryover: false,
      }
    }

    return computeCapitalLossCarryover(taxFacts.scheduleD.line7NetShortTerm, taxFacts.scheduleD.line15NetLongTerm)
  }, [taxFacts])

  const estimatedTaxPayments = useMemo(() => {
    if (!taxFacts || isMarried || priorYearTax <= 0) {
      return undefined
    }

    return computeEstimatedTaxPayments({
      selectedYear: year,
      priorYearTax,
      priorYearAgi,
      expectedWithholding: taxFacts.form1040.line25d,
      isMarriedFilingSeparately: false,
    })
  }, [isMarried, priorYearAgi, priorYearTax, taxFacts, year])

  const value = useMemo<TaxPreviewContextValue>(() => ({
    year,
    availableYears,
    isLoading,
    error,
    payslips,
    pendingReviewCount,
    w2Documents,
    accountDocuments,
    reviewedW2Docs,
    reviewed1099Docs,
    reviewedK1Docs,
    priorYearCapitalLossCarryover,
    reviewed1099RDocs,
    foreignTaxSummaries,
    scheduleCData,
    scheduleCNetIncome,
    form461: form461Lines,
    capitalLossCarryover,
    ...(estimatedTaxPayments ? { estimatedTaxPayments } : {}),
    employmentEntities,
    accounts,
    activeAccountIds,
    taxFacts,
    income1099,
    schedule1OtherIncome,
    schedule1Line8Breakdown,
    schedule1Line7Unemployment,
    schedule1Line1aTaxableRefunds,
    ssaGrossBenefits,
    setSsaGrossBenefits,
    isMarried,
    activeTaxStates,
    setActiveTaxStates,
    userDeductions,
    setUserDeductions,
    palCarryforwards,
    setPalCarryforwards,
    realEstateProfessional,
    setRealEstateProfessional,
    shortDividendSummary,
    priorYearAgi,
    setPriorYearAgi,
    priorYearTax,
    setPriorYearTax,
    setPayslips,
    setPendingReviewCount,
    setW2Documents,
    setAccountDocuments,
    setScheduleCData,
    setEmploymentEntities,
    setAccounts,
    setActiveAccountIds,
    setTaxFacts,
    refreshAll,
  }), [
    year,
    availableYears,
    isLoading,
    error,
    payslips,
    pendingReviewCount,
    w2Documents,
    accountDocuments,
    reviewedW2Docs,
    reviewed1099Docs,
    reviewedK1Docs,
    priorYearCapitalLossCarryover,
    reviewed1099RDocs,
    foreignTaxSummaries,
    scheduleCData,
    scheduleCNetIncome,
    form461Lines,
    capitalLossCarryover,
    estimatedTaxPayments,
    employmentEntities,
    accounts,
    activeAccountIds,
    taxFacts,
    income1099,
    schedule1OtherIncome,
    schedule1Line8Breakdown,
    schedule1Line7Unemployment,
    schedule1Line1aTaxableRefunds,
    ssaGrossBenefits,
    setSsaGrossBenefits,
    isMarried,
    activeTaxStates,
    userDeductions,
    palCarryforwards,
    realEstateProfessional,
    setRealEstateProfessional,
    shortDividendSummary,
    loadShortDividendSummary,
    priorYearAgi,
    setPriorYearAgi,
    priorYearTax,
    setPriorYearTax,
    refreshAll,
  ])

  return <TaxPreviewContext.Provider value={value}>{children}</TaxPreviewContext.Provider>
}

export function useTaxPreview(): TaxPreviewContextValue {
  const context = useContext(TaxPreviewContext)

  if (!context) {
    throw new Error('useTaxPreview must be used within a TaxPreviewProvider')
  }

  return context
}
