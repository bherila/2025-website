'use client'

import currency from 'currency.js'
import { ClipboardList } from 'lucide-react'
import { useCallback, useState } from 'react'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import PayslipDataSourceModal from '@/components/finance/PayslipDataSourceModal'
import ScheduleAPreview from '@/components/finance/ScheduleAPreview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleEPreview from '@/components/finance/ScheduleEPreview'
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
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

import { TAX_TABS } from './tax-tab-ids'
import { TaxPreviewProvider, type TaxPreviewShellData, useTaxPreview } from './TaxPreviewContext'
import { YearSelectorWithNav } from './YearSelectorWithNav'

// ── Preload interface ─────────────────────────────────────────────────────────

/** Data preloaded server-side in the Blade template <script> tag. */
export type TaxPreviewPreload = TaxPreviewShellData

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
    return isNaN(n) ? acc : acc.add(n)
  }, currency(0)).value
}

function k1NetIncome(data: FK1StructuredData): number {
  const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6b', '6c', '7', '8', '9a', '9b', '9c', '10']
  const incomeTotal = INCOME_BOXES.reduce((acc, box) => acc.add(parseK1Field(data, box)), currency(0))
    .add(parseK1Codes(data, '11'))
  const box12 = parseK1Field(data, '12')
  const box21 = parseK1Field(data, '21')
  const deductionTotal = currency(0)
    .add(box12 !== 0 ? -Math.abs(box12) : 0)
    .add(parseK1Codes(data, '13'))
    .add(box21 !== 0 ? -Math.abs(box21) : 0)

  return incomeTotal.add(deductionTotal).value
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
  const totalK1Net = k1Parsed.reduce((acc, { data }) => acc.add(k1NetIncome(data)), currency(0)).value
  const totalInvestmentIncome = currency(totalInterest).add(totalOrdinaryDiv).value
  const totalCapitalGains = currency(k1StCapital).add(k1LtCapital).value

  const fedWH = payslips.reduce((acc, row) => acc
    .add(row.ps_fed_tax ?? 0)
    .add(row.ps_fed_tax_addl ?? 0)
    .subtract(row.ps_fed_tax_refunded ?? 0), currency(0)).value
  const addlMedicare = currency(Math.max(0, w2GrossIncome.value - 200000)).multiply(0.009).value

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
              {totalInvestmentIncome !== 0 && (
                <TableRow>
                  <TableCell className="py-2">Net investment income (interest + divs)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {fmtOverview(totalInvestmentIncome)}
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
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${totalCapitalGains < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtOverview(totalCapitalGains)}
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
    shortDividendSummary,
    refreshAll,
  } = useTaxPreview()

  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>(TAX_TABS.overview)

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

  return (
    <div>
      <div className="flex items-center gap-4 px-4 pt-4 pb-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tax Preview</h1>
        {pendingReviewCount > 0 && (
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
            isLoading={isLoading && availableYears.length === 0}
            onYearChange={handleYearChange}
            includeAll={false}
          />
        </div>
      </div>

      {error && (
        <div className="px-4 pb-2 text-sm text-destructive">{error}</div>
      )}

      <TaxDocumentReviewModal
        open={reviewModalOpen}
        taxYear={selectedYear}
        onClose={() => setReviewModalOpen(false)}
        onDocumentReviewed={() => {
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

        <TabsContent value={TAX_TABS.scheduleA} className="mt-0">
          <ScheduleAPreview
            selectedYear={selectedYear}
            reviewedK1Docs={reviewedK1Docs}
            reviewed1099Docs={reviewed1099Docs}
            {...(shortDividendSummary ? { shortDividendSummary } : {})}
          />
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
            reviewed1099Docs={reviewed1099Docs}
            income1099={income1099}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.scheduleC} className="space-y-6 mt-0">
          <ScheduleCTab
            selectedYear={selectedYear}
            scheduleCData={scheduleCData?.years ?? []}
          />
        </TabsContent>

        <TabsContent value={TAX_TABS.estimate} className="space-y-6 mt-0">
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
