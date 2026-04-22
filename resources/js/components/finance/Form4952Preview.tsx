'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form4952Lines } from '@/types/finance/tax-return'

export type { Form4952Lines } from '@/types/finance/tax-return'

import { Callout, fmtAmt,FormBlock, FormLine, FormTotalLine } from './tax-preview-primitives'

// ── K-1 data helpers ──────────────────────────────────────────────────────────

function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function parseK1Codes(data: FK1StructuredData, box: string, filterCodes?: string[]): number {
  const items = data.codes[box] ?? []
  return items
    .filter((item) => !filterCodes || filterCodes.includes(item.code))
    .reduce((acc, item) => {
      const n = parseFloat(item.value)
      return isNaN(n) ? acc : acc.add(n)
    }, currency(0)).value
}

// ── Main component ────────────────────────────────────────────────────────────

interface Form4952PreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
  /**
   * Short dividends charged on positions held > 45 days.
   * These are deductible as investment interest expense on Form 4952.
   * Pass the `totalItemizedDeduction` from `analyzeShortDividends()`.
   */
  shortDividendDeduction?: number
}

export function computeForm4952Lines({
  reviewedK1Docs,
  reviewed1099Docs,
  income1099,
  shortDividendDeduction = 0,
}: Form4952PreviewProps): Form4952Lines {
  const invIntSources: { label: string; amount: number }[] = []
  const invExpSources: { label: string; amount: number }[] = []
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  if (shortDividendDeduction > 0) {
    invIntSources.push({
      label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
      amount: -shortDividendDeduction,
    })
  }

  // K-1 Box 13H/G/AC/AD → Form 4952 Part I Line 1 (investment interest expense)
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    for (const item of data.codes['13'] ?? []) {
      if (item.code === 'H' || item.code === 'G' || item.code === 'AC' || item.code === 'AD') {
        const n = parseFloat(item.value)
        if (!isNaN(n) && n !== 0) {
          invIntSources.push({ label: `${partnerName} — Box 13${item.code}`, amount: -Math.abs(n) })
        }
      }
    }
  }

  // 1099-INT Box 5 (investment expenses → Part I)
  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? ''
    const invExp = p?.box5_investment_expense
    if (typeof invExp === 'number' && invExp !== 0) {
      invIntSources.push({ label: `${payer} — 1099-INT Box 5 (investment expense)`, amount: -Math.abs(invExp) })
    }
  }

  // K-1 Box 20B → Form 4952 Part II Line 5 (investment expenses that reduce NII)
  // These are NOT investment interest expense (Part I) — they reduce net investment income.
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    for (const item of data.codes['20'] ?? []) {
      if (item.code === 'B') {
        const n = parseFloat(item.value)
        if (!isNaN(n) && n !== 0) {
          invExpSources.push({ label: `${partnerName} — Box 20B (investment expenses)`, amount: -Math.abs(n) })
        }
      }
    }
  }

  const totalInvInt = invIntSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value
  const totalInvIntExpense = Math.abs(totalInvInt)
  const totalInvExp = Math.abs(invExpSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value)
  const k1Interest = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '5')), currency(0)).value
  const k1OrdDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6a')), currency(0)).value
  const k1QualDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6b')), currency(0)).value
  const k1NonQualDiv = currency(k1OrdDiv).subtract(k1QualDiv).value
  const k1Sec1256 = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Codes(data, '11', ['C'])), currency(0)).value
  const k1Box20A = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Codes(data, '20', ['A'])), currency(0)).value
  const direct1099Interest = income1099.interestIncome.value
  const direct1099OrdDiv = income1099.dividendIncome.value
  const direct1099QualDiv = income1099.qualifiedDividends.value
  const direct1099NonQualDiv = currency(direct1099OrdDiv).subtract(direct1099QualDiv).value

  // NII (before QD election) — Box 20A is the authoritative gross investment income figure.
  // When 20A is present, Box 20B expenses reduce NII (Part II Line 5 offset against Line 4a).
  // When 20A is absent, reconstruct NII from component boxes, then reduce by 20B expenses.
  const niiGross =
    k1Box20A > 0
      ? currency(k1Box20A).add(direct1099Interest).add(direct1099NonQualDiv).value
      : currency(k1Interest).add(k1NonQualDiv).add(k1Sec1256).add(direct1099Interest).add(direct1099NonQualDiv).value
  // Box 20B expenses (Form 4952 Part II Line 5) reduce NII — they are not Part I interest expense.
  const niiBefore = Math.max(0, currency(niiGross).subtract(totalInvExp).value)

  const totalQualDiv = currency(k1QualDiv).add(direct1099QualDiv).value
  const scenA_deductible = Math.min(totalInvIntExpense, niiBefore)
  const gapToFill = Math.max(0, totalInvIntExpense - niiBefore)
  const scenC_qdElected = Math.min(totalQualDiv, gapToFill)
  const scenB_nii = niiBefore + totalQualDiv
  const scenB_deductible = Math.min(totalInvIntExpense, scenB_nii)
  const scenB_netBenefit = (scenB_deductible - scenA_deductible) * 0.37 - (totalQualDiv * 0.132)
  const scenC_deductible = Math.min(totalInvIntExpense, niiBefore + scenC_qdElected)
  const scenC_netBenefit = (scenC_deductible - scenA_deductible) * 0.37 - (scenC_qdElected * 0.132)
  const noElectionNeeded = totalInvIntExpense - scenA_deductible === 0
  const bestScenario =
    noElectionNeeded
      ? 'A'
      : scenB_netBenefit >= scenC_netBenefit && scenB_netBenefit > 0
        ? 'B'
        : scenC_netBenefit > 0
          ? 'C'
          : 'A'

  const useQdElected = bestScenario === 'B' ? totalQualDiv : bestScenario === 'C' ? scenC_qdElected : 0
  const finalNii = niiBefore + useQdElected
  const finalDeductible = Math.min(totalInvIntExpense, finalNii)
  const finalCarryforward = totalInvIntExpense - finalDeductible

  return {
    invIntSources,
    totalInvIntExpense,
    invExpSources,
    totalInvExp,
    niiBefore,
    totalQualDiv,
    deductibleInvestmentInterestExpense: finalDeductible,
    disallowedCarryforward: finalCarryforward > 0 ? finalCarryforward : 0,
  }
}

