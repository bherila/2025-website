'use client'

import currency from 'currency.js'
import { ClipboardList } from 'lucide-react'
import { useCallback, useState } from 'react'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import AdditionalTaxesPreview from '@/components/finance/AdditionalTaxesPreview'
import EstimatedTaxPaymentsSection from '@/components/finance/EstimatedTaxPaymentsSection'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import Form8582Preview from '@/components/finance/Form8582Preview'
import Form8995Preview from '@/components/finance/Form8995Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import PayslipDataSourceModal from '@/components/finance/PayslipDataSourceModal'
import ScheduleAPreview from '@/components/finance/ScheduleAPreview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleCTab from '@/components/finance/ScheduleCTab'
import ScheduleDPreview from '@/components/finance/ScheduleDPreview'
import ScheduleEPreview from '@/components/finance/ScheduleEPreview'
import StateSelectorSection from '@/components/finance/StateSelectorSection'
import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocuments1099Section from '@/components/finance/TaxDocuments1099Section'
import TaxDocumentsSection from '@/components/finance/TaxDocumentsSection'
import UserDeductionsSection from '@/components/finance/UserDeductionsSection'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'
import { buildTaxWorkbook } from '@/lib/finance/buildTaxWorkbook'
import { getK1sWithAMTItems, getK1sWithPassiveLosses, getK1sWithSEItems, parseK1Field } from '@/lib/finance/k1Utils'
import { type FilingStatus, getStandardDeduction } from '@/lib/tax/standardDeductions'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import { Callout } from './tax-preview-primitives'
import { TAX_TABS } from './tax-tab-ids'
import { TaxPreviewProvider, type TaxPreviewShellData, useTaxPreview } from './TaxPreviewContext'
import { YearSelectorWithNav } from './YearSelectorWithNav'

// ── Preload interface ─────────────────────────────────────────────────────────

/** Data preloaded server-side in the Blade template <script> tag. */
export type TaxPreviewPreload = TaxPreviewShellData

// ── Income Overview helpers ───────────────────────────────────────────────────

function fmtOverview(n: number, precision = 0): string {
  const abs = currency(Math.abs(n), { precision }).format()
  return n < 0 ? `(${abs})` : abs
}

/** Card for the income overview grid. */
function OverviewCard({
  label,
  value,
  sub,
}: {
  label: string
  value: number | null
  sub?: string | undefined
}) {
  const cls =
    value === null ? 'text-foreground' : value < 0 ? 'text-destructive' : value > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-foreground'
  return (
    <div className="rounded-lg border bg-card p-3 space-y-0.5">
      <div className="text-xs text-muted-foreground font-medium leading-tight">{label}</div>
      <div className={`text-xl font-bold font-mono tabular-nums ${cls}`}>
        {value === null ? '—' : fmtOverview(value)}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground leading-tight">{sub}</div>}
    </div>
  )
}

interface TaxIncomeOverviewProps {
  taxYear: number
  payslips: fin_payslip[]
  w2GrossIncome: currency
  income1099: { interestIncome: currency; dividendIncome: currency; qualifiedDividends: currency }
  reviewedW2Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  reviewedK1Docs: TaxDocument[]
}

