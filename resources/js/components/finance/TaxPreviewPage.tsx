'use client'

import currency from 'currency.js'
import { ClipboardList } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import K1DetailsTab from '@/components/finance/K1DetailsTab'
import PayslipDataSourceModal from '@/components/finance/PayslipDataSourceModal'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import type { ScheduleCResponse } from '@/components/finance/ScheduleCPreview'
import ScheduleCPreview from '@/components/finance/ScheduleCPreview'
import ScheduleCTab from '@/components/finance/ScheduleCTab'
import ScheduleDPreview from '@/components/finance/ScheduleDPreview'
import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocuments1099Section from '@/components/finance/TaxDocuments1099Section'
import TaxDocumentsSection from '@/components/finance/TaxDocumentsSection'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import TotalsTable from '@/components/payslip/TotalsTable.client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

import { YearSelectorWithNav } from './YearSelectorWithNav'

// ── Preload interface ─────────────────────────────────────────────────────────

/** Data preloaded server-side in the Blade template <script> tag. */
export interface TaxPreviewPreload {
  year: number
  availableYears: number[]
  payslips: fin_payslip[]
  pendingReviewCount: number
  reviewedW2Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  scheduleCData: ScheduleCResponse
  employmentEntities: { id: number; display_name: string; type: string }[]
}

// ── Income Overview helpers ───────────────────────────────────────────────────

function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function parseK1Codes(data: FK1StructuredData, box: string): number {
  const items = data.codes[box] ?? []
  return items.reduce((acc, item) => {
    const n = parseFloat(item.value)
    return acc + (isNaN(n) ? 0 : n)
  }, 0)
}

