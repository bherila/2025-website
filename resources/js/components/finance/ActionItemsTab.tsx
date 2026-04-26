'use client'

import currency from 'currency.js'

import {
  type ActionItemConditions,
  classifyOutstanding,
  classifyResolved,
  computeActionItemConditions,
  type OutstandingAlertClassification,
  type ResolvedItemClassification,
} from '@/components/finance/actionItemsLogic'
import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { TAX_TABS, type TaxTabId } from '@/components/finance/tax-tab-ids'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Helpers ───────────────────────────────────────────────────────────────────

function GoToSourceButton({
  tab,
  label,
  onTabChange,
}: {
  tab: TaxTabId
  label: string
  onTabChange: ((tab: TaxTabId) => void) | undefined
}) {
  if (!onTabChange) return null
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => onTabChange(tab)}
    >
      {label} →
    </Button>
  )
}

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function renderOutstandingBody(
  c: ActionItemConditions,
  alert: OutstandingAlertClassification,
  priorYear: number,
): { title: string; body: React.ReactNode } {
  switch (alert.kind) {
    case 'turbotax-ftc':
      return {
        title: 'TurboTax FTC Worksheet Line 1d — Correction Required',
        body: (
          <p>
            TurboTax may prefill Line 1d with Box 5 interest ({fmtAmt(c.totalK1Box5, 2)}) — but Box 5 is entirely
            U.S.-sourced per K-3 Part II Line 6, column (a). Set Line 1d to{' '}
            {fmtAmt(c.totalK3PassiveIncome, 2)} (K-3 passive foreign income only). Overstates foreign passive income
            by {fmtAmt(c.totalK1Box5 - c.totalK3PassiveIncome, 2)}.
          </p>
        ),
      }
    case 'suspended-deductions':
      return {
        title: 'California Schedule CA — §67(g) Deductions',
        body: (
          <div className="space-y-2">
            <p>
              CA does not conform to TCJA §67(g). The following suspended federal deductions may be claimed on
              Schedule CA (540):
            </p>
            <div className="rounded border border-current/20 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-current/10">
                    <th className="text-left px-2 py-1 font-semibold">Fund</th>
                    <th className="text-left px-2 py-1 font-semibold">Box</th>
                    <th className="text-left px-2 py-1 font-semibold">Description</th>
                    <th className="text-right px-2 py-1 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {c.suspendedItems.map((item, i) => (
                    <tr key={i} className="border-t border-current/10">
                      <td className="px-2 py-1">{item.fund}</td>
                      <td className="px-2 py-1 font-mono">{item.box}</td>
                      <td className="px-2 py-1">{item.description}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">({fmtAmt(item.amount)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Total: {fmtAmt(c.totalSuspended)} at 13.3% CA marginal rate ≈{' '}
              <strong>{fmtAmt(c.totalSuspended * 0.133)}</strong> CA tax savings.
            </p>
          </div>
        ),
      }
    case 'box21-no-k3': {
      const fund = c.box21AlertFunds[alert.fundIndex ?? 0]!
      return {
        title: `${fund.name} Box 21 (${fmtAmt(fund.amount, 2)}) — K-3 Confirmation Required`,
        body: (
          <p>
            Box 21 shows {fmtAmt(fund.amount, 2)} in foreign taxes but the K-3 Part III Section 4 has no country
            entries. Confirm with {fund.name} that the tax is creditable under §901, and obtain country code and
            date paid before filing Form 1116.
          </p>
        ),
      }
    }
    case 'election-items':
      return {
        title: 'Box 13 Codes Requiring Taxpayer Election',
        body: (
          <div className="space-y-1">
            <p>The following K-1 codes require a taxpayer decision on how to report:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {c.electionItems.map((item, i) => (
                <li key={i}>
                  <strong>{item.fund}</strong> — Box {item.box}: {fmtAmt(item.amount)} — {item.description}
                </li>
              ))}
            </ul>
          </div>
        ),
      }
    case 'box-13t':
      return {
        title: '§163(j) Excess Business Interest — Carryover Tracking',
        body: (
          <div className="space-y-1">
            <p>
              The following K-1s report excess business interest expense under §163(j). This amount is not deducted in
              the current year but carries forward:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {c.box13TItems.map((item, i) => (
                <li key={i}>
                  <strong>{item.fund}</strong>: {fmtAmt(item.amount)}
                </li>
              ))}
            </ul>
          </div>
        ),
      }
    case 'prior-year-carryforward':
      return {
        title: 'Confirm Prior-Year Carryforwards',
        body: (
          <ul className="list-none space-y-1">
            <li>☐ Form 4952 Line 7 — investment interest carryforward (assumed $0)</li>
            <li>☐ Schedule D carryforward worksheet — any {priorYear} ST/LT capital loss carryforwards</li>
            <li>☐ Form 1116 — any unused FTC carryforward (likely $0)</li>
            <li className="text-[10px] mt-1 opacity-80">
              Retrieve from your {priorYear} tax return before finalizing.
            </li>
          </ul>
        ),
      }
    case 'large-cap-loss':
      return {
        title: 'Net Capital Loss Carryforward — Be Aware',
        body: (
          <p>
            Combined ST + LT net loss of ~{fmtAmt(Math.abs(c.combined))} far exceeds the $3,000 annual cap. ~
            {fmtAmt(Math.abs(c.combined) - 3000)} carries to next year. Confirm exact ST/LT split on completed Schedule
            D.
          </p>
        ),
      }
  }
}

