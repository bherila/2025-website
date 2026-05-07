'use client'

import currency from 'currency.js'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { form1040FactsToLines } from '@/components/finance/Form1040Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { collectForeignTaxSummaries, type ForeignTaxSummary } from '@/finance/1116'
import { type PalCarryforwardEntry, TAX_LOSS_CARRYFORWARD_ENDPOINT } from '@/finance/8582/form8582'
import { computeForm8959Lines } from '@/finance/8959/form8959'
import { computeCapitalLossCarryover } from '@/finance/capitalLoss/capitalLossCarryover'
import { computeEstimatedTaxPayments } from '@/lib/finance/estimatedTaxPayments'
import { accountLast4FromValue } from '@/lib/finance/form8949Extraction'
import { extractK1Form461Disclosure, getK1PartnerName, k1NetIncome, parseK1Field } from '@/lib/finance/k1Utils'
import { analyzeShortDividends, type ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { extractLinkParsedData, getDocAmounts } from '@/lib/finance/taxDocumentUtils'
import { scheduleCNetIncomeFromFacts, scheduleDDataFromFacts, taxPreviewFactsToTaxReturn } from '@/lib/finance/taxPreviewFactsAdapters'
import { form461 } from '@/lib/tax/form461'
import { buildCacheKey, getCachedTransactions, syncCachedTransactions } from '@/services/transactionCache'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { EmploymentEntity, F1099DivParsedData, F1099GParsedData, F1099IntParsedData, TaxDocument, W2ParsedData } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS, isLine8MiscRouting } from '@/types/finance/tax-document'
import type { CapitalLossCarryoverLines, OverviewRow, TaxReturn1040, UserDeductionEntry } from '@/types/finance/tax-return'
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
  /** User-entered alimony received (pre-2019 decrees) for Schedule 1 line 2a. Persisted to localStorage per year. */
  schedule1Line2aAlimony: number
  /** Setter for schedule1Line2aAlimony — persisted to localStorage per tax year. */
  setSchedule1Line2aAlimony: Dispatch<SetStateAction<number>>
  /** Form 8606 line 1 — current-year nondeductible traditional IRA contributions (user entered). */
  form8606NondeductibleContributions: number
  setForm8606NondeductibleContributions: Dispatch<SetStateAction<number>>
  /** Form 8606 line 2 — prior-year total basis carried forward. */
  form8606PriorYearBasis: number
  setForm8606PriorYearBasis: Dispatch<SetStateAction<number>>
  /** Form 8606 line 6 — year-end FMV of all traditional/SEP/SIMPLE IRAs. */
  form8606YearEndFmv: number
  setForm8606YearEndFmv: Dispatch<SetStateAction<number>>
  /** User-entered SSA-1099 gross benefits for the year (Pub 915 worksheet input). */
  ssaGrossBenefits: number
  setSsaGrossBenefits: Dispatch<SetStateAction<number>>
  /** Form 4797 Part I — net §1231 gain/(loss). */
  form4797PartINet1231: number
  setForm4797PartINet1231: Dispatch<SetStateAction<number>>
  /** Form 4797 Part II — ordinary gain/(loss). */
  form4797PartIIOrdinary: number
  setForm4797PartIIOrdinary: Dispatch<SetStateAction<number>>
  /** Form 4797 Part III — total depreciation recapture. */
  form4797PartIIIRecapture: number
  setForm4797PartIIIRecapture: Dispatch<SetStateAction<number>>
  /** Schedule F — gross farm income (line 9). */
  scheduleFGrossIncome: number
  setScheduleFGrossIncome: Dispatch<SetStateAction<number>>
  /** Schedule F — total farm expenses (line 33). */
  scheduleFTotalExpenses: number
  setScheduleFTotalExpenses: Dispatch<SetStateAction<number>>
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
  /** Prior year total tax — user-entered for safe-harbor estimated payment planning. */
  priorYearTax: number
  /** Setter for priorYearTax — persisted to localStorage per tax year. */
  setPriorYearTax: Dispatch<SetStateAction<number>>
  /** Prior year AGI — user-entered for safe-harbor threshold planning. */
  priorYearAgi: number
  /** Setter for priorYearAgi — persisted to localStorage per tax year. */
  setPriorYearAgi: Dispatch<SetStateAction<number>>
  taxReturn: TaxReturn1040
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
const POLLING_INTERVAL_MS = 5_000