export default function Form4952Preview({
  reviewedK1Docs,
  reviewed1099Docs,
  income1099,
  shortDividendDeduction = 0,
}: Form4952PreviewProps) {
  const computedLines = computeForm4952Lines({
    reviewedK1Docs,
    reviewed1099Docs,
    income1099,
    shortDividendDeduction,
  })

  // ── Gather investment interest expense (already computed) ───────────────
  const invIntSources = computedLines.invIntSources
  const totalInvIntExpense = computedLines.totalInvIntExpense

  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // ── Gather Net Investment Income ─────────────────────────────────────────
  const k1Interest = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '5')), currency(0)).value
  const k1OrdDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6a')), currency(0)).value
  const k1QualDiv = k1Parsed.reduce((acc, { data }) => acc.add(parseK1Field(data, '6b')), currency(0)).value
  const k1NonQualDiv = currency(k1OrdDiv).subtract(k1QualDiv).value

  // Box 11C = Section 1256 contracts (60% LT / 40% ST); treated as NII
  const k1Sec1256 = k1Parsed.reduce(
    (acc, { data }) => acc.add(parseK1Codes(data, '11', ['C'])),
    currency(0),
  ).value

  // Box 20A = investment income per Form 4952 (authoritative figure if present)
  const k1Box20A = k1Parsed.reduce(
    (acc, { data }) => acc.add(parseK1Codes(data, '20', ['A'])),
    currency(0),
  ).value

  // §67(g) suspended investment expenses (Box 13K, 13AE) — shown on Form 4952 Line 5 but not deductible
  type SuspendedLine = { label: string; amount: number }
  const suspendedLines: SuspendedLine[] = []
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    for (const item of data.codes['13'] ?? []) {
      if ((item.code === 'K' || item.code === 'AE') && item.value) {
        const n = parseFloat(item.value)
        if (!isNaN(n) && n !== 0) {
          suspendedLines.push({ label: `${partnerName} — Box 13${item.code} (§67(g) suspended)`, amount: Math.abs(n) })
        }
      }
    }
  }
  // Suspended deductions do NOT reduce NII for §163(d) purposes (federally suspended)
  const totalSuspended = suspendedLines.reduce((acc, l) => acc.add(l.amount), currency(0)).value

  const direct1099Interest = income1099.interestIncome.value
  const direct1099OrdDiv = income1099.dividendIncome.value
  const direct1099QualDiv = income1099.qualifiedDividends.value
  const direct1099NonQualDiv = currency(direct1099OrdDiv).subtract(direct1099QualDiv).value

  // If Box 20A is present, use it as the authoritative NII figure
  const niiBefore = computedLines.niiBefore
  const totalQualDiv = computedLines.totalQualDiv

  if (totalInvIntExpense === 0 && niiBefore === 0) return null

  // ── "No election needed" check ───────────────────────────────────────────
  // When NII (excl. QDs) already exceeds investment interest, full deduction is allowed.
  const scenA_deductible = Math.min(totalInvIntExpense, niiBefore)
  const scenA_carryforward = totalInvIntExpense - scenA_deductible
  const noElectionNeeded = scenA_carryforward === 0

  // ── Election scenarios (only when carryforward exists) ──────────────────
  const scenB_nii = niiBefore + totalQualDiv
  const scenB_deductible = Math.min(totalInvIntExpense, scenB_nii)
  const scenB_carryforward = totalInvIntExpense - scenB_deductible
  const scenB_taxCostElection = totalQualDiv * 0.132
  const scenB_addlDeduction = scenB_deductible - scenA_deductible
  const scenB_taxBenefit = scenB_addlDeduction * 0.37
  const scenB_netBenefit = scenB_taxBenefit - scenB_taxCostElection

  const gapToFill = Math.max(0, totalInvIntExpense - niiBefore)
  const scenC_qdElected = Math.min(totalQualDiv, gapToFill)
  const scenC_nii = niiBefore + scenC_qdElected
  const scenC_deductible = Math.min(totalInvIntExpense, scenC_nii)
  const scenC_carryforward = totalInvIntExpense - scenC_deductible
  const scenC_taxCostElection = scenC_qdElected * 0.132
  const scenC_taxBenefit = (scenC_deductible - scenA_deductible) * 0.37
  const scenC_netBenefit = scenC_taxBenefit - scenC_taxCostElection

  const bestScenario =
    noElectionNeeded
      ? 'A'
      : scenB_netBenefit >= scenC_netBenefit && scenB_netBenefit > 0
        ? 'B'
        : scenC_netBenefit > 0
          ? 'C'
          : 'A'

  // ── NII source lines ─────────────────────────────────────────────────────
  type NiiLine = { label: string; amount: number }
  const niiLines: NiiLine[] = []
  if (k1Box20A > 0) {
    niiLines.push({ label: 'K-1 Box 20A — Investment income (Form 4952)', amount: k1Box20A })
  } else {
    if (k1Interest !== 0) niiLines.push({ label: 'K-1 Box 5 — Interest income', amount: k1Interest })
    if (k1NonQualDiv !== 0) niiLines.push({ label: 'K-1 non-qualified dividends (Box 6a − 6b)', amount: k1NonQualDiv })
    if (k1Sec1256 !== 0) niiLines.push({ label: 'K-1 Box 11C — Sec. 1256 contracts', amount: k1Sec1256 })
  }
  if (direct1099Interest !== 0) niiLines.push({ label: '1099-INT — Interest income', amount: direct1099Interest })
  if (direct1099NonQualDiv !== 0)
    niiLines.push({ label: '1099-DIV — Non-qualified dividends', amount: direct1099NonQualDiv })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 4952 — Investment Interest Expense Deduction</h2>
        <p className="text-xs text-muted-foreground">
          §163(d) limitation — investment interest is only deductible to the extent of net investment income (NII).
          Any excess carries forward indefinitely.
        </p>
      </div>

      <Callout kind="info" title="ℹ What Form 4952 Does">
        <p>
          Investment interest expense is only deductible to the extent of your{' '}
          <strong>net investment income (NII)</strong>. Excess carries forward. You may elect to include qualified
          dividends in NII — but that converts them from preferential (20%+3.8%) to ordinary rates.
        </p>
      </Callout>

      {/* "No election needed" good callout */}
      {noElectionNeeded && (
        <Callout
          kind="good"
          title={`✓ Full ${fmtAmt(totalInvIntExpense)} Deductible — No QD Election Needed`}
        >
          <p>
            NII of <strong>{fmtAmt(niiBefore)}</strong> already exceeds investment interest expense of{' '}
            <strong>{fmtAmt(totalInvIntExpense)}</strong>. The full deduction is allowed without electing to
            include qualified dividends in NII. QDs retain their 23.8% preferential rate. No carryforward.
          </p>
        </Callout>
      )}

      {/* Part I and Part II side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Part I — Investment Interest Expense */}
        <FormBlock title="Part I — Total Investment Interest Expense">
          {invIntSources.map((src, i) => (
            <FormLine
              key={i}
              boxRef={`L.${i === 0 ? '1a' : `1${String.fromCharCode(97 + i)}`}`}
              label={src.label}
              value={src.amount}
            />
          ))}
          {invIntSources.length === 0 && <FormLine label="No investment interest sources found" raw="—" />}
          <FormLine boxRef="L.2" label="Prior-year disallowed carryforward" raw="Check prior return" />
          <FormTotalLine label="Line 3 — Total investment interest" value={-totalInvIntExpense} />
        </FormBlock>

        {/* Part II — NII */}
        <FormBlock title="Part II — Net Investment Income (no QD election)">
          {niiLines.map((line, i) => (
            <FormLine key={i} boxRef="L.4a" label={line.label} value={line.amount} />
          ))}
          {niiLines.length === 0 && <FormLine label="No NII sources found in reviewed documents" raw="—" />}
          {computedLines.invExpSources.length > 0 && (
            <>
              {computedLines.invExpSources.map((line, i) => (
                <FormLine
                  key={`invexp-${i}`}
                  boxRef="L.5"
                  label={line.label}
                  value={line.amount}
                />
              ))}
              <FormLine
                boxRef="L.5"
                label={
                  <span className="italic text-muted-foreground text-[10px]">
                    Box 20B expenses reduce NII (Form 4952 Part II Line 5)
                  </span>
                }
                raw=""
              />
            </>
          )}
          {suspendedLines.length > 0 && (
            <>
              {suspendedLines.map((line, i) => (
                <FormLine
                  key={`susp-${i}`}
                  boxRef="L.5"
                  label={
                    <span>
                      {line.label}{' '}
                      <span className="text-[10px] text-muted-foreground">(federally suspended §67(g))</span>
                    </span>
                  }
                  raw={`(${fmtAmt(Math.abs(line.amount))})`}
                />
              ))}
              <FormLine
                boxRef="L.5"
                label={
                  <span className="italic text-muted-foreground">
                    Note: §67(g) items shown but not deducted (TCJA suspension through 2025)
                  </span>
                }
                raw={fmtAmt(totalSuspended)}
              />
            </>
          )}
          <FormTotalLine label="Line 4e — NII (no QD election)" value={niiBefore} />
        </FormBlock>
      </div>

      {/* QD Election analysis — only when election might help */}
      {!noElectionNeeded && totalQualDiv > 0 && (
        <>
          <div>
            <h3 className="text-sm font-semibold mb-2">Election Analysis: Include Qualified Dividends in NII?</h3>
            <div className="border rounded-lg overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="text-xs h-8">Scenario</TableHead>
                    <TableHead className="text-xs h-8 text-right">NII</TableHead>
                    <TableHead className="text-xs h-8 text-right">Deductible</TableHead>
                    <TableHead className="text-xs h-8 text-right">Carryforward</TableHead>
                    <TableHead className="text-xs h-8 text-right">Election Cost</TableHead>
                    <TableHead className="text-xs h-8 text-right">Net Benefit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className={bestScenario === 'A' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="py-2">
                      <div className="font-semibold">A — No QD election</div>
                      <div className="text-muted-foreground text-[10px]">QDs taxed at 23.8% (20%+3.8% NIIT)</div>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{fmtAmt(niiBefore)}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                      {fmtAmt(scenA_deductible)}
                    </TableCell>
                    <TableCell
                      className={`py-2 text-right font-mono tabular-nums ${scenA_carryforward > 0 ? 'text-destructive' : ''}`}
                    >
                      {scenA_carryforward > 0 ? `(${fmtAmt(scenA_carryforward)})` : '$0'}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">$0</TableCell>
                    <TableCell
                      className={`py-2 text-right font-mono tabular-nums ${scenA_carryforward > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {scenA_carryforward > 0 ? `(${fmtAmt(scenA_carryforward)}) lost` : 'Break-even'}
                    </TableCell>
                  </TableRow>

                  <TableRow className={bestScenario === 'B' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="py-2">
                      <div className="font-semibold">B — Full QD election {bestScenario === 'B' ? '★' : ''}</div>
                      <div className="text-muted-foreground text-[10px]">
                        All {fmtAmt(totalQualDiv)} QDs reclassified as ordinary (37%)
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{fmtAmt(scenB_nii)}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                      {fmtAmt(scenB_deductible)}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">
                      {scenB_carryforward > 0 ? `(${fmtAmt(scenB_carryforward)})` : '$0'}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                      {scenB_taxCostElection > 0 ? `(${fmtAmt(scenB_taxCostElection)})` : '$0'}
                    </TableCell>
                    <TableCell
                      className={`py-2 text-right font-mono tabular-nums font-semibold ${scenB_netBenefit > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'}`}
                    >
                      {scenB_netBenefit >= 0 ? '+' : ''}
                      {fmtAmt(scenB_netBenefit)} net savings
                    </TableCell>
                  </TableRow>

                  {scenC_qdElected > 0 && scenC_qdElected < totalQualDiv && (
                    <TableRow className={bestScenario === 'C' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                      <TableCell className="py-2">
                        <div className="font-semibold">C — Partial QD election {bestScenario === 'C' ? '★' : ''}</div>
                        <div className="text-muted-foreground text-[10px]">
                          Elect {fmtAmt(scenC_qdElected)} to cover gap exactly
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">{fmtAmt(scenC_nii)}</TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">
                        {fmtAmt(scenC_deductible)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">$0</TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                        {scenC_taxCostElection > 0 ? `(${fmtAmt(scenC_taxCostElection)})` : '$0'}
                      </TableCell>
                      <TableCell
                        className={`py-2 text-right font-mono tabular-nums font-semibold ${scenC_netBenefit > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'}`}
                      >
                        {scenC_netBenefit >= 0 ? '+' : ''}
                        {fmtAmt(scenC_netBenefit)} net savings
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {bestScenario !== 'A' && (
            <Callout
              kind="good"
              title={`✓ Recommendation: ${bestScenario === 'B' ? 'Full' : 'Partial'} QD Election (Scenario ${bestScenario})`}
            >
              <p>
                Scenario {bestScenario} generates an estimated net tax savings of{' '}
                <strong>{fmtAmt(bestScenario === 'B' ? scenB_netBenefit : scenC_netBenefit)}</strong>.
                {bestScenario === 'B'
                  ? ` The cost of reclassifying ${fmtAmt(totalQualDiv)} in QDs from 23.8% to 37% is ~${fmtAmt(scenB_taxCostElection)}, but unlocking the full ${fmtAmt(totalInvIntExpense)} deduction at 37% yields ~${fmtAmt(totalInvIntExpense * 0.37)}.`
                  : ` Electing only ${fmtAmt(scenC_qdElected)} in QDs covers the gap exactly with minimal rate cost.`}
              </p>
              <p>Confirm with your prior-year carryforward balance before filing.</p>
            </Callout>
          )}
          {bestScenario === 'A' && scenA_carryforward > 0 && (
            <Callout kind="warn" title="⚠ Investment Interest Limited — Consider QD Election">
              <p>
                Without the QD election, {fmtAmt(scenA_carryforward)} of investment interest expense is disallowed
                and carries forward to next year. The QD election would unlock additional deductions but converts
                preferential dividend rates to ordinary rates. Run both scenarios with your preparer.
              </p>
            </Callout>
          )}
        </>
      )}

      {/* Final form lines */}
      {(() => {
        const useQdElected = bestScenario === 'B' ? totalQualDiv : bestScenario === 'C' ? scenC_qdElected : 0
        const finalNii = niiBefore + useQdElected
        const finalDeductible = Math.min(totalInvIntExpense, finalNii)
        const finalCarryforward = totalInvIntExpense - finalDeductible

        return (
          <FormBlock
            title={`Form 4952 — Final Lines (Scenario ${bestScenario}${useQdElected > 0 ? `, QD election: ${fmtAmt(useQdElected)}` : ''})`}
          >
            <FormLine boxRef="L.3" label="Total investment interest expense" value={-totalInvIntExpense} />
            <FormLine boxRef="L.4a" label="Gross investment income (excl. QDs)" value={niiBefore} />
            {useQdElected > 0 && (
              <FormLine boxRef="L.4b" label="Qualified dividends elected into NII" value={useQdElected} />
            )}
            {suspendedLines.length > 0 && (
              <FormLine
                boxRef="L.5"
                label={
                  <span>
                    Investment expenses{' '}
                    <span className="text-[10px] text-muted-foreground">(§67(g) suspended — not deducted)</span>
                  </span>
                }
                raw={`(${fmtAmt(Math.abs(totalSuspended))})`}
              />
            )}
            <FormLine boxRef="L.4e" label="Net investment income" value={finalNii} />
            <FormTotalLine label="Line 6 — Deductible investment interest expense" value={finalDeductible} double />
            <FormLine
              boxRef="L.7"
              label="Disallowed — carryforward to next year"
              value={finalCarryforward > 0 ? finalCarryforward : 0}
            />
          </FormBlock>
        )
      })()}

      <Callout kind="warn" title="⚠ Where This Flows on the Return">
        <p>
          <strong>K-1 Box 13H investment interest:</strong> Deductible portion flows to Schedule E, Part II as a
          nonpassive loss (for trader partnerships). Check your K-1 footnotes for specific instructions.
        </p>
        <p>
          <strong>Margin interest (brokerage):</strong> Flows to Schedule A (itemized deductions). Only beneficial if
          you itemize. This component only reflects investment interest from reviewed K-1 documents — add any brokerage
          margin interest from 1099 supplemental statements.
        </p>
        <p>
          <strong>Note:</strong> Investment interest cannot offset Net Investment Income Tax (§1411 NIIT). The §163(d)
          deduction only reduces regular income tax.
        </p>
      </Callout>
    </div>
  )
}