function renderResolvedBody(
  c: ActionItemConditions,
  resolved: ResolvedItemClassification,
): { title: string; body: string } {
  switch (resolved.kind) {
    case 'no-qd-election':
      return {
        title: 'Form 4952 QD Election — No Election Needed',
        body: `NII of ${fmtAmt(c.niiBefore)} already exceeds investment interest expense of ${fmtAmt(c.k1InvInt)}. Full deduction allowed. QDs retain 23.8% preferential rate.`,
      }
    case 'no-general-1116':
      return {
        title: 'No General Category Form 1116 Required',
        body: 'All K-3 column (d) general category amounts have country XX ("Sourced by partner") — U.S.-source for domestic partners. One Form 1116 (passive category) only.',
      }
    case 'box-11zz-ordinary':
      return {
        title: 'Box 11ZZ Character Confirmed — All Ordinary',
        body: 'Sec. 988 FX, swap losses, and PFIC MTM income reported in Box 11ZZ are all ordinary income/loss (IRC §§988, 1296). None flow to Schedule D.',
      }
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface ActionItemsTabProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  reviewedW2Docs: TaxDocument[]
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
  w2GrossIncome: currency
  selectedYear?: number
  onTabChange?: (tab: TaxTabId) => void
}

export default function ActionItemsTab({
  reviewedK1Docs,
  reviewed1099Docs,
  reviewedW2Docs,
  income1099,
  w2GrossIncome,
  selectedYear,
  onTabChange,
}: ActionItemsTabProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const priorYear = taxYear - 1
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // Shared classification — keeps this component and the dock home view's
  // count badge (`actionItemsCounts.ts`) on the same source of truth.
  const conditions = computeActionItemConditions({ reviewedK1Docs, reviewed1099Docs, income1099 })
  const { k1InvInt, noQdElectionNeeded, combined } = conditions
  const resolvedItems = classifyResolved(conditions).map((r) => renderResolvedBody(conditions, r))
  const outstandingAlerts = classifyOutstanding(conditions).map((a) => ({
    severity: a.severity,
    ...renderOutstandingBody(conditions, a, priorYear),
  }))

  // Display-only quantities for the Estimated Tax Position Summary table below.
  const totalW2FedWH = reviewedW2Docs.reduce((acc, doc) => {
    const p = doc.parsed_data as Record<string, unknown>
    const v = p?.box2_fed_tax as number | undefined
    return acc.add(v ?? 0)
  }, currency(0)).value

  const totalForeignTax = k1Parsed
    .reduce((acc, { data }) => acc.add(pk1(data, '21')), currency(0))
    .add(
      reviewed1099Docs.reduce((acc, doc) => {
        const p = doc.parsed_data as Record<string, unknown>
        const v = (p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined
        return acc.add(v ?? 0)
      }, currency(0)),
    ).value

  const addlMedicare = Math.max(0, w2GrossIncome.value - 200000) * 0.009

  // AQR ordinary items (Box 11ZZ sum)
  const aqrBox11ZZSum = k1Parsed.reduce((acc, { data }) => {
    return acc.add(
      (data.codes['11'] ?? [])
        .filter((i) => i.code === 'ZZ')
        .reduce((s, i) => s.add(parseFieldVal(i.value) ?? 0), currency(0)),
    )
  }, currency(0)).value

  const k1NetTotal = k1Parsed.reduce((acc, { data }) => {
    const incomeBoxes = ['1', '2', '3', '4', '5', '6a', '7', '8', '9a', '9b', '9c', '10']
    const income = incomeBoxes.reduce((s, b) => s.add(pk1(data, b)), currency(0))
    const box11 = (data.codes['11'] ?? []).reduce((s, i) => s.add(parseFieldVal(i.value) ?? 0), currency(0))
    const box12 = pk1(data, '12')
    const box13 = (data.codes['13'] ?? []).reduce((s, i) => s.add(parseFieldVal(i.value) ?? 0), currency(0))
    return acc.add(income).add(box11).add(box12 !== 0 ? -Math.abs(box12) : 0).add(box13)
  }, currency(0)).value

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Action Items</h2>
        <p className="text-xs text-muted-foreground">
          Computed alerts and checklist based on reviewed tax documents.
        </p>
      </div>

      {/* Resolved items */}
      {resolvedItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Resolved</h3>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-1.5 h-4">
              {resolvedItems.length}
            </Badge>
          </div>
          {resolvedItems.map((item, i) => (
            <Callout key={i} kind="good" title={`✓ ${item.title}`}>
              <p>{item.body}</p>
            </Callout>
          ))}
        </div>
      )}

      {/* Outstanding action items */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Action Required</h3>
          <Badge variant="destructive" className="text-[10px] px-1.5 h-4">
            {outstandingAlerts.filter((a) => a.severity === 'alert').length}
          </Badge>
          {outstandingAlerts.filter((a) => a.severity === 'warn').length > 0 && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1.5 h-4">
              {outstandingAlerts.filter((a) => a.severity === 'warn').length} warn
            </Badge>
          )}
        </div>
        {outstandingAlerts.map((item, i) => (
          <Callout key={i} kind={item.severity === 'alert' ? 'alert' : item.severity === 'warn' ? 'warn' : 'info'} title={item.title}>
            {item.body}
          </Callout>
        ))}
      </div>

      {/* Estimated tax position summary */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Estimated Tax Position Summary</h3>
        <div className="border rounded-lg overflow-hidden">
          <Table className="text-sm">
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs text-right">Federal</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
                <TableHead className="text-xs">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {w2GrossIncome.value > 0 && (
                <TableRow>
                  <TableCell className="py-2">W-2 wages</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {w2GrossIncome.format()}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Box 1</TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.w2} label="W-2" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {(income1099.interestIncome.value + income1099.dividendIncome.value) > 0 && (
                <TableRow>
                  <TableCell className="py-2">Net investment income</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    ~{fmtAmt(income1099.interestIncome.value + income1099.dividendIncome.value)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    Before deductions; subject to 3.8% NIIT
                  </TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.schedules} label="Schedule B" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {aqrBox11ZZSum !== 0 && (
                <TableRow>
                  <TableCell className="py-2">K-1 ordinary items (Box 11ZZ)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${aqrBox11ZZSum < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtAmt(aqrBox11ZZSum)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Schedule E Part II nonpassive</TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.scheduleE} label="Schedule E" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {k1NetTotal !== 0 && (
                <TableRow>
                  <TableCell className="py-2">K-1 net income (all funds)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${k1NetTotal < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtAmt(k1NetTotal)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Schedule E — includes all K-1 items</TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.scheduleE} label="Schedule E" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {combined < 0 && (
                <TableRow>
                  <TableCell className="py-2">Net capital loss applied</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                    ({fmtAmt(Math.abs(Math.max(combined, -3000)))})
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    $3,000 annual cap; remainder carries forward
                  </TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.capitalGains} label="Capital Gains" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {k1InvInt > 0 && (
                <TableRow>
                  <TableCell className="py-2">Investment interest deduction (Form 4952)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${noQdElectionNeeded ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'}`}>
                    ({fmtAmt(k1InvInt)})
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {noQdElectionNeeded ? 'Fully deductible — no carryforward' : 'See Form 4952 for QD election analysis'}
                  </TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.schedules} label="Schedules" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {totalForeignTax > 0 && (
                <TableRow>
                  <TableCell className="py-2">Foreign tax credit (Form 1116)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                    {fmtAmt(totalForeignTax, 2)} credit
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    Passive category — Schedule 3 Line 1
                  </TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.form1116} label="Form 1116" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {totalW2FedWH > 0 && (
                <TableRow>
                  <TableCell className="py-2">Federal withholding (W-2 Box 2)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums">
                    {fmtAmt(totalW2FedWH)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Already paid</TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.w2} label="W-2" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
              {w2GrossIncome.value > 200000 && (
                <TableRow>
                  <TableCell className="py-2">Additional Medicare Tax (Form 8959)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                    ({fmtAmt(addlMedicare)})
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    0.9% on wages over $200K threshold
                  </TableCell>
                  <TableCell className="py-2">
                    <GoToSourceButton tab={TAX_TABS.estimate} label="Tax Estimate" onTabChange={onTabChange} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
