'use client'

import currency from 'currency.js'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { compute1099RDistributionSummary, computeForm1040Lines } from '@/components/finance/Form1040Preview'
import { computeForm4797 } from '@/components/finance/Form4797Preview'
import { computeForm4952Lines } from '@/components/finance/Form4952Preview'
import { computeForm8606 } from '@/components/finance/Form8606Preview'
import { computeForm8995 } from '@/components/finance/Form8995Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import { computeSchedule1Totals } from '@/components/finance/Schedule1Preview'
import { computeScheduleALines } from '@/components/finance/ScheduleAPreview'
import { computeScheduleB } from '@/components/finance/ScheduleBPreview'
import { computeScheduleCNetIncome } from '@/components/finance/ScheduleCPreview'
import { computeScheduleD } from '@/components/finance/ScheduleDPreview'
import { computeScheduleELines } from '@/components/finance/ScheduleEPreview'
import { computeScheduleF } from '@/components/finance/ScheduleFPreview'
import { computeScheduleSE } from '@/components/finance/ScheduleSEPreview'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { collectForeignTaxSummaries, computeForm1116Lines, type ForeignTaxSummary } from '@/finance/1116'
import { computeForm6251Lines } from '@/finance/6251/form6251'
import { computeForm8582, type PalCarryforwardEntry, TAX_LOSS_CARRYFORWARD_ENDPOINT } from '@/finance/8582/form8582'
import { computeForm8959Lines } from '@/finance/8959/form8959'
import { computeForm8960Lines } from '@/finance/8960/form8960'
import { computeCapitalLossCarryover } from '@/finance/capitalLoss/capitalLossCarryover'
import { computeMedicareWages } from '@/finance/scheduleSE/computeScheduleSE'
import { computeEstimatedTaxPayments } from '@/lib/finance/estimatedTaxPayments'
import { getK1CodeItems, k1NetIncome, parseK1Field } from '@/lib/finance/k1Utils'
import { parseMoneyOrZero } from '@/lib/finance/money'
import { analyzeShortDividends, type ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { extractLinkParsedData, getDocAmounts, hasNonZeroNumericValue } from '@/lib/finance/taxDocumentUtils'
import { form461 } from '@/lib/tax/form461'
import { calculateTax } from '@/lib/tax/taxBracket'
import { buildCacheKey, getCachedTransactions, setCachedTransactions } from '@/services/transactionCache'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { EmploymentEntity, F1099DivParsedData, F1099GParsedData, F1099IntParsedData, TaxDocument, W2ParsedData } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS, isLine8MiscRouting } from '@/types/finance/tax-document'
import type { OverviewRow, TaxReturn1040, UserDeductionEntry } from '@/types/finance/tax-return'

import type { Schedule1Line8Breakdown } from './Schedule1Preview'
import type { ScheduleCResponse, YearData } from './ScheduleCPreview'

const FEDERAL_TAX_STATE = ''

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
  reviewed1099RDocs: TaxDocument[]
  foreignTaxSummaries: ForeignTaxSummary[]
  scheduleCData: ScheduleCResponse | null
  scheduleCNetIncome: { total: number; byQuarter: { q1: number; q2: number; q3: number; q4: number } }
  employmentEntities: EmploymentEntity[]
  accounts: TaxPreviewAccount[]
  activeAccountIds: number[]
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
  refreshAll: () => Promise<void>
}

const TaxPreviewContext = createContext<TaxPreviewContextValue | null>(null)

const IN_FLIGHT_STATUSES = new Set(['pending', 'processing'])
const POLLING_INTERVAL_MS = 5_000