function sumW2Field(reviewedW2Docs: TaxDocument[], field: keyof W2ParsedData, fallbackField?: keyof W2ParsedData): number {
  return reviewedW2Docs.reduce((acc, doc) => {
    const parsed = doc.parsed_data as W2ParsedData | null
    const primary = parsed?.[field]
    const fallback = fallbackField ? parsed?.[fallbackField] : null
    const numericValue = typeof primary === 'number'
      ? primary
      : typeof fallback === 'number'
        ? fallback
        : 0

    return acc.add(numericValue)
  }, currency(0)).value
}

function sumPayslipField(payslips: fin_payslip[], field: keyof fin_payslip): number {
  return payslips.reduce((acc, row) => acc.add(Number(row[field] ?? 0)), currency(0)).value
}

function computeMedicareWages(reviewedW2Docs: TaxDocument[], payslips: fin_payslip[] = []): number {
  if (reviewedW2Docs.length > 0) {
    return sumW2Field(reviewedW2Docs, 'box5_medicare_wages', 'box1_wages')
  }

  return sumPayslipField(payslips, 'taxable_wages_medicare')
}

function toTaxReturnYearK1Entries(reviewedK1Docs: TaxDocument[]) {
  return reviewedK1Docs
    .map((doc) => {
      if (!isFK1StructuredData(doc.parsed_data)) {
        return null
      }

      const entityName =
        doc.parsed_data.fields['B']?.value?.split('\n')[0] ??
        doc.employment_entity?.display_name ??
        doc.original_filename ??
        `K1-${doc.id}`
      const ein = doc.parsed_data.fields['A']?.value ?? undefined
      const fields = Object.fromEntries(
        Object.entries(doc.parsed_data.fields)
          .filter(([, field]) => field?.value !== null && field?.value !== undefined && field?.value !== '')
          .map(([key, field]) => {
            const n = Number(field.value)
            return [key, Number.isNaN(n) ? String(field.value) : n]
          }),
      )
      const codes = Object.fromEntries(
        Object.entries(doc.parsed_data.codes).map(([box, items]) => [
          box,
          items.map(item => ({
            code: item.code,
            value: item.value,
            ...(item.notes ? { notes: item.notes } : {}),
            ...(item.character ? { character: item.character } : {}),
          })),
        ]),
      )

      return {
        entityName,
        ...(ein ? { ein } : {}),
        fields,
        codes,
        ...(doc.parsed_data.k3?.sections ? { k3Sections: doc.parsed_data.k3.sections } : {}),
        ...(doc.parsed_data.passiveActivities?.length ? { passiveActivities: doc.parsed_data.passiveActivities } : {}),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

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
  const schedule1Line2aAlimonyKey = `tax-preview-schedule1-2a-alimony-${year}`
  const [schedule1Line2aAlimony, setSchedule1Line2aAlimonyRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(schedule1Line2aAlimonyKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setSchedule1Line2aAlimony: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setSchedule1Line2aAlimonyRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(schedule1Line2aAlimonyKey, String(next))
        }
        return next
      })
    },
    [schedule1Line2aAlimonyKey],
  )

  const form8606NondeductibleKey = `tax-preview-8606-nondeductible-${year}`
  const [form8606NondeductibleContributions, setForm8606NondeductibleRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form8606NondeductibleKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm8606NondeductibleContributions: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm8606NondeductibleRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form8606NondeductibleKey, String(next))
        }
        return next
      })
    },
    [form8606NondeductibleKey],
  )
  const form8606PriorBasisKey = `tax-preview-8606-prior-basis-${year}`
  const [form8606PriorYearBasis, setForm8606PriorBasisRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form8606PriorBasisKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm8606PriorYearBasis: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm8606PriorBasisRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form8606PriorBasisKey, String(next))
        }
        return next
      })
    },
    [form8606PriorBasisKey],
  )
  const form8606FmvKey = `tax-preview-8606-fmv-${year}`
  const [form8606YearEndFmv, setForm8606FmvRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form8606FmvKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm8606YearEndFmv: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm8606FmvRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form8606FmvKey, String(next))
        }
        return next
      })
    },
    [form8606FmvKey],
  )

  const form4797PartIKey = `tax-preview-4797-part-i-${year}`
  const [form4797PartINet1231, setForm4797PartINet1231Raw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form4797PartIKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm4797PartINet1231: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm4797PartINet1231Raw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form4797PartIKey, String(next))
        }
        return next
      })
    },
    [form4797PartIKey],
  )
  const form4797PartIIKey = `tax-preview-4797-part-ii-${year}`
  const [form4797PartIIOrdinary, setForm4797PartIIOrdinaryRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form4797PartIIKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm4797PartIIOrdinary: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm4797PartIIOrdinaryRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form4797PartIIKey, String(next))
        }
        return next
      })
    },
    [form4797PartIIKey],
  )
  const form4797PartIIIKey = `tax-preview-4797-part-iii-${year}`
  const [form4797PartIIIRecapture, setForm4797PartIIIRecaptureRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(form4797PartIIIKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setForm4797PartIIIRecapture: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setForm4797PartIIIRecaptureRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(form4797PartIIIKey, String(next))
        }
        return next
      })
    },
    [form4797PartIIIKey],
  )

  const scheduleFIncomeKey = `tax-preview-sch-f-income-${year}`
  const [scheduleFGrossIncome, setScheduleFGrossIncomeRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(scheduleFIncomeKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setScheduleFGrossIncome: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setScheduleFGrossIncomeRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(scheduleFIncomeKey, String(next))
        }
        return next
      })
    },
    [scheduleFIncomeKey],
  )
  const scheduleFExpensesKey = `tax-preview-sch-f-expenses-${year}`
  const [scheduleFTotalExpenses, setScheduleFTotalExpensesRaw] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = localStorage.getItem(scheduleFExpensesKey)
    if (stored === null) return 0
    const n = parseFloat(stored)
    return isNaN(n) ? 0 : n
  })
  const setScheduleFTotalExpenses: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      setScheduleFTotalExpensesRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value
        if (typeof window !== 'undefined') {
          localStorage.setItem(scheduleFExpensesKey, String(next))
        }
        return next
      })
    },
    [scheduleFExpensesKey],
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

    const carryover = await getPriorYearCarryover(targetYear)
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

  // Poll every 5 s while any document is still being processed by the AI.
  useEffect(() => {
    const hasInFlight = allDocuments.some(d => IN_FLIGHT_STATUSES.has(d.genai_status ?? ''))
    if (!hasInFlight) return
    const id = setInterval(() => void refreshAll({ includeTaxFacts: false }), POLLING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [allDocuments, refreshAll])

  // Load short dividend analysis for all active accounts.
  // We fetch transactions for each active account, run analyzeShortDividends,
  // then merge the results into a single summary.
  useEffect(() => {
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
  }, [activeAccountIds])

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

  const taxReturn = useMemo<TaxReturn1040>(() => {
    const k1Parsed = reviewedK1Docs
      .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
      .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

    const medicareWages = computeMedicareWages(reviewedW2Docs, payslips)

    const docRows: OverviewRow[] = []
    for (const doc of reviewedW2Docs) {
      const p = doc.parsed_data as Record<string, unknown>
      const employer = (p?.employer_name as string | undefined) ?? doc.employment_entity?.display_name ?? doc.account?.acct_name ?? '—'
      const wages = p?.box1_wages as number | undefined
      const fedTax = p?.box2_fed_tax as number | undefined
      docRows.push({
        item: `${employer} — W-2`,
        amount: wages,
        note: fedTax != null ? `Fed WH: ${currency(fedTax).format()}` : undefined,
      })
    }

    for (const { doc, data } of k1Parsed) {
      const partnerName = data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership K-1'
      const net = k1NetIncome(data)
      const interest = parseK1Field(data, '5')
      const foreignTax = parseK1Field(data, '21')
      const noteParts = [
        net < 0 ? 'Net loss — Schedule E' : 'Net income — Schedule E',
        interest !== 0 ? `Interest: ${currency(interest).format()}` : null,
        foreignTax !== 0 ? `Foreign tax: ${currency(foreignTax).format()}` : null,
      ].filter(Boolean)
      docRows.push({ item: `${partnerName} — K-1`, amount: net, note: noteParts.join(' · ') })
    }

    for (const doc of reviewed1099Docs) {
      const p = doc.parsed_data as Record<string, unknown>
      const isBroker = doc.form_type === 'broker_1099'
      const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? doc.account?.acct_name ?? '—'
      const interest = p?.box1_interest as number | undefined
      const ordDiv = p?.box1a_ordinary as number | undefined
      const grossDistribution = doc.form_type === '1099_r' ? (p?.box1_gross_distribution as number | undefined) : undefined
      const taxableDistribution = doc.form_type === '1099_r'
        ? ((p?.box2a_taxable_amount as number | undefined) ?? (p?.box1_gross_distribution as number | undefined))
        : undefined
      const foreignTax = (p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined
      const capGainLoss = isBroker ? (p?.total_realized_gain_loss as number | undefined) : undefined
      const fedTaxWithheld = doc.form_type === '1099_r' ? (p?.box4_fed_tax as number | undefined) : undefined
      const label = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
      const noteParts = [
        interest != null && interest !== 0 ? `Interest: ${currency(interest).format()}` : null,
        ordDiv != null && ordDiv !== 0 ? `Ord div: ${currency(ordDiv).format()}` : null,
        grossDistribution != null && grossDistribution !== 0 ? `Gross dist: ${currency(grossDistribution).format()}` : null,
        taxableDistribution != null && taxableDistribution !== 0 ? `Taxable dist: ${currency(taxableDistribution).format()}` : null,
        capGainLoss != null && capGainLoss !== 0 ? `Cap G/L: ${currency(capGainLoss).format()}` : null,
        foreignTax != null && foreignTax !== 0 ? `Foreign tax: ${currency(foreignTax, { precision: 2 }).format()}` : null,
        fedTaxWithheld != null && fedTaxWithheld !== 0 ? `Fed WH: ${currency(fedTaxWithheld).format()}` : null,
      ].filter(Boolean)
      const primaryAmount = currency(interest ?? 0)
        .add(ordDiv ?? 0)
        .add(grossDistribution ?? 0).value
      docRows.push({
        item: `${payer} — ${label}`,
        amount: primaryAmount !== 0 ? primaryAmount : undefined,
        note: noteParts.join(' · ') || undefined,
      })
    }

    const taxPositionRows: OverviewRow[] = []
    if (taxFacts) {
      const totalInvestmentIncome = currency(taxFacts.scheduleB.interestTotal)
        .add(taxFacts.scheduleB.ordinaryDividendTotal).value

      if (taxFacts.form1040.line1z > 0) taxPositionRows.push({ item: 'W-2 Wages', amount: taxFacts.form1040.line1z, note: 'Form 1040 line 1z' })
      if (totalInvestmentIncome !== 0) taxPositionRows.push({ item: 'Net investment income (interest + divs)', amount: totalInvestmentIncome, note: 'Before deductions; subject to NIIT (3.8%)' })
      if (taxFacts.scheduleD.line16Combined !== 0) taxPositionRows.push({ item: 'Net capital gain (loss)', amount: taxFacts.scheduleD.line16Combined, note: 'Schedule D line 16' })
      if (taxFacts.scheduleD.ambiguous11SSources.length > 0) taxPositionRows.push({ item: 'K-1 Box 11S character review needed', amount: taxFacts.scheduleD.ambiguous11SAmount, note: `${taxFacts.scheduleD.ambiguous11SSources.length} non-portfolio capital gain/loss line(s) need S/T or L/T classification before Schedule D routing.` })
      if (taxFacts.form4952.totalInvestmentInterestExpense !== 0) taxPositionRows.push({ item: 'Investment interest deduction (Form 4952)', amount: taxFacts.form4952.totalInvestmentInterestExpense, note: 'Deductible amount flows to Schedule A line 9' })
      if (taxFacts.form1116.totalForeignTaxes !== 0) taxPositionRows.push({ item: 'Foreign tax credit (Form 1116)', amount: taxFacts.form1116.totalForeignTaxes, note: 'Dollar-for-dollar vs. income tax' })
      if (taxFacts.form1040.line25d > 0) taxPositionRows.push({ item: 'Federal withholding', amount: taxFacts.form1040.line25d, note: 'Form 1040 line 25d' })
    }

    const medicareThreshold = isMarried ? 250000 : 200000
    if (medicareWages > medicareThreshold) taxPositionRows.push({ item: 'Additional Medicare Tax (Form 8959)', amount: -currency(Math.max(0, medicareWages - medicareThreshold)).multiply(0.009).value, note: '0.9% on Medicare wages over the filing-status threshold' })

    const overviewSections = [
      ...(docRows.length > 0 ? [{ heading: 'Tax Documents', rows: docRows }] : []),
      ...(taxPositionRows.length > 0 ? [{ heading: 'Estimated Tax Positions', rows: taxPositionRows }] : []),
    ]

    const scheduleDData = taxFacts ? scheduleDDataFromFacts(taxFacts.scheduleD) : null
    const eblData = form461({
      taxYear: year,
      isSingle: !isMarried,
      schedule1_line3: taxFacts?.scheduleC.netProfit ?? 0,
      schedule1_line5: taxFacts?.scheduleE.grandTotal ?? 0,
      scheduleDData: scheduleDData ?? scheduleDDataFromFacts({
        form8949Rollups: [],
        line5Sources: [],
        line3Sources: [],
        line10Sources: [],
        line12Sources: [],
        line13Sources: [],
        ambiguous11SSources: [],
        line1aGainLoss: 0,
        line1bGainLoss: 0,
        line2GainLoss: 0,
        line3GainLoss: 0,
        line4GainLoss: 0,
        line5GainLoss: 0,
        line6Carryover: 0,
        line7NetShortTerm: 0,
        line8aGainLoss: 0,
        line8bGainLoss: 0,
        line9GainLoss: 0,
        line10GainLoss: 0,
        line11GainLoss: 0,
        line12GainLoss: 0,
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
        ambiguous11SAmount: 0,
      }),
      override_f461_line15: null,
    })
    const k1Form461Disclosures = k1Parsed.flatMap(({ doc, data }) => {
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
    const form461Lines = {
      aggregateBusinessIncomeLoss: eblData.f461_line9,
      eblLimit: eblData.f461_line15, // form461() already computes the limit via ExcessBusinessLossLimitation()
      excessBusinessLoss: eblData.f461_line16,
      isTriggered: eblData.f461_line16 > 0,
      isMarried,
      k1Disclosures: k1Form461Disclosures,
    }

    const medicareWageSources = reviewedW2Docs.map((doc) => {
      const p = doc.parsed_data as W2ParsedData | null
      const medicareWagesForSource = p?.box5_medicare_wages ?? p?.box1_wages ?? 0
      const label = p?.employer_name ?? doc.employment_entity?.display_name ?? doc.original_filename ?? 'W-2'
      return { label, wages: medicareWagesForSource }
    }).filter(s => s.wages > 0)

    const form8959 = computeForm8959Lines(medicareWages, isMarried, medicareWageSources)

    const estimatedTaxPayments = taxFacts && !isMarried && priorYearTax > 0
      ? computeEstimatedTaxPayments({
          selectedYear: year,
          priorYearTax,
          priorYearAgi,
          expectedWithholding: taxFacts.form1040.line25d,
          isMarriedFilingSeparately: false,
        })
      : undefined

    const k1Docs = toTaxReturnYearK1Entries(reviewedK1Docs)
    const k3Docs = reviewedK1Docs
      .map((doc) => {
        const parsed = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
        if (!parsed) {
          return null
        }

        return {
          entityName:
            parsed.fields['B']?.value?.split('\n')[0] ??
            doc.employment_entity?.display_name ??
            doc.original_filename ??
            `K3-${doc.id}`,
          sections: parsed.k3?.sections ?? [],
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    const docs1099 = reviewed1099Docs.map((doc) => {
      const parsedData = (doc.parsed_data ?? {}) as Record<string, unknown> | Record<string, unknown>[]
      const firstBrokerEntry = Array.isArray(parsedData)
        ? parsedData.find((entry) => typeof entry.account_name === 'string')
        : null
      const payerName = !Array.isArray(parsedData)
        ? (parsedData.payer_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? `Doc-${doc.id}`
        : (firstBrokerEntry?.account_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? `Doc-${doc.id}`
      const accountLast4 = !Array.isArray(parsedData)
        ? accountLast4FromValue(parsedData.account_number) ?? accountLast4FromValue(doc.account?.acct_number)
        : accountLast4FromValue(doc.account?.acct_number)

      return {
        formType: doc.form_type,
        payerName,
        parsedData,
        accountId: doc.account_id,
        accountName: doc.account?.acct_name ?? null,
        accountLast4,
        accountLinks: (doc.account_links ?? []).map((link) => ({
          id: link.id,
          account_id: link.account_id,
          form_type: link.form_type,
          reporting_mode: link.reporting_mode ?? null,
          ai_identifier: link.ai_identifier,
          ai_account_name: link.ai_account_name,
          account: link.account,
        })),
      }
    })

    const capitalLossCarryover = taxFacts
      ? computeCapitalLossCarryover(taxFacts.scheduleD.line7NetShortTerm, taxFacts.scheduleD.line15NetLongTerm)
      : {
          netShortTerm: 0,
          netLongTerm: 0,
          combined: 0,
          appliedToOrdinaryIncome: 0,
          shortTermCarryover: 0,
          longTermCarryover: 0,
          totalCarryover: 0,
          hasCarryover: false,
        }

    if (!taxFacts) {
      return {
        year,
        ...(overviewSections.length > 0 ? { overviewSections } : {}),
        scheduleC: scheduleCNetIncomeFromFacts(undefined),
        form8959,
        form461: form461Lines,
        capitalLossCarryover,
        k1Docs,
        k3Docs,
        docs1099,
        ...(shortDividendSummary ? { shortDividends: shortDividendSummary } : {}),
      }
    }

    return {
      ...taxPreviewFactsToTaxReturn(taxFacts, {
        isMarried,
        form8959,
        form461: form461Lines,
        capitalLossCarryover,
        ...(overviewSections.length > 0 ? { overviewSections } : {}),
        k1Docs,
        k3Docs,
        docs1099,
        ...(shortDividendSummary ? { shortDividends: shortDividendSummary } : {}),
        ...(estimatedTaxPayments ? { estimatedTaxPayments } : {}),
      }),
      year,
      form1040: form1040FactsToLines(taxFacts.form1040),
    }
  }, [
    year,
    reviewed1099Docs,
    reviewedK1Docs,
    reviewedW2Docs,
    payslips,
    shortDividendSummary,
    isMarried,
    priorYearAgi,
    priorYearTax,
    taxFacts,
  ])

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
    employmentEntities,
    accounts,
    activeAccountIds,
    taxFacts,
    income1099,
    schedule1OtherIncome,
    schedule1Line8Breakdown,
    schedule1Line7Unemployment,
    schedule1Line1aTaxableRefunds,
    schedule1Line2aAlimony,
    setSchedule1Line2aAlimony,
    form8606NondeductibleContributions,
    setForm8606NondeductibleContributions,
    form8606PriorYearBasis,
    setForm8606PriorYearBasis,
    form8606YearEndFmv,
    setForm8606YearEndFmv,
    ssaGrossBenefits,
    setSsaGrossBenefits,
    form4797PartINet1231,
    setForm4797PartINet1231,
    form4797PartIIOrdinary,
    setForm4797PartIIOrdinary,
    form4797PartIIIRecapture,
    setForm4797PartIIIRecapture,
    scheduleFGrossIncome,
    setScheduleFGrossIncome,
    scheduleFTotalExpenses,
    setScheduleFTotalExpenses,
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
    taxReturn,
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
    employmentEntities,
    accounts,
    activeAccountIds,
    taxFacts,
    income1099,
    schedule1OtherIncome,
    schedule1Line8Breakdown,
    schedule1Line7Unemployment,
    schedule1Line1aTaxableRefunds,
    schedule1Line2aAlimony,
    setSchedule1Line2aAlimony,
    form8606NondeductibleContributions,
    setForm8606NondeductibleContributions,
    form8606PriorYearBasis,
    setForm8606PriorYearBasis,
    form8606YearEndFmv,
    setForm8606YearEndFmv,
    ssaGrossBenefits,
    setSsaGrossBenefits,
    form4797PartINet1231,
    setForm4797PartINet1231,
    form4797PartIIOrdinary,
    setForm4797PartIIOrdinary,
    form4797PartIIIRecapture,
    setForm4797PartIIIRecapture,
    scheduleFGrossIncome,
    setScheduleFGrossIncome,
    scheduleFTotalExpenses,
    setScheduleFTotalExpenses,
    isMarried,
    activeTaxStates,
    userDeductions,
    palCarryforwards,
    realEstateProfessional,
    setRealEstateProfessional,
    shortDividendSummary,
    priorYearAgi,
    setPriorYearAgi,
    priorYearTax,
    setPriorYearTax,
    taxReturn,
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
