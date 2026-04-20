'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
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
}

export default function ActionItemsTab({
  reviewedK1Docs,
  reviewed1099Docs,
  reviewedW2Docs,
  income1099,
  w2GrossIncome,
  selectedYear,
}: ActionItemsTabProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const priorYear = taxYear - 1
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // ── Compute conditions ────────────────────────────────────────────────────

  // §67(g) suspended deductions across all K-1s
  const suspendedItems = k1Parsed.flatMap(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'K' || i.code === 'AE')
      .map((i) => ({
        fund: partnerName,
        box: `13${i.code}`,
        description: i.notes ?? `Box 13${i.code}`,
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })
  const totalSuspended = suspendedItems.reduce((acc, i) => acc.add(i.amount), currency(0)).value
  const hasSuspendedDeductions = suspendedItems.length > 0

  // Box 13 codes requiring taxpayer election or manual routing
  const electionItems = k1Parsed.flatMap(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'F' || i.code === 'ZZ')
      .map((i) => ({
        fund: partnerName,
        code: i.code,
        box: `13${i.code}`,
        description: i.code === 'F'
          ? '§59(e)(2) expenditures — elect to amortize or deduct (Form 4562 or Sch A)'
          : 'Other deductions — check K-1 attached statement for destination',
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })
  const hasElectionItems = electionItems.length > 0

  // Box 13T (§163(j) excess business interest) — informational carryover
  const box13TItems = k1Parsed.flatMap(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    return (data.codes['13'] ?? [])
      .filter((i) => i.code === 'T')
      .map((i) => ({
        fund: partnerName,
        amount: Math.abs(parseFieldVal(i.value) ?? 0),
      }))
  })
  const hasBox13T = box13TItems.length > 0

  // TurboTax FTC Line 1d issue
  const totalK1Box5 = k1Parsed.reduce((acc, { data }) => acc.add(pk1(data, '5')), currency(0)).value
  let totalK3PassiveIncomeC = currency(0)
  for (const { data } of k1Parsed) {
    const k3Sections = data.k3?.sections ?? []
    for (const sec of k3Sections) {
      if (sec.sectionId !== 'part2_section1' && sec.sectionId !== 'part2_section2') continue
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const passive = parseFieldVal(String(row.col_c_passive ?? '')) ?? 0
        totalK3PassiveIncomeC = totalK3PassiveIncomeC.add(passive)
      }
    }
  }
  const totalK3PassiveIncome = totalK3PassiveIncomeC.value
  const turboTaxFTCIssue = totalK1Box5 > 0 && totalK3PassiveIncome < totalK1Box5 * 0.5

  // Box 21 without K-3 Part III Section 4 country entries
  const box21AlertFunds = k1Parsed
    .filter(({ data }) => {
      const box21 = pk1(data, '21')
      if (box21 === 0) return false
      const k3Sections = data.k3?.sections ?? []
      const part3Sec4 = k3Sections.find((s) => s.sectionId === 'part3_section4')
      const rows = ((part3Sec4?.data as Record<string, unknown> | undefined)?.countries as unknown[] | undefined) ?? []
      return rows.length === 0
    })
    .map(({ doc, data }) => ({
      name: data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership',
      amount: pk1(data, '21'),
    }))

  // K-3 general category check
  const allXXForGeneralCategory = k1Parsed.every(({ data }) => {
    const k3Sections = data.k3?.sections ?? []
    for (const sec of k3Sections) {
      if (sec.sectionId !== 'part2_section1' && sec.sectionId !== 'part2_section2') continue
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const general = parseFieldVal(String(row.col_d_general ?? '')) ?? 0
        const country = (row.country as string | undefined) ?? ''
        if (general !== 0 && country !== 'XX' && country !== '') return false
      }
    }
    return true
  })

  // Box 11ZZ items exist
  const hasBox11ZZ = k1Parsed.some(({ data }) =>
    (data.codes['11'] ?? []).some((i) => i.code === 'ZZ'),
  )

  // NII ≥ investment interest → no QD election needed
  const k1InvInt = k1Parsed.reduce((acc, { data }) => {
    const hItems = (data.codes['13'] ?? []).filter((i) => i.code === 'H' || i.code === 'G')
    return acc.add(hItems.reduce((s, i) => s.add(Math.abs(parseFieldVal(i.value) ?? 0)), currency(0)))
  }, currency(0)).value
  const niiBefore = k1Parsed
    .reduce((acc, { data }) => acc.add(pk1(data, '5')), currency(0))
    .add(income1099.interestIncome)
    .add(income1099.dividendIncome)
    .subtract(income1099.qualifiedDividends)
    .value
  const noQdElectionNeeded = k1InvInt > 0 && niiBefore >= k1InvInt

  // Capital gain/loss
  const netST = k1Parsed.reduce((acc, { data }) => acc.add(pk1(data, '8')), currency(0)).value
  const netLT = k1Parsed.reduce(
    (acc, { data }) => acc.add(pk1(data, '9a')).add(pk1(data, '9b')).add(pk1(data, '9c')).add(pk1(data, '10')),
    currency(0),
  ).value
  const combined = currency(netST).add(netLT).value
  const largeCapLossCarryforward = combined < -3000

  // Withholding
  const totalW2FedWH = reviewedW2Docs.reduce((acc, doc) => {
    const p = doc.parsed_data as Record<string, unknown>
    const v = p?.box2_fed_tax as number | undefined
    return acc.add(v ?? 0)
  }, currency(0)).value

  const totalForeignTax = k1Parsed
    .reduce((acc, { data }) => acc.add(pk1(data, '21')), currency(0))
    .add(reviewed1099Docs.reduce((acc, doc) => {
      const p = doc.parsed_data as Record<string, unknown>
      const v = (p?.box7_foreign_tax ?? p?.box6_foreign_tax) as number | undefined
      return acc.add(v ?? 0)
    }, currency(0)))
    .value

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

  // ── Resolved items ────────────────────────────────────────────────────────
  const resolvedItems: { title: string; body: string }[] = []

  if (noQdElectionNeeded) {
    resolvedItems.push({
      title: 'Form 4952 QD Election — No Election Needed',
      body: `NII of ${fmtAmt(niiBefore)} already exceeds investment interest expense of ${fmtAmt(k1InvInt)}. Full deduction allowed. QDs retain 23.8% preferential rate.`,
    })
  }
  if (allXXForGeneralCategory && k1Parsed.length > 0) {
    resolvedItems.push({
      title: 'No General Category Form 1116 Required',
      body: 'All K-3 column (d) general category amounts have country XX ("Sourced by partner") — U.S.-source for domestic partners. One Form 1116 (passive category) only.',
    })
  }
  if (hasBox11ZZ) {
    resolvedItems.push({
      title: 'Box 11ZZ Character Confirmed — All Ordinary',
      body: 'Sec. 988 FX, swap losses, and PFIC MTM income reported in Box 11ZZ are all ordinary income/loss (IRC §§988, 1296). None flow to Schedule D.',
    })
  }

  // ── Outstanding items ─────────────────────────────────────────────────────
  const outstandingAlerts: { severity: 'alert' | 'warn' | 'info'; title: string; body: React.ReactNode }[] = []

  if (turboTaxFTCIssue) {
    outstandingAlerts.push({
      severity: 'alert',
      title: 'TurboTax FTC Worksheet Line 1d — Correction Required',
      body: (
        <p>
          TurboTax may prefill Line 1d with Box 5 interest ({fmtAmt(totalK1Box5, 2)}) — but Box 5 is entirely
          U.S.-sourced per K-3 Part II Line 6, column (a). Set Line 1d to{' '}
          {fmtAmt(totalK3PassiveIncome, 2)} (K-3 passive foreign income only). Overstates foreign passive income
          by {fmtAmt(totalK1Box5 - totalK3PassiveIncome, 2)}.
        </p>
      ),
    })
  }

  if (hasSuspendedDeductions) {
    outstandingAlerts.push({
      severity: 'alert',
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
                {suspendedItems.map((item, i) => (
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
            Total: {fmtAmt(totalSuspended)} at 13.3% CA marginal rate ≈{' '}
            <strong>{fmtAmt(totalSuspended * 0.133)}</strong> CA tax savings.
          </p>
        </div>
      ),
    })
  }

  for (const fund of box21AlertFunds) {
    outstandingAlerts.push({
      severity: 'alert',
      title: `${fund.name} Box 21 (${fmtAmt(fund.amount, 2)}) — K-3 Confirmation Required`,
      body: (
        <p>
          Box 21 shows {fmtAmt(fund.amount, 2)} in foreign taxes but the K-3 Part III Section 4 has no country
          entries. Confirm with {fund.name} that the tax is creditable under §901, and obtain country code and
          date paid before filing Form 1116.
        </p>
      ),
    })
  }

  if (hasElectionItems) {
    outstandingAlerts.push({
      severity: 'warn',
      title: 'Box 13 Codes Requiring Taxpayer Election',
      body: (
        <div className="space-y-1">
          <p>The following K-1 codes require a taxpayer decision on how to report:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {electionItems.map((item, i) => (
              <li key={i}>
                <strong>{item.fund}</strong> — Box {item.box}: {fmtAmt(item.amount)} — {item.description}
              </li>
            ))}
          </ul>
        </div>
      ),
    })
  }

  if (hasBox13T) {
    outstandingAlerts.push({
      severity: 'info',
      title: '§163(j) Excess Business Interest — Carryover Tracking',
      body: (
        <div className="space-y-1">
          <p>The following K-1s report excess business interest expense under §163(j). This amount is not deducted in the current year but carries forward:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {box13TItems.map((item, i) => (
              <li key={i}><strong>{item.fund}</strong>: {fmtAmt(item.amount)}</li>
            ))}
          </ul>
        </div>
      ),
    })
  }

  // Always show prior-year carryforward reminder
  outstandingAlerts.push({
    severity: 'warn',
    title: 'Confirm Prior-Year Carryforwards',
    body: (
      <ul className="list-none space-y-1">
        <li>☐ Form 4952 Line 7 — investment interest carryforward (assumed $0)</li>
        <li>☐ Schedule D carryforward worksheet — any {priorYear} ST/LT capital loss carryforwards</li>
        <li>☐ Form 1116 — any unused FTC carryforward (likely $0)</li>
        <li className="text-[10px] mt-1 opacity-80">Retrieve from your {priorYear} tax return before finalizing.</li>
      </ul>
    ),
  })

  if (largeCapLossCarryforward) {
    outstandingAlerts.push({
      severity: 'info',
      title: 'Net Capital Loss Carryforward — Be Aware',
      body: (
        <p>
          Combined ST + LT net loss of ~{fmtAmt(Math.abs(combined))} far exceeds the $3,000 annual cap.
          ~{fmtAmt(Math.abs(combined) - 3000)} carries to next year. Confirm exact ST/LT split on completed
          Schedule D.
        </p>
      ),
    })
  }

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
                </TableRow>
              )}
              {aqrBox11ZZSum !== 0 && (
                <TableRow>
                  <TableCell className="py-2">K-1 ordinary items (Box 11ZZ)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${aqrBox11ZZSum < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtAmt(aqrBox11ZZSum)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Schedule E Part II nonpassive</TableCell>
                </TableRow>
              )}
              {k1NetTotal !== 0 && (
                <TableRow>
                  <TableCell className="py-2">K-1 net income (all funds)</TableCell>
                  <TableCell className={`py-2 text-right font-mono tabular-nums ${k1NetTotal < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {fmtAmt(k1NetTotal)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Schedule E — includes all K-1 items</TableCell>
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
                </TableRow>
              )}
              {totalW2FedWH > 0 && (
                <TableRow>
                  <TableCell className="py-2">Federal withholding (W-2 Box 2)</TableCell>
                  <TableCell className="py-2 text-right font-mono tabular-nums">
                    {fmtAmt(totalW2FedWH)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">Already paid</TableCell>
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
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