function buildEmptyScheduleCNetIncome() {
  return { total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }
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
  const [scheduleCData, setScheduleCData] = useState<ScheduleCResponse | null>(null)
  const [employmentEntities, setEmploymentEntities] = useState<EmploymentEntity[]>([])
  const [accounts, setAccounts] = useState<TaxPreviewAccount[]>([])
  const [activeAccountIds, setActiveAccountIds] = useState<number[]>([])
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

  const refreshAll = useCallback(async () => {
    if (!hasLoadedOnce.current) {
      setIsLoading(true)
    }
    try {
      const response = (await fetchWrapper.get(`/api/finance/tax-preview-data?year=${year}`)) as TaxPreviewDataset
      setAvailableYears(response.availableYears ?? [])
      setPayslips(Array.isArray(response.payslips) ? response.payslips : [])
      setPendingReviewCount(response.pendingReviewCount ?? 0)
      setW2Documents(Array.isArray(response.w2Documents) ? response.w2Documents : [])
      setAccountDocuments(Array.isArray(response.accountDocuments) ? response.accountDocuments : [])
      setScheduleCData(response.scheduleCData ?? null)
      setEmploymentEntities(Array.isArray(response.employmentEntities) ? response.employmentEntities : [])
      setAccounts(Array.isArray(response.accounts) ? response.accounts : [])
      setActiveAccountIds(Array.isArray(response.activeAccountIds) ? response.activeAccountIds : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax preview data')
    } finally {
      hasLoadedOnce.current = true
      setIsLoading(false)
    }
  }, [year])

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
    for (const doc of allDocuments) {
      const prevStatus = prev.get(doc.id)
      if (prevStatus && IN_FLIGHT_STATUSES.has(prevStatus) && doc.genai_status === 'parsed') {
        const label = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
        toast.success(`${label} is ready to review`, {
          description: doc.original_filename ?? undefined,
        })
      }
    }
    const next = new Map<number, string>()
    for (const doc of allDocuments) {
      if (doc.genai_status) next.set(doc.id, doc.genai_status)
    }
    prevDocStatusRef.current = next
  }, [allDocuments])

  // Poll every 5 s while any document is still being processed by the AI.
  useEffect(() => {
    const hasInFlight = allDocuments.some(d => IN_FLIGHT_STATUSES.has(d.genai_status ?? ''))
    if (!hasInFlight) return
    const id = setInterval(() => void refreshAll(), POLLING_INTERVAL_MS)
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
            // Check IndexedDB cache first — avoids redundant API calls when
            // transactions were already fetched by the Transactions page.
            const cacheKey = buildCacheKey(acctId)
            const cached = await getCachedTransactions(cacheKey)
            if (cached) {
              return analyzeShortDividends(cached.transactions)
            }
            // Fall back to API fetch (stores all years, no year param)
            const raw = await fetchWrapper.get(`/api/finance/${acctId}/line_items`)
            const parsed = AccountLineItemSchema.array().safeParse(raw)
            if (!parsed.success) return null
            // Populate cache so the Transactions page and future Tax Preview loads benefit
            void setCachedTransactions(cacheKey, parsed.data)
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
        interestIncome = interestIncome.add((p.int_1_interest_income as number | undefined) ?? 0)
        dividendIncome = dividendIncome.add((p.div_1a_total_ordinary as number | undefined) ?? 0)
        qualifiedDividends = qualifiedDividends.add((p.div_1b_qualified as number | undefined) ?? 0)
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
          if (entryData == null) {
            return
          }
          const effectiveRouting = link.misc_routing ?? doc.misc_routing
          const shouldInclude = isLine8MiscRouting(effectiveRouting)
            || (effectiveRouting == null && !hasNonZeroNumericValue(entryData, 'box1_rents', 'box2_royalties'))
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
      const shouldInclude = isLine8MiscRouting(effectiveRouting)
        || (effectiveRouting == null && !hasNonZeroNumericValue(parsedData, 'box1_rents', 'box2_royalties'))
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

  const scheduleCNetIncome = useMemo(() => {
    if (!scheduleCData?.years) return buildEmptyScheduleCNetIncome()

    return computeScheduleCNetIncome(scheduleCData.years as YearData[], year)
  }, [scheduleCData, year])

  const w2GrossIncome = useMemo(() => payslips.reduce((acc, row) => acc
    .add(row.ps_salary ?? 0)
    .add(row.earnings_bonus ?? 0)
    .add(row.earnings_rsu ?? 0)
    .add(row.ps_vacation_payout ?? 0)
    .add(row.imp_ltd ?? 0)
    .add(row.imp_legal ?? 0)
    .add(row.imp_fitness ?? 0)
    .add(row.imp_other ?? 0)
    .subtract(row.ps_401k_pretax ?? 0)
    .subtract(row.ps_pretax_medical ?? 0)
    .subtract(row.ps_pretax_dental ?? 0)
    .subtract(row.ps_pretax_vision ?? 0)
    .subtract(row.ps_pretax_fsa ?? 0), currency(0)), [payslips])

  const taxReturn = useMemo<TaxReturn1040>(() => {
    const reviewedIntDocs = reviewed1099Docs.filter((doc) => doc.form_type === '1099_int' || doc.form_type === '1099_int_c')
    const reviewedDivDocs = reviewed1099Docs.filter((doc) => doc.form_type === '1099_div' || doc.form_type === '1099_div_c')
    const retirementDistributionSummary = compute1099RDistributionSummary(reviewed1099RDocs)
    const scheduleD = computeScheduleD(reviewedK1Docs, reviewed1099Docs)

    // ── Overview sheet data ───────────────────────────────────────────────────
    const k1Parsed = reviewedK1Docs
      .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
      .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

    const k1Interest = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '5')), currency(0)).value
    const k1OrdinaryDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6a')), currency(0)).value
    const k1StCapital = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '8')), currency(0)).value
    const k1LtCapital = k1Parsed.reduce((acc, { data }) => acc
      .add(parseK1Field(data, '9a'))
      .add(parseK1Field(data, '9b'))
      .add(parseK1Field(data, '9c'))
      .add(parseK1Field(data, '10')), currency(0)).value
    const k1ForeignTax = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '21')), currency(0)).value
    const k1InvInterest = k1Parsed.reduce((acc, { data }) => {
      const items = [...getK1CodeItems(data, '13', 'G'), ...getK1CodeItems(data, '13', 'H')]
      return acc.add(items.reduce((s, i) => s.add(parseMoneyOrZero(i.value)), currency(0)))
    }, currency(0)).value

    const div1099ForeignTax = reviewed1099Docs
      .filter((d) => d.form_type === '1099_div' || d.form_type === '1099_div_c')
      .reduce((acc, d) => {
        const p = d.parsed_data as Record<string, unknown>
        return acc.add(parseMoneyOrZero(p?.box7_foreign_tax))
      }, currency(0)).value

    const totalInterest = income1099.interestIncome.add(k1Interest).value
    const totalOrdinaryDiv = income1099.dividendIncome.add(k1OrdinaryDiv).value
    const totalInvestmentIncome = currency(totalInterest).add(totalOrdinaryDiv).value
    const totalForeignTax = currency(k1ForeignTax).add(div1099ForeignTax).value
    const totalCapitalGains = currency(k1StCapital).add(k1LtCapital).value

    const yearStr = String(year)
    const yearPayslips = payslips.filter((r) => r.pay_date && r.pay_date > `${yearStr}-01-01` && r.pay_date < `${String(year + 1)}-01-01`)
    const payrollFederalWithholding = yearPayslips.reduce((acc, r) => acc.add(r.ps_fed_tax ?? 0).add(r.ps_fed_tax_addl ?? 0).subtract(r.ps_fed_tax_refunded ?? 0), currency(0)).value
    const totalFederalWithholding = currency(payrollFederalWithholding).add(retirementDistributionSummary.federalWithholding).value
    const medicareWages = computeMedicareWages(reviewedW2Docs, payslips)

    const docRows: OverviewRow[] = []
    // W-2 documents
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
    // K-1 documents
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
    // 1099 documents
    for (const doc of reviewed1099Docs) {
      const p = doc.parsed_data as Record<string, unknown>
      const isBroker = doc.form_type === 'broker_1099'
      const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? doc.account?.acct_name ?? '—'
      const interest = isBroker ? (p?.int_1_interest_income as number | undefined) : (p?.box1_interest as number | undefined)
      const ordDiv = isBroker ? (p?.div_1a_total_ordinary as number | undefined) : (p?.box1a_ordinary as number | undefined)
      const grossDistribution = doc.form_type === '1099_r' ? (p?.box1_gross_distribution as number | undefined) : undefined
      const taxableDistribution = doc.form_type === '1099_r'
        ? ((p?.box2a_taxable_amount as number | undefined) ?? (p?.box1_gross_distribution as number | undefined))
        : undefined
      const foreignTax = isBroker ? (p?.div_7_foreign_tax_paid as number | undefined) : ((p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined)
      const capGainLoss = isBroker ? (p?.b_total_gain_loss as number | undefined) : undefined
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
    if (w2GrossIncome.value > 0) taxPositionRows.push({ item: 'W-2 Wages', amount: w2GrossIncome.value, note: 'Box 1 — includes RSU vesting and bonuses' })
    if (totalInvestmentIncome !== 0) taxPositionRows.push({ item: 'Net investment income (interest + divs)', amount: totalInvestmentIncome, note: 'Before deductions; subject to NIIT (3.8%)' })
    if (k1StCapital !== 0 || k1LtCapital !== 0) taxPositionRows.push({ item: 'Net capital gain (loss) — K-1s', amount: totalCapitalGains, note: `S/T ${k1StCapital.toLocaleString()} · L/T ${k1LtCapital.toLocaleString()}` })
    if (scheduleD.has11SAmbiguous) taxPositionRows.push({ item: 'K-1 Box 11S character review needed', amount: scheduleD.ambiguous11SAmount, note: `${scheduleD.ambiguous11SCount} non-portfolio capital gain/loss line(s) need S/T or L/T classification before Schedule D routing.` })
    if (k1InvInterest !== 0) taxPositionRows.push({ item: 'Investment interest deduction (Form 4952)', amount: k1InvInterest, note: 'From K-1 Box 13G/H — flows to Schedule E' })
    if (totalForeignTax !== 0) taxPositionRows.push({ item: 'Foreign tax credit (Form 1116)', amount: totalForeignTax, note: 'Dollar-for-dollar vs. income tax' })
    if (totalFederalWithholding > 0) {
      const federalWithholdingLabel = retirementDistributionSummary.federalWithholding > 0
        ? 'Federal withholding (payroll + 1099-R)'
        : 'Federal withholding (payroll)'
      const federalWithholdingNote = retirementDistributionSummary.federalWithholding > 0
        ? 'Includes payslip withholding plus 1099-R Box 4 withholding already paid'
        : 'Already paid — compare to final liability'

      taxPositionRows.push({
        item: federalWithholdingLabel,
        amount: totalFederalWithholding,
        note: federalWithholdingNote,
      })
    }
    const medicareThreshold = isMarried ? 250000 : 200000
    if (medicareWages > medicareThreshold) taxPositionRows.push({ item: 'Additional Medicare Tax (Form 8959)', amount: -currency(Math.max(0, medicareWages - medicareThreshold)).multiply(0.009).value, note: '0.9% on Medicare wages over the filing-status threshold' })

    const overviewSections = [
      ...(docRows.length > 0 ? [{ heading: 'Tax Documents', rows: docRows }] : []),
      ...(taxPositionRows.length > 0 ? [{ heading: 'Estimated Tax Positions', rows: taxPositionRows }] : []),
    ]
    const scheduleB = computeScheduleB(reviewedK1Docs, reviewed1099Docs, income1099)
    const scheduleE = computeScheduleELines(reviewedK1Docs, reviewed1099Docs)
    const saltPaid = reviewedW2Docs.reduce((acc, doc) => {
      const p = doc.parsed_data as { box17_state_tax?: number | null } | null
      return currency(acc).add(p?.box17_state_tax ?? 0).value
    }, 0)
    const scheduleA = computeScheduleALines({
      reviewedK1Docs,
      reviewed1099Docs,
      ...(shortDividendSummary ? { shortDividendSummary } : {}),
      saltPaid,
      year,
      isMarried,
      userDeductions,
    })
    const form4952 = computeForm4952Lines({
      reviewedK1Docs,
      reviewed1099Docs,
      income1099,
      shortDividendDeduction: shortDividendSummary?.totalItemizedDeduction ?? 0,
    })
    const form1116 = computeForm1116Lines({ reviewedK1Docs, reviewed1099Docs, foreignTaxSummaries })
    // Schedule D line 21 carries the Form 1040 loss limitation when applicable;
    // otherwise line 16 is the amount that flows to Form 1040 line 7.
    const capitalGainOrLossToReturn = scheduleD.schD.schD_line21 !== 0
      ? scheduleD.schD.schD_line21
      : scheduleD.schD.schD_line16
    const eblData = form461({
      taxYear: year,
      isSingle: !isMarried,
      schedule1_line3: scheduleCNetIncome.total,
      schedule1_line5: scheduleE.grandTotal,
      scheduleDData: scheduleD.schD,
      override_f461_line15: null,
    })
    const form461Lines = {
      aggregateBusinessIncomeLoss: eblData.f461_line9,
      eblLimit: eblData.f461_line15, // form461() already computes the limit via ExcessBusinessLossLimitation()
      excessBusinessLoss: eblData.f461_line16,
      isTriggered: eblData.f461_line16 > 0,
      isMarried,
    }

    const medicareWageSources = reviewedW2Docs.map((doc) => {
      const p = doc.parsed_data as W2ParsedData | null
      const medicareWagesForSource = p?.box5_medicare_wages ?? p?.box1_wages ?? 0
      const label = p?.employer_name ?? doc.employment_entity?.display_name ?? doc.original_filename ?? 'W-2'
      return { label, wages: medicareWagesForSource }
    }).filter(s => s.wages > 0)

    const form8959 = computeForm8959Lines(medicareWages, isMarried, medicareWageSources)
    const form4797 = computeForm4797({
      partINet1231: form4797PartINet1231,
      partIIOrdinary: form4797PartIIOrdinary,
      partIIIRecapture: form4797PartIIIRecapture,
    })

    const scheduleFComputed = computeScheduleF({
      grossFarmIncome: scheduleFGrossIncome,
      totalExpenses: scheduleFTotalExpenses,
    })

    const scheduleSE = computeScheduleSE({
      reviewedK1Docs,
      scheduleCNetIncome: scheduleCNetIncome.total,
      selectedYear: year,
      isMarried,
      reviewedW2Docs,
      payslips,
      scheduleFNetProfit: scheduleFComputed.netProfitOrLoss,
    })

    const schedule1 = computeSchedule1Totals({
      scheduleCNetIncome: scheduleCNetIncome.total,
      scheduleEGrandTotal: scheduleE.grandTotal,
      schedule1Line8Breakdown,
      schedule1Line7Unemployment,
      schedule1Line1aTaxableRefunds,
      schedule1Line2aAlimony,
      schedule1Line4OtherGains: form4797.hasActivity ? form4797.netToSchedule1Line4 : null,
      schedule1Line6FarmIncome: scheduleFComputed.hasActivity ? scheduleFComputed.netProfitOrLoss : null,
      deductibleSeTaxAdjustment: scheduleSE.deductibleSeTax,
    })

    const totalIncomeEstimate = w2GrossIncome
      .add(scheduleB.interestTotal)
      .add(scheduleB.dividendTotal)
      .add(retirementDistributionSummary.ira.taxable)
      .add(retirementDistributionSummary.pension.taxable)
      .add(schedule1.partI.line10_total)
      .add(capitalGainOrLossToReturn).value
    const adjustedGrossIncomeEstimate = currency(totalIncomeEstimate)
      .subtract(schedule1.partII.line26_totalAdjustments).value

    // Approximation: Form 8960 MAGI is currently estimated as AGI only in this
    // pipeline; no §911 foreign earned income exclusion addback is applied here.
    const form8960EstimatedMagi = adjustedGrossIncomeEstimate

    const form8960 = computeForm8960Lines({
      taxableInterest: scheduleB.interestTotal,
      ordinaryDividends: scheduleB.dividendTotal,
      netCapGainsRaw: capitalGainOrLossToReturn,
      passiveIncome: scheduleE.totalPassive,
      investmentInterestExpense: form4952.deductibleInvestmentInterestExpense,
      magi: form8960EstimatedMagi,
      isMarried,
      interestSources: scheduleB.interestLines.map(l => ({ label: l.label, amount: l.amount })),
      dividendSources: scheduleB.dividendLines.map(l => ({ label: l.label, amount: l.amount })),
      passiveSources: scheduleE.partnerRows
        .filter(r => r.netPassive !== 0)
        .map(r => ({ label: r.partnerName, amount: r.netPassive })),
    })
    const form8995 = computeForm8995({
      reviewedK1Docs,
      totalIncome: totalIncomeEstimate,
      selectedYear: year,
      isMarried,
    })
    const deductionUsed = scheduleA.shouldItemize ? scheduleA.totalItemizedDeductions : scheduleA.standardDeduction
    const taxableIncomeEstimate = Math.max(
      0,
      currency(adjustedGrossIncomeEstimate)
        .subtract(deductionUsed)
        .subtract(form8995.estimatedDeduction).value,
    )
    const regularTaxEstimate = calculateTax(
      String(year),
      FEDERAL_TAX_STATE,
      currency(taxableIncomeEstimate),
      isMarried ? 'Married Filing Jointly' : 'Single',
    ).totalTax.value
    // Until AMT-specific Form 1116 limitation logic is implemented, mirror the
    // regular FTC amount on the AMT side so AMT still reflects foreign-tax-credit
    // interaction instead of assuming line 8 is always zero.
    const estimatedAmtForeignTaxCredit = form1116.totalForeignTaxes
    const form6251 = computeForm6251Lines({
      taxableIncome: taxableIncomeEstimate,
      year,
      isMarried,
      k1Data: reviewedK1Docs
        .map((doc) => {
          const data = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
          if (!data) {
            return null
          }

          const label = data.fields['B']?.value?.split('\n')[0]
            ?? doc.employment_entity?.display_name
            ?? doc.original_filename
            ?? 'Partnership'
          return { data, label }
        })
        .filter((entry): entry is { data: FK1StructuredData; label: string } => entry !== null),
      scheduleA,
      regularTax: regularTaxEstimate,
      regularForeignTaxCredit: form1116.totalForeignTaxes,
      amtForeignTaxCredit: estimatedAmtForeignTaxCredit,
    })
    const schedule2 = {
      altMinimumTax: form6251.amt,
      selfEmploymentTax: scheduleSE.seTax,
      additionalMedicareTax: currency(form8959.additionalTax).add(scheduleSE.additionalMedicareTax).value,
      niit: form8960.niitTax,
      totalAdditionalTaxes: currency(form6251.amt)
        .add(scheduleSE.seTax)
        .add(form8959.additionalTax)
        .add(scheduleSE.additionalMedicareTax)
        .add(form8960.niitTax).value,
    }

    // Form 8582 MAGI = AGI computed without the passive activity loss deduction,
    // plus specific addbacks (IRA deduction, student loan interest, half SE tax, etc.).
    // See Form 8582 Worksheet 1, lines 1–7.
    // For now we approximate with the same base AGI; this is a reasonable approximation
    // since most addbacks are small relative to the phase-out range ($100k–$150k).
    const form8582EstimatedMagi = adjustedGrossIncomeEstimate

    // Direct rental properties from Schedule E Part I would be passed here once the
    // codebase has a rental property tracker (user-entered per-property data).
    // Currently only K-1-based activities flow through Form 8582.
    // See TODO B.6 — scheduleERentals is ready to accept DirectRentalProperty[] entries.
    const form8582 = computeForm8582({
      reviewedK1Docs,
      magi: form8582EstimatedMagi,
      isMarried,
      palCarryforwards,
      realEstateProfessional,
    })

    const form8606 = computeForm8606({
      nondeductibleContributions: form8606NondeductibleContributions,
      priorYearBasis: form8606PriorYearBasis,
      yearEndFmv: form8606YearEndFmv,
      reviewed1099RDocs,
    })

    const estimatedTaxPayments = !isMarried && priorYearTax > 0
      ? computeEstimatedTaxPayments({
          selectedYear: year,
          priorYearTax,
          priorYearAgi,
          expectedWithholding: payrollFederalWithholding,
          isMarriedFilingSeparately: false,
        })
      : undefined

    return {
      year,
      ...(overviewSections.length > 0 ? { overviewSections } : {}),
      form1040: computeForm1040Lines({
        w2Income: w2GrossIncome,
        interestIncome: currency(scheduleB.interestTotal),
        dividendIncome: currency(scheduleB.dividendTotal),
        schedule1,
        capitalGainOrLoss: capitalGainOrLossToReturn,
        schedule2TotalAdditionalTaxes: schedule2.totalAdditionalTaxes,
        foreignTaxCredit: form1116.totalForeignTaxes,
        scheduleB,
        w2Documents: reviewedW2Docs,
        interestDocuments: reviewedIntDocs,
        dividendDocuments: reviewedDivDocs,
        retirementDocuments: reviewed1099RDocs,
      }),
      schedule1,
      scheduleA,
      scheduleB,
      scheduleC: scheduleCNetIncome,
      scheduleD: scheduleD.schD,
      scheduleE: {
        grandTotal: scheduleE.grandTotal,
        totalPassive: scheduleE.totalPassive,
        totalNonpassive: scheduleE.totalNonpassive,
      },
      scheduleSE,
      form4952,
      form1116,
      form6251,
      schedule2,
      form8959,
      form8960,
      form461: form461Lines,
      form8582,
      form8606,
      form4797,
      scheduleF: scheduleFComputed,
      capitalLossCarryover: computeCapitalLossCarryover(
        scheduleD.schD.schD_line7,
        scheduleD.schD.schD_line15,
      ),
      form8995,
      k1Docs: toTaxReturnYearK1Entries(reviewedK1Docs),
      k3Docs: reviewedK1Docs
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
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      docs1099: reviewed1099Docs.map((doc) => {
        const parsedData = (doc.parsed_data ?? {}) as Record<string, unknown>
        const payerName = (parsedData.payer_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? `Doc-${doc.id}`
        return {
          formType: doc.form_type,
          payerName,
          parsedData,
        }
      }),
      ...(shortDividendSummary ? { shortDividends: shortDividendSummary } : {}),
      // Marriage settings only distinguish married vs single today, not MFJ vs MFS.
      // TODO: plumb a dedicated MFS setting through tax preview once that path exists.
      ...(estimatedTaxPayments ? { estimatedTaxPayments } : {}),
    }
  }, [
    year,
    reviewed1099Docs,
    reviewedK1Docs,
    reviewedW2Docs,
    foreignTaxSummaries,
    income1099,
    scheduleCNetIncome,
    w2GrossIncome,
    payslips,
    shortDividendSummary,
    isMarried,
    schedule1Line8Breakdown,
    schedule1Line7Unemployment,
    schedule1Line1aTaxableRefunds,
    schedule1Line2aAlimony,
    reviewed1099RDocs,
    userDeductions,
    palCarryforwards,
    realEstateProfessional,
    priorYearAgi,
    priorYearTax,
    form8606NondeductibleContributions,
    form8606PriorYearBasis,
    form8606YearEndFmv,
    form4797PartINet1231,
    form4797PartIIOrdinary,
    form4797PartIIIRecapture,
    scheduleFGrossIncome,
    scheduleFTotalExpenses,
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
    reviewed1099RDocs,
    foreignTaxSummaries,
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
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
    reviewed1099RDocs,
    foreignTaxSummaries,
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
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