function TaxIncomeOverview({
  taxYear,
  payslips,
  w2GrossIncome,
  income1099,
  reviewedW2Docs,
  reviewed1099Docs,
  reviewedK1Docs,
}: TaxIncomeOverviewProps) {
  // Aggregate K-1 data
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const k1Interest = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '5')), currency(0)).value
  const k1OrdinaryDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6a')), currency(0)).value
  const k1QualifiedDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6b')), currency(0)).value
  const k1StCapital = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '8')), currency(0)).value
  const k1LtCapital = k1Parsed.reduce((acc, { data }) => acc
    .add(parseK1Field(data, '9a'))
    .add(parseK1Field(data, '9b'))
    .add(parseK1Field(data, '9c'))
    .add(parseK1Field(data, '10')), currency(0)).value
  const k1ForeignTax = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '21')), currency(0)).value
  const k1InvInterest = k1Parsed.reduce((acc, { data }) => {
    const items = data.codes['13'] ?? []

    const itemTotal = items
      .filter((item) => item.code === 'G' || item.code === 'H')
      .reduce((sum, item) => {
        const n = parseFloat(item.value)
        return isNaN(n) ? sum : sum.add(n)
      }, currency(0))

    return acc.add(itemTotal)
  }, currency(0)).value

  // 1099-DIV foreign tax (box 7)
  const div1099ForeignTax = reviewed1099Docs
    .filter((d) => d.form_type === '1099_div' || d.form_type === '1099_div_c')
    .reduce((acc, d) => {
      const parsed = d.parsed_data as Record<string, unknown>
      const value = parsed?.box7_foreign_tax
      const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0
      return isNaN(n) ? acc : acc.add(n)
    }, currency(0)).value

  const totalInterest = income1099.interestIncome.add(k1Interest).value
  const totalOrdinaryDiv = income1099.dividendIncome.add(k1OrdinaryDiv).value
  const totalQualifiedDiv = income1099.qualifiedDividends.add(k1QualifiedDiv).value
  const totalForeignTax = currency(k1ForeignTax).add(div1099ForeignTax).value
  const totalInvestmentIncome = currency(totalInterest).add(totalOrdinaryDiv).value
  const totalCapitalGains = currency(k1StCapital).add(k1LtCapital).value

  const fedWH = payslips.reduce((acc, row) => acc
    .add(row.ps_fed_tax ?? 0)
    .add(row.ps_fed_tax_addl ?? 0)
    .subtract(row.ps_fed_tax_refunded ?? 0), currency(0)).value
  const addlMedicare = currency(Math.max(0, w2GrossIncome.value - 200_000)).multiply(0.009).value

  const hasData = reviewedW2Docs.length + reviewed1099Docs.length + reviewedK1Docs.length > 0

  if (!hasData) return null

  return (
    <div className="space-y-6">
      {/* Card grid */}
      <div>
        <h2 className="text-base font-semibold mb-3">Income &amp; Document Overview — {taxYear}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {w2GrossIncome.value > 0 && (
            <OverviewCard
              label="W-2 Wages (Box 1)"
              value={w2GrossIncome.value}
              sub={reviewedW2Docs[0] ? (reviewedW2Docs[0].parsed_data as Record<string, unknown>)?.employer_name as string | undefined : undefined}
            />
          )}
          {totalInterest !== 0 && (
            <OverviewCard
              label="Total Interest Income"
              value={totalInterest}
              sub={[k1Interest ? `K-1s ${fmtOverview(k1Interest)}` : null, income1099.interestIncome.value ? `1099 ${income1099.interestIncome.format()}` : null].filter(Boolean).join(' · ') || undefined}
            />
          )}
          {totalOrdinaryDiv !== 0 && (
            <OverviewCard
              label="Total Ordinary Dividends"
              value={totalOrdinaryDiv}
              sub={[k1OrdinaryDiv ? `K-1s ${fmtOverview(k1OrdinaryDiv)}` : null, income1099.dividendIncome.value ? `1099 ${income1099.dividendIncome.format()}` : null].filter(Boolean).join(' · ') || undefined}
            />
          )}
          {totalQualifiedDiv !== 0 && (
            <OverviewCard label="Total Qualified Dividends" value={totalQualifiedDiv} sub="Subset of ordinary dividends" />
          )}
          {k1StCapital !== 0 && (
            <OverviewCard label="Net S/T Capital G/(L) — K-1s" value={k1StCapital} sub="From K-1 Box 8" />
          )}
          {k1LtCapital !== 0 && (
            <OverviewCard label="Net L/T Capital G/(L) — K-1s" value={k1LtCapital} sub="From K-1 Boxes 9a/9b/9c/10" />
          )}
          {totalForeignTax !== 0 && (
            <OverviewCard
              label="Total Foreign Taxes"
              value={totalForeignTax}
              sub={[k1ForeignTax ? `K-1 box 21 ${fmtOverview(k1ForeignTax)}` : null, div1099ForeignTax ? `1099-DIV ${fmtOverview(div1099ForeignTax)}` : null].filter(Boolean).join(' · ') || undefined}
            />
          )}
          {k1InvInterest !== 0 && (
            <OverviewCard label="Investment Interest Exp." value={k1InvInterest} sub="K-1 Box 13G/H" />
          )}
        </div>
      </div>

      {/* Estimated Tax Positions — aggregate income and withholding summary */}
      {(w2GrossIncome.value > 0 || totalInvestmentIncome !== 0 || k1StCapital !== 0 || k1LtCapital !== 0 || k1InvInterest !== 0 || totalForeignTax !== 0 || fedWH > 0) && (
        <div>
          <h2 className="text-base font-semibold mb-3">Estimated Tax Positions</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table className="text-sm">
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead className="text-xs">Line Item</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {w2GrossIncome.value > 0 && (
                  <TableRow>
                    <TableCell className="py-2">W-2 Wages</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className="text-emerald-600 dark:text-emerald-500">{w2GrossIncome.format()}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">Box 1 — includes RSU vesting and bonuses</TableCell>
                  </TableRow>
                )}
                {totalInvestmentIncome !== 0 && (
                  <TableRow>
                    <TableCell className="py-2">Net investment income (interest + divs)</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className="text-emerald-600 dark:text-emerald-500">{fmtOverview(totalInvestmentIncome)}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">Before deductions; subject to NIIT (3.8%)</TableCell>
                  </TableRow>
                )}
                {(k1StCapital !== 0 || k1LtCapital !== 0) && (
                  <TableRow>
                    <TableCell className="py-2">Net capital gain (loss) — K-1s</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className={totalCapitalGains < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}>{fmtOverview(totalCapitalGains)}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">S/T {fmtOverview(k1StCapital)} · L/T {fmtOverview(k1LtCapital)}</TableCell>
                  </TableRow>
                )}
                {k1InvInterest !== 0 && (
                  <TableRow>
                    <TableCell className="py-2">Investment interest deduction (Form 4952)</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className={k1InvInterest < 0 ? 'text-destructive' : ''}>{fmtOverview(k1InvInterest)}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">From K-1 Box 13G/H — flows to Schedule E</TableCell>
                  </TableRow>
                )}
                {totalForeignTax !== 0 && (
                  <TableRow>
                    <TableCell className="py-2">Foreign tax credit (Form 1116)</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className="text-emerald-600 dark:text-emerald-500">{fmtOverview(totalForeignTax)} credit</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">Dollar-for-dollar vs. income tax</TableCell>
                  </TableRow>
                )}
                {fedWH > 0 && (
                  <TableRow>
                    <TableCell className="py-2">Federal withholding (W-2 Box 2)</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div>{fmtOverview(fedWH)}</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">Already paid — compare to final liability</TableCell>
                  </TableRow>
                )}
                {w2GrossIncome.value > 200000 && (
                  <TableRow>
                    <TableCell className="py-2">Additional Medicare Tax (Form 8959)</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">
                      <div className="text-destructive">({fmtOverview(addlMedicare)})</div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">0.9% on wages over $200K threshold</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

/** W-2 income summary table derived from payslips. */
function W2IncomeSummary({ payslips }: { payslips: fin_payslip[] }) {
  const [dataSourceRow, setDataSourceRow] = useState<{
    label: string
    getter: (p: fin_payslip) => currency
  } | null>(null)

  if (payslips.length === 0) return null

  const sum = (fn: (row: fin_payslip) => currency) =>
    payslips.reduce((acc, row) => acc.add(fn(row)), currency(0))

  const wagesGetter = (r: fin_payslip) => currency(r.ps_salary ?? 0)
  const bonusGetter = (r: fin_payslip) => currency(r.earnings_bonus ?? 0)
  const rsuGetter = (r: fin_payslip) => currency(r.earnings_rsu ?? 0)
  const vacationGetter = (r: fin_payslip) => currency(r.ps_vacation_payout ?? 0)
  const imputedGetter = (r: fin_payslip) =>
    currency(r.imp_ltd ?? 0)
      .add(r.imp_legal ?? 0)
      .add(r.imp_fitness ?? 0)
      .add(r.imp_other ?? 0)
  // Pre-tax deductions reduce W-2 Box 1 wages (401k pre-tax, medical, dental, vision, FSA)
  const pretaxDeductionsGetter = (r: fin_payslip) =>
    currency(r.ps_401k_pretax ?? 0)
      .add(r.ps_pretax_medical ?? 0)
      .add(r.ps_pretax_dental ?? 0)
      .add(r.ps_pretax_vision ?? 0)
      .add(r.ps_pretax_fsa ?? 0)
  const fedWHGetter = (r: fin_payslip) =>
    currency(r.ps_fed_tax ?? 0)
      .add(r.ps_fed_tax_addl ?? 0)
      .subtract(r.ps_fed_tax_refunded ?? 0)
  const stateWHGetter = (r: fin_payslip) =>
    currency((r.state_data?.[0]?.state_tax as number) ?? 0).add((r.state_data?.[0]?.state_tax_addl as number) ?? 0)
  const oasdiGetter = (r: fin_payslip) => currency(r.ps_oasdi ?? 0)
  const medicareGetter = (r: fin_payslip) => currency(r.ps_medicare ?? 0)
  const sdiGetter = (r: fin_payslip) => currency((r.state_data?.[0]?.state_disability as number) ?? 0)

  const wages = sum(wagesGetter)
  const bonus = sum(bonusGetter)
  const rsu = sum(rsuGetter)
  const vacationPayout = sum(vacationGetter)
  const imputed = sum(imputedGetter)
  const pretaxDeductions = sum(pretaxDeductionsGetter)
  // W-2 Box 1 wages = salary + bonus + RSU + vacation + imputed income - pre-tax deductions
  const gross = wages.add(bonus).add(rsu).add(vacationPayout).add(imputed).subtract(pretaxDeductions)

  const fedWH = sum(fedWHGetter)
  const stateWH = sum(stateWHGetter)
  const oasdi = sum(oasdiGetter)
  const medicare = sum(medicareGetter)
  const sdi = sum(sdiGetter)

  const grossGetter = (r: fin_payslip) =>
    wagesGetter(r)
      .add(bonusGetter(r))
      .add(rsuGetter(r))
      .add(vacationGetter(r))
      .add(imputedGetter(r))
      .subtract(pretaxDeductionsGetter(r))

  const rows = [
    { label: 'Wages / Salary', value: wages, getter: wagesGetter },
    bonus.value > 0 ? { label: 'Bonus', value: bonus, getter: bonusGetter } : null,
    rsu.value > 0 ? { label: 'RSU Vesting', value: rsu, getter: rsuGetter } : null,
    vacationPayout.value > 0 ? { label: 'Vacation Payout', value: vacationPayout, getter: vacationGetter } : null,
    imputed.value > 0 ? { label: 'Imputed Income (benefits)', value: imputed, getter: imputedGetter } : null,
    pretaxDeductions.value > 0 ? { label: 'Pre-tax Deductions (401k, benefits)', value: pretaxDeductions.multiply(-1), getter: (r: fin_payslip) => pretaxDeductionsGetter(r).multiply(-1) } : null,
    { label: 'Total Gross W-2 Income (Box 1)', value: gross, bold: true, getter: grossGetter },
    { label: '', value: null, getter: null },
    { label: 'Federal Income Tax Withheld', value: fedWH, getter: fedWHGetter },
    { label: 'State Income Tax Withheld', value: stateWH, getter: stateWHGetter },
    { label: 'OASDI / Social Security Tax', value: oasdi, getter: oasdiGetter },
    { label: 'Medicare Tax', value: medicare, getter: medicareGetter },
    sdi.value > 0 ? { label: 'State Disability Insurance (SDI)', value: sdi, getter: sdiGetter } : null,
  ].filter(Boolean) as { label: string; value: currency | null; bold?: boolean; getter: ((p: fin_payslip) => currency) | null }[]

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold mb-2">W-2 Income Summary</h2>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) =>
                row.label === '' ? (
                  <TableRow key={i} className="border-t-2">
                    <TableCell colSpan={2} className="py-0 h-px bg-muted/30" />
                  </TableRow>
                ) : (
                  <TableRow key={i} className={row.bold ? 'font-semibold bg-muted/30' : ''}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {row.value !== null && row.getter ? (
                        <button
                          type="button"
                          className="underline decoration-dotted cursor-pointer hover:text-primary"
                          onClick={() => setDataSourceRow({ label: row.label, getter: row.getter! })}
                          title="View data sources"
                        >
                          {row.value.format()}
                        </button>
                      ) : row.value !== null ? (
                        row.value.format()
                      ) : ''}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {dataSourceRow && (
        <PayslipDataSourceModal
          open
          label={dataSourceRow.label}
          payslips={payslips}
          valueGetter={dataSourceRow.getter}
          onClose={() => setDataSourceRow(null)}
        />
      )}
    </>
  )
}

/**
 * Tax Preview page — comprehensive tax analysis and planning view.
 * Mutable tax-form data lives in TaxPreviewContext and is fetched from
 * /api/finance/tax-preview-data. Blade only preloads lightweight shell data.
 */
function TaxPreviewPageContent() {
  const {
    year: selectedYear,
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
    refreshAll,
  } = useTaxPreview()

  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewModalDoc, setReviewModalDoc] = useState<TaxDocument | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<string>(TAX_TABS.overview)
  const [isExporting, setIsExporting] = useState(false)
  const [showAmtWarning, setShowAmtWarning] = useState(true)
  const [showSeWarning, setShowSeWarning] = useState(true)
  const [showPassiveLossWarning, setShowPassiveLossWarning] = useState(true)

  const handleYearChange = useCallback((year: number | 'all') => {
    if (typeof year !== 'number') return

    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    if (year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    window.location.href = url.toString()
  }, [])

  const handleExportXlsx = useCallback(async () => {
    setIsExporting(true)
    try {
      const workbook = buildTaxWorkbook(taxReturn)
      const response = await fetchWrapper.postRaw('/api/finance/tax-preview/export-xlsx', workbook)
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? workbook.filename
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export tax preview workbook', error)
    } finally {
      setIsExporting(false)
    }
  }, [taxReturn])

  const handleReviewK1Now = useCallback((docId: number) => {
    const targetDoc = accountDocuments.find((doc) => doc.id === docId)
    if (!targetDoc) {
      return
    }
    setReviewModalDoc(targetDoc)
    setReviewModalOpen(true)
  }, [accountDocuments])

  const handleOpenK1Review = useCallback(() => {
    setReviewModalDoc(undefined)
    setReviewModalOpen(true)
  }, [])

  const handleBulkSetSbpElection = useCallback(async (active: boolean, docIds: number[]) => {
    const failures: string[] = []

    for (const docId of docIds) {
      const targetDoc = accountDocuments.find((doc) => doc.id === docId)
      if (!targetDoc || !isFK1StructuredData(targetDoc.parsed_data)) {
        continue
      }

      try {
        await fetchWrapper.put(`/api/finance/tax-documents/${docId}`, {
          parsed_data: {
            ...targetDoc.parsed_data,
            k3Elections: {
              ...targetDoc.parsed_data.k3Elections,
              sourcedByPartnerAsUSSource: active,
            },
          },
        })
      } catch {
        failures.push(targetDoc.parsed_data.fields['B']?.value?.split('\n')[0] ?? targetDoc.employment_entity?.display_name ?? `K-1 #${docId}`)
      }
    }

    await refreshAll()
    return failures
  }, [accountDocuments, refreshAll])

  const year = selectedYear
  const { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 } = (() => {
    const start = `${year}-01-01`
    const end = `${year + 1}-01-01`
    const q1end = `${year}-04-01`
    const q2end = `${year}-07-01`
    const q3end = `${year}-10-01`
    const data: fin_payslip[] = []
    const dataThroughQ1: fin_payslip[] = []
    const dataThroughQ2: fin_payslip[] = []
    const dataThroughQ3: fin_payslip[] = []

    for (const row of payslips) {
      const payDate = row.pay_date
      if (!payDate || payDate <= start || payDate >= end) continue
      data.push(row)
      if (payDate < q1end) dataThroughQ1.push(row)
      if (payDate < q2end) dataThroughQ2.push(row)
      if (payDate < q3end) dataThroughQ3.push(row)
    }

    return { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 }
  })()

  const dataSeries = [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][]

  const scheduleCIncomeBySeries = {
    Q1: scheduleCNetIncome.byQuarter.q1,
    Q2: scheduleCNetIncome.byQuarter.q2,
    Q3: scheduleCNetIncome.byQuarter.q3,
    'Q4 (Full Year)': scheduleCNetIncome.byQuarter.q4,
  }

  const showTaxTables = !isLoading && data.length > 0

  // W-2 Box 1 wages = salary + bonus + RSU + vacation + imputed income - pre-tax deductions
  const w2GrossIncome = data.reduce((acc, row) => acc
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
    .subtract(row.ps_pretax_fsa ?? 0), currency(0))

  const w2SaltPaid = reviewedW2Docs.reduce((acc, doc) => {
    const parsed = doc.parsed_data as { box17_state_tax?: number | null } | null
    return currency(acc).add(parsed?.box17_state_tax ?? 0).value
  }, 0)

  // MFJ/MFS split isn't captured yet — treat isMarried as MFJ. TODO: add a toggle
  // to the marriage-status settings once MFS becomes a supported path (MFS has a
  // $5k SALT cap and roughly half-MFJ bracket thresholds).
  const filingStatus: FilingStatus = isMarried ? 'Married Filing Jointly' : 'Single'

  // ── Incomplete-computation signals (issue #274) ─────────────────────────────
  const k1ParsedData = reviewedK1Docs
    .map((d) => isFK1StructuredData(d.parsed_data) ? d.parsed_data : null)
    .filter((d): d is FK1StructuredData => d !== null)
  const k1sWithAMT = getK1sWithAMTItems(k1ParsedData)
  const k1sWithSE = getK1sWithSEItems(k1ParsedData)
  const k1sWithPassiveLosses = getK1sWithPassiveLosses(k1ParsedData)

  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        {pendingReviewCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setReviewModalDoc(undefined)
              setReviewModalOpen(true)
            }}
          >
            <ClipboardList className="h-4 w-4" />
            Review Documents
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
              {pendingReviewCount}
            </Badge>
          </Button>
        )}
        <div className="ml-auto">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportXlsx} disabled={isExporting}>
              {isExporting ? 'Generating…' : 'Export XLSX'}
            </Button>
            <YearSelectorWithNav
              selectedYear={selectedYear}
              availableYears={availableYears}
              isLoading={isLoading && availableYears.length === 0}
              onYearChange={handleYearChange}
              includeAll={false}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 pb-2 text-sm text-destructive">{error}</div>
      )}

      <TaxDocumentReviewModal
        open={reviewModalOpen}
        taxYear={selectedYear}
        {...(reviewModalDoc ? { document: reviewModalDoc } : {})}
        onClose={() => {
          setReviewModalDoc(undefined)
          setReviewModalOpen(false)
        }}
        onDocumentReviewed={() => {
          setReviewModalDoc(undefined)
          setReviewModalOpen(false)
          void refreshAll()
        }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pb-8">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value={TAX_TABS.overview}>Overview</TabsTrigger>
          <TabsTrigger value={TAX_TABS.schedules}>Schedules</TabsTrigger>
          <TabsTrigger value={TAX_TABS.scheduleA}>Schedule A</TabsTrigger>
          <TabsTrigger value={TAX_TABS.scheduleE}>Schedule E</TabsTrigger>
          <TabsTrigger value={TAX_TABS.capitalGains}>Capital Gains</TabsTrigger>
          <TabsTrigger value={TAX_TABS.form1116}>Form 1116</TabsTrigger>
          <TabsTrigger value={TAX_TABS.form8582}>Form 8582</TabsTrigger>
          <TabsTrigger value={TAX_TABS.form8995}>Form 8995</TabsTrigger>
          <TabsTrigger value={TAX_TABS.scheduleC}>Schedule C</TabsTrigger>
          <TabsTrigger value={TAX_TABS.estimate}>Tax Estimate</TabsTrigger>
          <TabsTrigger value={TAX_TABS.actionItems}>Action Items</TabsTrigger>
        </TabsList>

        <TabsContent value={TAX_TABS.overview} className="space-y-6 mt-0">
          <TaxIncomeOverview
            taxYear={selectedYear}
            payslips={data}
            w2GrossIncome={w2GrossIncome}
            income1099={income1099}
            reviewedW2Docs={reviewedW2Docs}
            reviewed1099Docs={reviewed1099Docs}
            reviewedK1Docs={reviewedK1Docs}
          />

          {showTaxTables ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <W2IncomeSummary payslips={data} />
              </div>
              <div className="lg:col-span-2">
                <TaxDocumentsSection
                  selectedYear={selectedYear}
                  payslips={data}
                  documents={w2Documents}
                  employmentEntities={employmentEntities}
                  isLoading={isLoading}
                  onDocumentsReload={refreshAll}
                />
              </div>
            </div>
          ) : (
            <TaxDocumentsSection
              selectedYear={selectedYear}
              payslips={data}
              documents={w2Documents}
              employmentEntities={employmentEntities}
              isLoading={isLoading}
              onDocumentsReload={refreshAll}
            />
          )}

          <TaxDocuments1099Section
            selectedYear={selectedYear}
            documents={accountDocuments}
            accounts={accounts}
            activeAccountIds={activeAccountIds}
            isLoading={isLoading}
            onDocumentsReload={refreshAll}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.schedules} className="space-y-6 mt-0">
          {showAmtWarning && k1sWithAMT.length > 0 && (
            <Callout kind="alert" title="⚠ Form 6251 (AMT) — Not Yet Computed">
              <p>
                The following K-1s report Box 17 AMT adjustment items, but Form 6251 has not been
                implemented yet. Your AMT liability estimate may be understated.
                Tracked in issue{' '}
                <a href="https://github.com/bherila/2025-website/issues/273" className="underline" target="_blank" rel="noreferrer">#273</a>.
              </p>
              <ul className="mt-1 list-disc list-inside text-xs">
                {k1sWithAMT.map((name, i) => <li key={i}>{name}</li>)}
              </ul>
              <div className="flex items-center gap-3">
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenK1Review}>
                  Open K-1 review
                </Button>
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setShowAmtWarning(false)}>
                  Dismiss for this session
                </Button>
              </div>
            </Callout>
          )}
          {showSeWarning && k1sWithSE.length > 0 && (
            <Callout kind="alert" title="⚠ Schedule SE (Self-Employment Tax) — Not Yet Computed">
              <p>
                The following K-1s report Box 14 self-employment income, but Schedule SE has not been
                implemented yet. Self-employment tax is not included in the estimate below.
                Tracked in issue{' '}
                <a href="https://github.com/bherila/2025-website/issues/273" className="underline" target="_blank" rel="noreferrer">#273</a>.
              </p>
              <ul className="mt-1 list-disc list-inside text-xs">
                {k1sWithSE.map((name, i) => <li key={i}>{name}</li>)}
              </ul>
              <div className="flex items-center gap-3">
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenK1Review}>
                  Open K-1 review
                </Button>
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setShowSeWarning(false)}>
                  Dismiss for this session
                </Button>
              </div>
            </Callout>
          )}
          <ScheduleBPreview
            interestIncome={income1099.interestIncome}
            dividendIncome={income1099.dividendIncome}
            qualifiedDividends={income1099.qualifiedDividends}
            selectedYear={selectedYear}
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
          />

          {(reviewedK1Docs.length > 0 || reviewed1099Docs.length > 0) && (
            <Form4952Preview
              reviewedK1Docs={reviewedK1Docs}
              reviewed1099Docs={reviewed1099Docs}
              income1099={income1099}
              {...(shortDividendSummary ? { shortDividendDeduction: shortDividendSummary.totalItemizedDeduction } : {})}
            />
          )}
        </TabsContent>

        <TabsContent value={TAX_TABS.scheduleA} className="mt-0 space-y-6">
          <ScheduleAPreview
            selectedYear={selectedYear}
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            saltPaid={w2SaltPaid}
            isMarried={isMarried}
            userDeductions={userDeductions}
            {...(shortDividendSummary ? { shortDividendSummary } : {})}
          />
          <div>
            <h3 className="text-sm font-semibold mb-2">Additional Deductions</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Add property tax, mortgage interest, charitable contributions, and other Schedule A deductions not captured from documents.
            </p>
            <UserDeductionsSection
              year={selectedYear}
              deductions={userDeductions}
              onChange={setUserDeductions}
            />
          </div>
        </TabsContent>

        <TabsContent value={TAX_TABS.scheduleE} className="mt-0">
          <ScheduleEPreview
            reviewedK1Docs={reviewedK1Docs}
            selectedYear={selectedYear}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.capitalGains} className="mt-0">
          <ScheduleDPreview
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            selectedYear={selectedYear}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.form1116} className="mt-0">
          <Form1116Preview
            reviewedK1Docs={reviewedK1Docs}
            allK1Docs={accountDocuments.filter((doc) => doc.form_type === 'k1')}
            reviewed1099Docs={reviewed1099Docs}
            income1099={income1099}
            onReviewNow={handleReviewK1Now}
            onBulkSetSbpElection={handleBulkSetSbpElection}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.form8995} className="mt-0">
          <Form8995Preview
            reviewedK1Docs={reviewedK1Docs}
            totalIncome={taxReturn.form8995?.totalIncome
              ?? w2GrossIncome.add(income1099.interestIncome).add(income1099.dividendIncome).add(scheduleCNetIncome.total).value}
            selectedYear={selectedYear}
            isMarried={isMarried}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.form8582} className="mt-0">
          {showPassiveLossWarning && k1sWithPassiveLosses.length > 0 && (
            <Callout kind="alert" title="⚠ K-1 Passive Losses — Not Wired into Form 8582">
              <p>
                The following K-1s report negative Box 1 ordinary business losses that may be passive,
                but K-1 activity grouping into Form 8582 has not been implemented yet. These losses are not reflected
                in the passive-activity loss computation below. Tracked in issue{' '}
                <a href="https://github.com/bherila/2025-website/issues/273" className="underline" target="_blank" rel="noreferrer">#273</a>.
              </p>
              <ul className="mt-1 list-disc list-inside text-xs">
                {k1sWithPassiveLosses.map((name, i) => <li key={i}>{name}</li>)}
              </ul>
              <div className="flex items-center gap-3">
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={handleOpenK1Review}>
                  Open K-1 review
                </Button>
                <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setShowPassiveLossWarning(false)}>
                  Dismiss for this session
                </Button>
              </div>
            </Callout>
          )}
          {taxReturn.form8582 ? (
            <Form8582Preview
              form8582={taxReturn.form8582}
              year={selectedYear}
              palCarryforwards={palCarryforwards}
              onCarryforwardsChange={setPalCarryforwards}
              realEstateProfessional={realEstateProfessional}
              onRealEstateProfessionalChange={setRealEstateProfessional}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No passive activity data found. Passive activities are reported in K-1 Box 2 (rental real estate) and Box 3 (other rental).
            </div>
          )}
        </TabsContent>

        <TabsContent value={TAX_TABS.scheduleC} className="space-y-6 mt-0">
          <ScheduleCTab
            selectedYear={selectedYear}
            scheduleCData={scheduleCData?.years ?? []}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.estimate} className="space-y-6 mt-0">
          <AdditionalTaxesPreview
            schedule2={taxReturn.schedule2}
            form8959={taxReturn.form8959}
            form8960={taxReturn.form8960}
            capitalLossCarryover={taxReturn.capitalLossCarryover}
            form461={taxReturn.form461}
          />
          <Form1040Preview
            w2Income={w2GrossIncome}
            interestIncome={income1099.interestIncome}
            dividendIncome={income1099.dividendIncome}
            scheduleCIncome={scheduleCNetIncome.total}
            selectedYear={selectedYear}
            w2Documents={reviewedW2Docs}
            interestDocuments={reviewed1099Docs.filter((doc) => doc.form_type === '1099_int' || doc.form_type === '1099_int_c')}
            dividendDocuments={reviewed1099Docs.filter((doc) => doc.form_type === '1099_div' || doc.form_type === '1099_div_c')}
            onNavigate={setActiveTab}
          />

          {showTaxTables && (
            <div className="space-y-6">
              <StateSelectorSection
                year={selectedYear}
                activeTaxStates={activeTaxStates}
                onChange={setActiveTaxStates}
              />
              <div>
                <h2 className="text-base font-semibold mb-2">Federal Taxes</h2>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{
                    year: String(selectedYear),
                    state: '',
                    filingStatus,
                    standardDeduction: getStandardDeduction(selectedYear, filingStatus),
                  }}
                  extraIncome={scheduleCIncomeBySeries}
                />
              </div>
              {activeTaxStates.map(stateCode => (
                <div key={stateCode}>
                  <h2 className="text-base font-semibold mb-2">{stateCode} State Taxes</h2>
                  <TotalsTable
                    series={dataSeries}
                    taxConfig={{
                      year: String(selectedYear),
                      state: stateCode,
                      filingStatus,
                      standardDeduction: getStandardDeduction(selectedYear, filingStatus, stateCode),
                    }}
                    extraIncome={scheduleCIncomeBySeries}
                  />
                </div>
              ))}
            </div>
          )}

          <EstimatedTaxPaymentsSection
            planningYear={selectedYear + 1}
            priorYearAgi={priorYearAgi}
            priorYearTax={priorYearTax}
            onPriorYearAgiChange={setPriorYearAgi}
            onPriorYearTaxChange={setPriorYearTax}
            estimatedTaxPayments={taxReturn.estimatedTaxPayments}
            showMfsUnsupportedNotice={isMarried}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.actionItems} className="mt-0">
          <ActionItemsTab
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            reviewedW2Docs={reviewedW2Docs}
            income1099={income1099}
            w2GrossIncome={w2GrossIncome}
            selectedYear={selectedYear}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function TaxPreviewPage({ initialData }: { initialData?: TaxPreviewPreload | null }) {
  return (
    <TaxPreviewProvider initialData={initialData ?? null}>
      <TaxPreviewPageContent />
    </TaxPreviewProvider>
  )
}