function k1NetIncome(data: FK1StructuredData): number {
  const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6b', '6c', '7', '8', '9a', '9b', '9c', '10']
  const incomeTotal = INCOME_BOXES.reduce((acc, b) => acc + parseK1Field(data, b), 0) + parseK1Codes(data, '11')
  const box12 = parseK1Field(data, '12')
  const box21 = parseK1Field(data, '21')
  const deductionTotal = (box12 !== 0 ? -Math.abs(box12) : 0) + parseK1Codes(data, '13') + (box21 !== 0 ? -Math.abs(box21) : 0)
  return incomeTotal + deductionTotal
}

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

  const k1Interest = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '5'), 0)
  const k1OrdinaryDiv = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '6a'), 0)
  const k1QualifiedDiv = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '6b'), 0)
  const k1StCapital = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '8'), 0)
  const k1LtCapital = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '9a') + parseK1Field(data, '9b') + parseK1Field(data, '9c') + parseK1Field(data, '10'), 0)
  const k1ForeignTax = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '21'), 0)
  const k1InvInterest = k1Parsed.reduce((acc, { data }) => {
    // Box 13 code G = Investment interest expense
    const items = data.codes['13'] ?? []
    return acc + items
      .filter((item) => item.code === 'G' || item.code === 'H')
      .reduce((s, item) => { const n = parseFloat(item.value); return s + (isNaN(n) ? 0 : n) }, 0)
  }, 0)

  // 1099-DIV foreign tax (box 7)
  const div1099ForeignTax = reviewed1099Docs
    .filter((d) => d.form_type === '1099_div' || d.form_type === '1099_div_c')
    .reduce((acc, d) => {
      const parsed = d.parsed_data as Record<string, unknown>
      const v = parsed?.box7_foreign_tax
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : 0
      return acc + (isNaN(n) ? 0 : n)
    }, 0)

  const totalInterest = income1099.interestIncome.value + k1Interest
  const totalOrdinaryDiv = income1099.dividendIncome.value + k1OrdinaryDiv
  const totalQualifiedDiv = income1099.qualifiedDividends.value + k1QualifiedDiv
  const totalForeignTax = k1ForeignTax + div1099ForeignTax
  const totalK1Net = k1Parsed.reduce((acc, { data }) => acc + k1NetIncome(data), 0)

  // Federal withholding from W-2 payslips
  const fedWH = payslips.reduce((acc, r) => acc + (r.ps_fed_tax ?? 0) + (r.ps_fed_tax_addl ?? 0) - (r.ps_fed_tax_refunded ?? 0), 0)
  const addlMedicare = Math.max(0, w2GrossIncome.value - 200000) * 0.009

  const hasData = reviewedW2Docs.length + reviewed1099Docs.length + reviewedK1Docs.length > 0

  if (!hasData) return null

  // All-document rows
  const w2Rows = reviewedW2Docs.map((doc) => {
    const p = doc.parsed_data as Record<string, unknown>
    const wages = p?.box1_wages as number | undefined
    const fedTax = p?.box2_fed_tax as number | undefined
    return { doc, wages, fedTax }
  })

  const k1Rows = k1Parsed.map(({ doc, data }) => {
    const net = k1NetIncome(data)
    const partnerName = data.fields['B']?.value?.split('\n')[0] ?? null
    const ein = data.fields['A']?.value ?? null
    return { doc, net, partnerName, ein }
  })

  const f1099Rows = reviewed1099Docs.map((doc) => {
    const p = doc.parsed_data as Record<string, unknown>
    return { doc, p }
  })

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

      {/* Summary of Estimated Tax Positions */}
      <div>
        <h2 className="text-base font-semibold mb-3">Summary of Estimated Tax Positions</h2>
        <div className="border rounded-lg overflow-hidden">
          <Table className="text-sm">
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs text-right">Federal</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {w2GrossIncome.value > 0 && (
                <TableRow>
                  <TableCell className="py-2">W-2 Wages</TableCell>
                  <TableCell className="py-2 text-right font-mono text-emerald-600 dark:text-emerald-500 tabular-nums">{w2GrossIncome.format()}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Box 1 — includes RSU vesting and bonuses</TableCell>
                </TableRow>
              )}
              {totalInterest + totalOrdinaryDiv !== 0 && (
                <TableRow>
                  <TableCell className="py-2">Net investment income (interest + divs)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {fmtOverview(totalInterest + totalOrdinaryDiv)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Before deductions; subject to NIIT (3.8%)</TableCell>
                </TableRow>
              )}
              {k1Parsed.map(({ doc, data }) => {
                const net = k1NetIncome(data)
                const name = (data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership K-1').substring(0, 40)
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="py-2">{name} — K-1</TableCell>
                    <TableCell className={`py-2 text-right font-mono tabular-nums ${net < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                      {fmtOverview(net)}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {net < 0 ? 'Net loss — Schedule E' : 'Net income — Schedule E'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {(k1StCapital !== 0 || k1LtCapital !== 0) && (
                <TableRow>
                  <TableCell className="py-2">Net capital gain (loss) — K-1s</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${k1StCapital + k1LtCapital < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtOverview(k1StCapital + k1LtCapital)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    S/T {fmtOverview(k1StCapital)} · L/T {fmtOverview(k1LtCapital)}
                  </TableCell>
                </TableRow>
              )}
              {k1InvInterest !== 0 && (
                <TableRow>
                  <TableCell className="py-2">Investment interest deduction (Form 4952)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${k1InvInterest < 0 ? 'text-destructive' : ''}`}>
                    {fmtOverview(k1InvInterest)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">From K-1 Box 13G/H — flows to Schedule E</TableCell>
                </TableRow>
              )}
              {totalForeignTax !== 0 && (
                <TableRow>
                  <TableCell className="py-2">Foreign tax credit (Form 1116)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {fmtOverview(totalForeignTax)} credit
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Dollar-for-dollar vs. income tax</TableCell>
                </TableRow>
              )}
              {fedWH > 0 && (
                <TableRow>
                  <TableCell className="py-2">Federal withholding (W-2 Box 2)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums">
                    {fmtOverview(fedWH)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Already paid — compare to final liability</TableCell>
                </TableRow>
              )}
              {w2GrossIncome.value > 200000 && (
                <TableRow>
                  <TableCell className="py-2">Additional Medicare Tax (Form 8959)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                    ({fmtOverview(addlMedicare)})
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">0.9% on wages over $200K threshold</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* All tax documents table */}
      <div>
        <h2 className="text-base font-semibold mb-3">All Tax Documents in Package</h2>
        <div className="border rounded-lg overflow-hidden">
          <Table className="text-sm">
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead className="text-xs">Payer / Fund</TableHead>
                <TableHead className="text-xs">Document</TableHead>
                <TableHead className="text-xs">Account / EIN</TableHead>
                <TableHead className="text-xs text-right">Key Amounts</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* W-2 section */}
              {w2Rows.length > 0 && (
                <>
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground">W-2 Employment Income</TableCell>
                  </TableRow>
                  {w2Rows.map(({ doc, wages, fedTax }) => {
                    const p = doc.parsed_data as Record<string, unknown>
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="py-2">{(p?.employer_name as string) ?? doc.employment_entity?.display_name ?? '—'}</TableCell>
                        <TableCell className="py-2">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</TableCell>
                        <TableCell className="py-2 font-mono text-xs">{p?.employer_ein as string ?? '—'}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-xs">
                          {wages != null && <div className="text-emerald-600 dark:text-emerald-500">{fmtOverview(wages)} wages</div>}
                          {fedTax != null && <div>{fmtOverview(fedTax)} fed WH</div>}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{doc.notes ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </>
              )}
              {/* K-1 section */}
              {k1Rows.length > 0 && (
                <>
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground">Partnership K-1s</TableCell>
                  </TableRow>
                  {k1Rows.map(({ doc, net, partnerName, ein }) => {
                    const data = doc.parsed_data as FK1StructuredData
                    const interest = parseK1Field(data, '5')
                    const foreignTax = parseK1Field(data, '21')
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="py-2">{partnerName ?? doc.employment_entity?.display_name ?? '—'}</TableCell>
                        <TableCell className="py-2">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</TableCell>
                        <TableCell className="py-2 font-mono text-xs">{ein ?? '—'}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-xs">
                          <div className={net < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}>
                            Net {fmtOverview(net)}
                          </div>
                          {interest !== 0 && <div>Interest {fmtOverview(interest)}</div>}
                          {foreignTax !== 0 && <div>Foreign tax {fmtOverview(foreignTax)}</div>}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{doc.notes ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </>
              )}
              {/* 1099 section */}
              {f1099Rows.length > 0 && (
                <>
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground">Brokerage / 1099 Accounts</TableCell>
                  </TableRow>
                  {f1099Rows.map(({ doc, p }) => {
                    const payer = p?.payer_name as string | undefined
                    const acct = p?.account_number as string | undefined
                    const interest = p?.box1_interest as number | undefined
                    const ordDiv = p?.box1a_ordinary as number | undefined
                    const foreignTax = (p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="py-2">{payer ?? doc.employment_entity?.display_name ?? '—'}</TableCell>
                        <TableCell className="py-2">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</TableCell>
                        <TableCell className="py-2 font-mono text-xs">{acct ?? '—'}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-xs">
                          {interest != null && interest !== 0 && <div className="text-emerald-600 dark:text-emerald-500">Interest {fmtOverview(interest)}</div>}
                          {ordDiv != null && ordDiv !== 0 && <div className="text-emerald-600 dark:text-emerald-500">Ord div {fmtOverview(ordDiv)}</div>}
                          {foreignTax != null && foreignTax !== 0 && <div>Foreign tax {fmtOverview(foreignTax, 2)}</div>}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{doc.notes ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
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
  const fedWHGetter = (r: fin_payslip) =>
    currency(r.ps_fed_tax ?? 0)
      .add(r.ps_fed_tax_addl ?? 0)
      .subtract(r.ps_fed_tax_refunded ?? 0)
  const stateWHGetter = (r: fin_payslip) =>
    currency(r.ps_state_tax ?? 0).add(r.ps_state_tax_addl ?? 0)
  const oasdiGetter = (r: fin_payslip) => currency(r.ps_oasdi ?? 0)
  const medicareGetter = (r: fin_payslip) => currency(r.ps_medicare ?? 0)
  const sdiGetter = (r: fin_payslip) => currency(r.ps_state_disability ?? 0)

  const wages = sum(wagesGetter)
  const bonus = sum(bonusGetter)
  const rsu = sum(rsuGetter)
  const vacationPayout = sum(vacationGetter)
  const imputed = sum(imputedGetter)
  const gross = wages.add(bonus).add(rsu).add(vacationPayout).add(imputed)

  const fedWH = sum(fedWHGetter)
  const stateWH = sum(stateWHGetter)
  const oasdi = sum(oasdiGetter)
  const medicare = sum(medicareGetter)
  const sdi = sum(sdiGetter)

  const grossGetter = (r: fin_payslip) =>
    wagesGetter(r).add(bonusGetter(r)).add(rsuGetter(r)).add(vacationGetter(r)).add(imputedGetter(r))

  const rows = [
    { label: 'Wages / Salary', value: wages, getter: wagesGetter },
    bonus.value > 0 ? { label: 'Bonus', value: bonus, getter: bonusGetter } : null,
    rsu.value > 0 ? { label: 'RSU Vesting', value: rsu, getter: rsuGetter } : null,
    vacationPayout.value > 0 ? { label: 'Vacation Payout', value: vacationPayout, getter: vacationGetter } : null,
    imputed.value > 0 ? { label: 'Imputed Income (benefits)', value: imputed, getter: imputedGetter } : null,
    { label: 'Total Gross W-2 Income', value: gross, bold: true, getter: grossGetter },
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
 * Shows W-2 income (from payslips), Federal and State tax estimates,
 * and Schedule C data for each sch_c employment entity.
 *
 * Accepts optional `initialData` preloaded from the Blade template.
 * When available, payslips, W-2 docs, 1099 docs, Schedule C, entities,
 * pending review count, and available years are initialized from the preload.
 * K-1 docs are always fetched client-side (large parsed_data with K-3 sections).
 */
export default function TaxPreviewPage({ initialData }: { initialData?: TaxPreviewPreload | null }) {
  const [availableYears, setAvailableYears] = useState<number[]>(() => initialData?.availableYears ?? [])
  const [isYearsLoading, setIsYearsLoading] = useState(() => !initialData)

  // Review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [pendingReviewCount, setPendingReviewCount] = useState(() => initialData?.pendingReviewCount ?? 0)

  // Read initial year from preload or URL query string, default to current year
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => {
    if (initialData?.year) return initialData.year
    try {
      const params = new URLSearchParams(window.location.search)
      const y = params.get('year')
      if (y === 'all') return 'all'
      const parsed = y ? parseInt(y, 10) : NaN
      return isNaN(parsed) ? new Date().getFullYear() : parsed
    } catch {
      return new Date().getFullYear()
    }
  })

  // Payslip data for the selected year (used for W-2 income and tax tables)
  const [payslips, setPayslips] = useState<fin_payslip[]>(() => initialData?.payslips ?? [])
  const [payslipsLoading, setPayslipsLoading] = useState(() => !initialData)

  // Net Schedule C income for the selected year (emitted by ScheduleCPreview)
  const [scheduleCNetIncome, setScheduleCNetIncome] = useState({
    total: 0,
    byQuarter: {
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0,
    },
  })

  // 1099 income totals (from confirmed parsed documents)
  const [income1099, setIncome1099] = useState({
    interestIncome: currency(0),
    dividendIncome: currency(0),
    qualifiedDividends: currency(0),
  })

  // Reviewed W-2, 1099, and K-1 documents for Form 1040 data source drill-down
  const [reviewedW2Docs, setReviewedW2Docs] = useState<TaxDocument[]>(() => (initialData?.reviewedW2Docs ?? []) as TaxDocument[])
  const [reviewed1099Docs, setReviewed1099Docs] = useState<TaxDocument[]>(() => (initialData?.reviewed1099Docs ?? []) as TaxDocument[])
  const [reviewedK1Docs, setReviewedK1Docs] = useState<TaxDocument[]>([])

  // Preloaded Schedule C data (passed to ScheduleCPreview and ScheduleCTab)
  const preloadedScheduleC = initialData?.scheduleCData ?? null

  // Refresh trigger — increment to force child sections to reload after a review
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handle1099TotalsChange = useCallback((totals: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }) => {
    setIncome1099(totals)
  }, [])

  const handle1099DocumentsChange = useCallback((docs: TaxDocument[]) => {
    setReviewed1099Docs(docs)
  }, [])

  const handleW2DocumentsChange = useCallback((docs: TaxDocument[]) => {
    setReviewedW2Docs(docs)
  }, [])

  // Year changes navigate to a new URL (full page load).
  // This ensures the Blade preload always has the correct year's data.
  const handleYearChange = useCallback((year: number | 'all') => {
    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    if (typeof year === 'number' && year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    window.location.href = url.toString()
  }, [])

  const handleAvailableYearsChange = useCallback((years: number[], isLoading: boolean) => {
    setAvailableYears(years)
    setIsYearsLoading(isLoading)
  }, [])

  const handleScheduleCNetIncomeChange = useCallback((netIncome: {
    total: number
    byQuarter: {
      q1: number
      q2: number
      q3: number
      q4: number
    }
  }) => {
    setScheduleCNetIncome(netIncome)
  }, [])

  // If year wasn't explicitly set in URL, default to newest available year when current year has no data.
  useEffect(() => {
    if (isYearsLoading || availableYears.length === 0) return
    if (typeof selectedYear !== 'number') return
    if (availableYears.includes(selectedYear)) return
    const newestYear = availableYears[0]
    if (newestYear === undefined) return
    // Navigate to the newest year
    handleYearChange(newestYear)
  }, [availableYears, isYearsLoading, selectedYear, handleYearChange])

  // Fetch payslips for the selected year — skip when preloaded
  useEffect(() => {
    if (initialData) return // Already initialized from preload
    if (selectedYear === 'all') {
      setPayslips([])
      return
    }
    let cancelled = false
    setPayslipsLoading(true)
    fetchWrapper.get(`/api/payslips?year=${selectedYear}`)
      .then((data: unknown) => {
        if (!cancelled) setPayslips(Array.isArray(data) ? data as fin_payslip[] : [])
      })
      .catch(() => { if (!cancelled) setPayslips([]) })
      .finally(() => { if (!cancelled) setPayslipsLoading(false) })
    return () => { cancelled = true }
  }, [selectedYear, initialData])

  // Fetch count of documents ready for review (parsed but not confirmed)
  // Skip initial fetch when preloaded; still re-fetch after review actions
  useEffect(() => {
    if (initialData && refreshTrigger === 0) return // Already initialized from preload
    if (typeof selectedYear !== 'number') {
      setPendingReviewCount(0)
      return
    }
    let cancelled = false
    const params = new URLSearchParams({ year: String(selectedYear), genai_status: 'parsed', is_reviewed: '0' })
    fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      .then((data: unknown) => {
        if (!cancelled) setPendingReviewCount(Array.isArray(data) ? (data as TaxDocument[]).length : 0)
      })
      .catch(() => { if (!cancelled) setPendingReviewCount(0) })
    return () => { cancelled = true }
  }, [selectedYear, refreshTrigger, initialData])

  // Fetch reviewed K-1 documents for the selected year
  useEffect(() => {
    if (typeof selectedYear !== 'number') {
      setReviewedK1Docs([])
      return
    }
    let cancelled = false
    const params = new URLSearchParams({ year: String(selectedYear), form_type: 'k1', is_reviewed: '1' })
    fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      .then((data: unknown) => {
        if (!cancelled) setReviewedK1Docs(Array.isArray(data) ? (data as TaxDocument[]) : [])
      })
      .catch(() => { if (!cancelled) setReviewedK1Docs([]) })
    return () => { cancelled = true }
  }, [selectedYear, refreshTrigger])

  // Build quarterly payslip series in a single pass (same logic as PayslipClient)
  const year = typeof selectedYear === 'number' ? selectedYear : null
  const { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 } = (() => {
    if (!year) return { data: [], dataThroughQ1: [], dataThroughQ2: [], dataThroughQ3: [] }
    const start = `${year}-01-01`
    const end = `${year + 1}-01-01`
    const q1end = `${year}-04-01`
    const q2end = `${year}-07-01`
    const q3end = `${year}-10-01`
    const data: fin_payslip[] = []
    const dataThroughQ1: fin_payslip[] = []
    const dataThroughQ2: fin_payslip[] = []
    const dataThroughQ3: fin_payslip[] = []
    for (const r of payslips) {
      const pd = r.pay_date!
      if (pd <= start || pd >= end) continue
      data.push(r)
      if (pd < q1end) dataThroughQ1.push(r)
      if (pd < q2end) dataThroughQ2.push(r)
      if (pd < q3end) dataThroughQ3.push(r)
    }
    return { data, dataThroughQ1, dataThroughQ2, dataThroughQ3 }
  })()

  const dataSeries = year ? [
    ['Q1', dataThroughQ1],
    dataThroughQ2.length > dataThroughQ1.length ? ['Q2', dataThroughQ2] : undefined,
    dataThroughQ3.length > dataThroughQ2.length ? ['Q3', dataThroughQ3] : undefined,
    data.length > dataThroughQ3.length ? ['Q4 (Full Year)', data] : undefined,
  ].filter(Boolean) as [string, fin_payslip[]][] : []

  const scheduleCIncomeBySeries = {
    Q1: scheduleCNetIncome.byQuarter.q1,
    Q2: scheduleCNetIncome.byQuarter.q2,
    Q3: scheduleCNetIncome.byQuarter.q3,
    'Q4 (Full Year)': scheduleCNetIncome.byQuarter.q4,
  }

  const showTaxTables = typeof selectedYear === 'number' && !payslipsLoading && data.length > 0

  // Compute W-2 gross income for 1040 preview using currency.js for precise arithmetic
  const w2GrossIncome = data.reduce((acc, r) => acc
    .add(r.ps_salary ?? 0)
    .add(r.earnings_bonus ?? 0)
    .add(r.earnings_rsu ?? 0)
    .add(r.ps_vacation_payout ?? 0)
    .add(r.imp_ltd ?? 0)
    .add(r.imp_legal ?? 0)
    .add(r.imp_fitness ?? 0)
    .add(r.imp_other ?? 0), currency(0))

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        {typeof selectedYear === 'number' && pendingReviewCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setReviewModalOpen(true)}
          >
            <ClipboardList className="h-4 w-4" />
            Review Documents
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-4">
              {pendingReviewCount}
            </Badge>
          </Button>
        )}
        <div className="ml-auto">
          <YearSelectorWithNav
            selectedYear={selectedYear}
            availableYears={availableYears}
            isLoading={isYearsLoading && availableYears.length === 0}
            onYearChange={handleYearChange}
          />
        </div>
      </div>

      {/* Review modal (hidden) */}
      {typeof selectedYear === 'number' && (
        <TaxDocumentReviewModal
          open={reviewModalOpen}
          taxYear={selectedYear}
          onClose={() => setReviewModalOpen(false)}
          onDocumentReviewed={() => setRefreshTrigger(t => t + 1)}
        />
      )}

      {/* Hidden ScheduleCPreview — computes net income for Tax Estimate tab and available years.
          Renders no visible UI; it only fires the onScheduleCNetIncomeChange callback. */}
      <div className="hidden">
        <ScheduleCPreview
          selectedYear={selectedYear}
          onAvailableYearsChange={handleAvailableYearsChange}
          onScheduleCNetIncomeChange={handleScheduleCNetIncomeChange}
          preloadedData={preloadedScheduleC}
        />
      </div>

      {/* ── Tabbed content ──────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="px-4 pb-8">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="k1-details">
            K-1 Details
            {reviewedK1Docs.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                {reviewedK1Docs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="capital-gains">Capital Gains</TabsTrigger>
          <TabsTrigger value="form-1116">Form 1116</TabsTrigger>
          <TabsTrigger value="schedule-c">Schedule C</TabsTrigger>
          <TabsTrigger value="estimate">Tax Estimate</TabsTrigger>
          <TabsTrigger value="action-items">Action Items</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-0 mt-0">
          {typeof selectedYear === 'number' && (
            <TaxIncomeOverview
              taxYear={selectedYear}
              payslips={data}
              w2GrossIncome={w2GrossIncome}
              income1099={income1099}
              reviewedW2Docs={reviewedW2Docs}
              reviewed1099Docs={reviewed1099Docs}
              reviewedK1Docs={reviewedK1Docs}
            />
          )}
        </TabsContent>

        {/* ── Documents tab ─────────────────────────────────────────────────── */}
        <TabsContent value="documents" className="space-y-6 mt-0">
          {/* W-2: payslip summary alongside document upload */}
          {typeof selectedYear === 'number' && showTaxTables && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <W2IncomeSummary payslips={data} />
              </div>
              <div className="lg:col-span-2">
                <TaxDocumentsSection
                  selectedYear={selectedYear}
                  payslips={data}
                  onDocumentReviewed={() => setRefreshTrigger(t => t + 1)}
                  onW2DocumentsChange={handleW2DocumentsChange}
                />
              </div>
            </div>
          )}
          {typeof selectedYear === 'number' && !showTaxTables && (
            <TaxDocumentsSection
              selectedYear={selectedYear}
              payslips={data}
              onDocumentReviewed={() => setRefreshTrigger(t => t + 1)}
              onW2DocumentsChange={handleW2DocumentsChange}
            />
          )}

          {/* 1099 documents */}
          {typeof selectedYear === 'number' && (
            <TaxDocuments1099Section
              selectedYear={selectedYear}
              onTotalsChange={handle1099TotalsChange}
              onDocumentsChange={handle1099DocumentsChange}
            />
          )}
        </TabsContent>

        {/* ── K-1 Details tab ───────────────────────────────────────────────── */}
        <TabsContent value="k1-details" className="mt-0">
          <K1DetailsTab reviewedK1Docs={reviewedK1Docs} />
        </TabsContent>

        {/* ── Schedules tab ─────────────────────────────────────────────────── */}
        <TabsContent value="schedules" className="space-y-6 mt-0">
          {/* Schedule B — Interest & Dividends */}
          {typeof selectedYear === 'number' && (
            <ScheduleBPreview
              interestIncome={income1099.interestIncome}
              dividendIncome={income1099.dividendIncome}
              qualifiedDividends={income1099.qualifiedDividends}
              selectedYear={selectedYear}
              reviewedK1Docs={reviewedK1Docs}
              reviewed1099Docs={reviewed1099Docs}
            />
          )}

          {/* Form 4952 — Investment Interest Expense */}
          {typeof selectedYear === 'number' &&
            (reviewedK1Docs.length > 0 || reviewed1099Docs.length > 0) && (
              <Form4952Preview
                reviewedK1Docs={reviewedK1Docs}
                reviewed1099Docs={reviewed1099Docs}
                income1099={income1099}
              />
            )}
        </TabsContent>

        {/* ── Capital Gains tab ─────────────────────────────────────────────── */}
        <TabsContent value="capital-gains" className="mt-0">
          <ScheduleDPreview
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
          />
        </TabsContent>

        {/* ── Form 1116 tab ─────────────────────────────────────────────────── */}
        <TabsContent value="form-1116" className="mt-0">
          <Form1116Preview
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            income1099={income1099}
          />
        </TabsContent>

        {/* ── Schedule C tab ────────────────────────────────────────────────── */}
        <TabsContent value="schedule-c" className="space-y-6 mt-0">
          {typeof selectedYear === 'number' && preloadedScheduleC?.years ? (
            <ScheduleCTab
              selectedYear={selectedYear}
              scheduleCData={preloadedScheduleC.years}
            />
          ) : (
            <ScheduleCPreview
              selectedYear={selectedYear}
              onAvailableYearsChange={handleAvailableYearsChange}
              onScheduleCNetIncomeChange={handleScheduleCNetIncomeChange}
              preloadedData={preloadedScheduleC}
            />
          )}
        </TabsContent>

        {/* ── Tax Estimate tab ──────────────────────────────────────────────── */}
        <TabsContent value="estimate" className="space-y-6 mt-0">
          {/* Form 1040 preview */}
          {typeof selectedYear === 'number' && (
            <Form1040Preview
              w2Income={w2GrossIncome}
              interestIncome={income1099.interestIncome}
              dividendIncome={income1099.dividendIncome}
              scheduleCIncome={scheduleCNetIncome.total}
              selectedYear={selectedYear}
              w2Documents={reviewedW2Docs}
              interestDocuments={reviewed1099Docs.filter(d => d.form_type === '1099_int' || d.form_type === '1099_int_c')}
              dividendDocuments={reviewed1099Docs.filter(d => d.form_type === '1099_div' || d.form_type === '1099_div_c')}
            />
          )}

          {/* Federal & California tax tables */}
          {showTaxTables && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-2">Federal Taxes</h2>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{
                    year: String(selectedYear),
                    state: '',
                    filingStatus: 'Single',
                    standardDeduction: 13850,
                  }}
                  extraIncome={scheduleCIncomeBySeries}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold mb-2">California State Taxes</h2>
                <TotalsTable
                  series={dataSeries}
                  taxConfig={{
                    year: String(selectedYear),
                    state: 'CA',
                    filingStatus: 'Single',
                    standardDeduction: 13850,
                  }}
                  extraIncome={scheduleCIncomeBySeries}
                />
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Action Items tab ──────────────────────────────────────────────── */}
        <TabsContent value="action-items" className="mt-0">
          <ActionItemsTab
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            reviewedW2Docs={reviewedW2Docs}
            income1099={income1099}
            w2GrossIncome={w2GrossIncome}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
