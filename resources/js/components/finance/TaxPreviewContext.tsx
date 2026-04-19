'use client'

import currency from 'currency.js'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { computeForm1040Lines } from '@/components/finance/Form1040Preview'
import { computeForm1116Lines } from '@/components/finance/Form1116Preview'
import { computeForm4952Lines } from '@/components/finance/Form4952Preview'
import { computeForm8995 } from '@/components/finance/Form8995Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import { computeScheduleALines } from '@/components/finance/ScheduleAPreview'
import { computeScheduleB } from '@/components/finance/ScheduleBPreview'
import { computeScheduleCNetIncome } from '@/components/finance/ScheduleCPreview'
import { computeScheduleD } from '@/components/finance/ScheduleDPreview'
import { computeScheduleELines } from '@/components/finance/ScheduleEPreview'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { computeForm8959Lines } from '@/finance/8959/form8959'
import { computeForm8960Lines } from '@/finance/8960/form8960'
import { computeCapitalLossCarryover } from '@/finance/capitalLoss/capitalLossCarryover'
import { analyzeShortDividends, type ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import { ExcessBusinessLossLimitation } from '@/lib/tax/ExcessBusinessLossLimitation'
import { form461 } from '@/lib/tax/form461'
import { buildCacheKey, getCachedTransactions, setCachedTransactions } from '@/services/transactionCache'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { EmploymentEntity, F1099DivParsedData, F1099IntParsedData, TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'
import type { OverviewRow, TaxReturn1040 } from '@/types/finance/tax-return'

import type { ScheduleCResponse, YearData } from './ScheduleCPreview'

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
  /** Whether the user is married for the selected tax year (from marriage status settings). */
  isMarried: boolean
  /** Aggregated short dividend summary across all active accounts, or null if not yet loaded. */
  shortDividendSummary: ShortDividendSummary | null
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
          items.map(item => ({ code: item.code, value: item.value })),
        ]),
      )

      return {
        entityName,
        ...(ein ? { ein } : {}),
        fields,
        codes,
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
          // Carry forward the most recent prior year's status
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

  const income1099 = useMemo(() => {
    let interestIncome = currency(0)
    let dividendIncome = currency(0)
    let qualifiedDividends = currency(0)

    for (const doc of reviewed1099Docs) {
      if (!doc.parsed_data) continue
      if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
        interestIncome = interestIncome.add((doc.parsed_data as F1099IntParsedData).box1_interest ?? 0)
      }
      if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
        dividendIncome = dividendIncome.add((doc.parsed_data as F1099DivParsedData).box1a_ordinary ?? 0)
        qualifiedDividends = qualifiedDividends.add((doc.parsed_data as F1099DivParsedData).box1b_qualified ?? 0)
      }
    }

    return { interestIncome, dividendIncome, qualifiedDividends }
  }, [reviewed1099Docs])

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

    // ── Overview sheet data ───────────────────────────────────────────────────
    function parseK1FieldLocal(data: FK1StructuredData, box: string): number {
      const v = data.fields[box]?.value
      if (!v) return 0
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }

    function parseK1CodesLocal(data: FK1StructuredData, box: string): number {
      const items = data.codes[box] ?? []
      return items.reduce((acc, item) => {
        const n = parseFloat(item.value)
        return isNaN(n) ? acc : acc.add(n)
      }, currency(0)).value
    }

    function k1NetIncomeLocal(data: FK1StructuredData): number {
      const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6b', '6c', '7', '8', '9a', '9b', '9c', '10']
      const incomeTotal = INCOME_BOXES.reduce((acc, box) => acc.add(parseK1FieldLocal(data, box)), currency(0))
        .add(parseK1CodesLocal(data, '11'))
      const box12 = parseK1FieldLocal(data, '12')
      const box21 = parseK1FieldLocal(data, '21')
      return incomeTotal
        .add(box12 !== 0 ? -Math.abs(box12) : 0)
        .add(parseK1CodesLocal(data, '13'))
        .add(box21 !== 0 ? -Math.abs(box21) : 0).value
    }

    const k1Parsed = reviewedK1Docs
      .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
      .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

    const k1Interest = k1Parsed.reduce((acc, { data }) => acc.add(parseK1FieldLocal(data, '5')), currency(0)).value
    const k1OrdinaryDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1FieldLocal(data, '6a')), currency(0)).value
    const k1StCapital = k1Parsed.reduce((acc, { data }) => acc.add(parseK1FieldLocal(data, '8')), currency(0)).value
    const k1LtCapital = k1Parsed.reduce((acc, { data }) => acc
      .add(parseK1FieldLocal(data, '9a'))
      .add(parseK1FieldLocal(data, '9b'))
      .add(parseK1FieldLocal(data, '9c'))
      .add(parseK1FieldLocal(data, '10')), currency(0)).value
    const k1ForeignTax = k1Parsed.reduce((acc, { data }) => acc.add(parseK1FieldLocal(data, '21')), currency(0)).value
    const k1InvInterest = k1Parsed.reduce((acc, { data }) => {
      const items = data.codes['13'] ?? []
      return acc.add(items.filter((i) => i.code === 'G' || i.code === 'H')
        .reduce((s, i) => { const n = parseFloat(i.value); return isNaN(n) ? s : s.add(n) }, currency(0)))
    }, currency(0)).value

    const div1099ForeignTax = reviewed1099Docs
      .filter((d) => d.form_type === '1099_div' || d.form_type === '1099_div_c')
      .reduce((acc, d) => {
        const p = d.parsed_data as Record<string, unknown>
        const n = typeof p?.box7_foreign_tax === 'number' ? p.box7_foreign_tax : typeof p?.box7_foreign_tax === 'string' ? parseFloat(p.box7_foreign_tax as string) : 0
        return isNaN(n) ? acc : acc.add(n)
      }, currency(0)).value

    const totalInterest = income1099.interestIncome.add(k1Interest).value
    const totalOrdinaryDiv = income1099.dividendIncome.add(k1OrdinaryDiv).value
    const totalInvestmentIncome = currency(totalInterest).add(totalOrdinaryDiv).value
    const totalForeignTax = currency(k1ForeignTax).add(div1099ForeignTax).value
    const totalCapitalGains = currency(k1StCapital).add(k1LtCapital).value

    const yearStr = String(year)
    const yearPayslips = payslips.filter((r) => r.pay_date && r.pay_date > `${yearStr}-01-01` && r.pay_date < `${String(year + 1)}-01-01`)
    const fedWH = yearPayslips.reduce((acc, r) => acc.add(r.ps_fed_tax ?? 0).add(r.ps_fed_tax_addl ?? 0).subtract(r.ps_fed_tax_refunded ?? 0), currency(0)).value
    const addlMedicare = currency(Math.max(0, w2GrossIncome.value - 200000)).multiply(0.009).value

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
      const net = k1NetIncomeLocal(data)
      const interest = parseK1FieldLocal(data, '5')
      const foreignTax = parseK1FieldLocal(data, '21')
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
      const foreignTax = isBroker ? (p?.div_7_foreign_tax_paid as number | undefined) : ((p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined)
      const capGainLoss = isBroker ? (p?.b_total_gain_loss as number | undefined) : undefined
      const label = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
      const noteParts = [
        interest != null && interest !== 0 ? `Interest: ${currency(interest).format()}` : null,
        ordDiv != null && ordDiv !== 0 ? `Ord div: ${currency(ordDiv).format()}` : null,
        capGainLoss != null && capGainLoss !== 0 ? `Cap G/L: ${currency(capGainLoss).format()}` : null,
        foreignTax != null && foreignTax !== 0 ? `Foreign tax: ${currency(foreignTax, { precision: 2 }).format()}` : null,
      ].filter(Boolean)
      const primaryAmount = (interest ?? 0) + (ordDiv ?? 0)
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
    if (k1InvInterest !== 0) taxPositionRows.push({ item: 'Investment interest deduction (Form 4952)', amount: k1InvInterest, note: 'From K-1 Box 13G/H — flows to Schedule E' })
    if (totalForeignTax !== 0) taxPositionRows.push({ item: 'Foreign tax credit (Form 1116)', amount: totalForeignTax, note: 'Dollar-for-dollar vs. income tax' })
    if (fedWH > 0) taxPositionRows.push({ item: 'Federal withholding (W-2 Box 2)', amount: fedWH, note: 'Already paid — compare to final liability' })
    if (w2GrossIncome.value > 200000) taxPositionRows.push({ item: 'Additional Medicare Tax (Form 8959)', amount: -addlMedicare, note: '0.9% on wages over $200K threshold' })

    const overviewSections = [
      ...(docRows.length > 0 ? [{ heading: 'Tax Documents', rows: docRows }] : []),
      ...(taxPositionRows.length > 0 ? [{ heading: 'Estimated Tax Positions', rows: taxPositionRows }] : []),
    ]
    const scheduleB = computeScheduleB(reviewedK1Docs, reviewed1099Docs, income1099)
    const scheduleD = computeScheduleD(reviewedK1Docs, reviewed1099Docs)
    const scheduleE = computeScheduleELines(reviewedK1Docs)
    const saltPaid = reviewedW2Docs.reduce((acc, doc) => {
      const p = doc.parsed_data as { box17_state_tax?: number | null } | null
      return acc + (p?.box17_state_tax ?? 0)
    }, 0)
    const scheduleA = computeScheduleALines({
      reviewedK1Docs,
      reviewed1099Docs,
      ...(shortDividendSummary ? { shortDividendSummary } : {}),
      saltPaid,
      year,
      isMarried,
    })
    const form4952 = computeForm4952Lines({
      reviewedK1Docs,
      reviewed1099Docs,
      income1099,
      shortDividendDeduction: shortDividendSummary?.totalItemizedDeduction ?? 0,
    })

    const eblData = form461({
      taxYear: year,
      isSingle: !isMarried,
      schedule1_line3: scheduleCNetIncome.total,
      schedule1_line5: scheduleE.grandTotal,
      scheduleDData: scheduleD.schD,
      override_f461_line15: null,
    })
    const eblLimit = ExcessBusinessLossLimitation({ taxYear: year, isSingle: !isMarried })
    const form461Lines = {
      aggregateBusinessIncomeLoss: eblData.f461_line9,
      eblLimit,
      excessBusinessLoss: eblData.f461_line16,
      isTriggered: eblData.f461_line16 > 0,
    }

    const form8959 = computeForm8959Lines(w2GrossIncome.value, isMarried)
    const form8960 = computeForm8960Lines({
      taxableInterest: income1099.interestIncome.value,
      ordinaryDividends: income1099.dividendIncome.value,
      netCapGainsRaw: scheduleD.schD.schD_line16,
      passiveIncome: scheduleE.totalPassive,
      investmentInterestExpense: form4952.deductibleInvestmentInterestExpense,
      magi: w2GrossIncome
        .add(income1099.interestIncome)
        .add(income1099.dividendIncome)
        .add(scheduleCNetIncome.total)
        .add(scheduleE.grandTotal)
        .add(Math.max(scheduleD.schD.schD_line16, -3000)).value,
      isMarried,
    })
    const schedule2 = {
      altMinimumTax: 0,
      additionalMedicareTax: form8959.additionalTax,
      niit: form8960.niitTax,
      totalAdditionalTaxes: currency(form8959.additionalTax).add(form8960.niitTax).value,
    }

    return {
      year,
      ...(overviewSections.length > 0 ? { overviewSections } : {}),
      form1040: computeForm1040Lines({
        w2Income: w2GrossIncome,
        interestIncome: income1099.interestIncome,
        dividendIncome: income1099.dividendIncome,
        scheduleCIncome: scheduleCNetIncome.total,
        w2Documents: reviewedW2Docs,
        interestDocuments: reviewedIntDocs,
        dividendDocuments: reviewedDivDocs,
      }),
      scheduleA,
      scheduleB,
      scheduleC: scheduleCNetIncome,
      scheduleD: scheduleD.schD,
      scheduleE: {
        grandTotal: scheduleE.grandTotal,
        totalPassive: scheduleE.totalPassive,
        totalNonpassive: scheduleE.totalNonpassive,
      },
      form4952,
      form1116: computeForm1116Lines({ reviewedK1Docs, reviewed1099Docs }),
      schedule2,
      form8959,
      form8960,
      form461: form461Lines,
      capitalLossCarryover: computeCapitalLossCarryover(
        scheduleD.schD.schD_line7,
        scheduleD.schD.schD_line15,
      ),
      form8995: computeForm8995({
        reviewedK1Docs,
        totalIncome: w2GrossIncome
          .add(income1099.interestIncome)
          .add(income1099.dividendIncome)
          .add(scheduleCNetIncome.total)
          .add(scheduleE.grandTotal)
          .add(Math.max(scheduleD.schD.schD_line16, -3000)).value,
        selectedYear: year,
        isMarried,
      }),
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
    }
  }, [
    year,
    reviewed1099Docs,
    reviewedK1Docs,
    reviewedW2Docs,
    income1099,
    scheduleCNetIncome,
    w2GrossIncome,
    payslips,
    shortDividendSummary,
    isMarried,
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
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
    income1099,
    isMarried,
    shortDividendSummary,
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
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
    income1099,
    isMarried,
    shortDividendSummary,
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
