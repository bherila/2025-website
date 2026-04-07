'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Value helpers ─────────────────────────────────────────────────────────────

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
      return acc + (isNaN(n) ? 0 : n)
    }, 0)
}

function fmt(n: number, precision = 0): string {
  const abs = currency(Math.abs(n), { precision }).format()
  return n < 0 ? `(${abs})` : abs
}

// ── Primitive display components ──────────────────────────────────────────────

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b">{title}</div>
      <div className="divide-y divide-dashed divide-border/50">{children}</div>
    </div>
  )
}

function FormLine({
  lineRef,
  label,
  value,
  raw,
}: {
  lineRef?: string
  label: React.ReactNode
  value?: number | null
  raw?: string
}) {
  const cls =
    value === undefined || value === null ? '' : value < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0 select-none">{lineRef ?? ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <span className={`font-mono tabular-nums text-[13px] shrink-0 ${cls}`}>
        {raw ?? (value === undefined || value === null ? '—' : fmt(value))}
      </span>
    </div>
  )
}

function FormTotalLine({ label, value, double }: { label: string; value: number; double?: boolean }) {
  const cls = value < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 font-semibold bg-muted/20 ${double ? 'border-t-2 border-double border-border' : 'border-t border-border'}`}
    >
      <span className="w-10 shrink-0" />
      <span className="flex-1 text-[13px]">{label}</span>
      <span className={`font-mono tabular-nums text-[13px] ${cls}`}>{fmt(value)}</span>
    </div>
  )
}

function Callout({
  kind,
  title,
  children,
}: {
  kind: 'info' | 'warn' | 'good'
  title: string
  children: React.ReactNode
}) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300',
    warn: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300',
    good: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300',
  }
  return (
    <div className={`border rounded-lg p-3 space-y-1 ${styles[kind]}`}>
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-xs leading-relaxed space-y-1">{children}</div>
    </div>
  )
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
}

export default function Form4952Preview({
  reviewedK1Docs,
  reviewed1099Docs,
  income1099,
}: Form4952PreviewProps) {
  // ── Gather investment interest expense ───────────────────────────────────
  // K-1 Box 13H = investment interest expense; Box 13G = deductions—royalty income
  // Per IRS instructions, only code H is "investment interest expense" for Form 4952.
  // Some partnerships use code G for investment interest — include both.
  type InvIntSource = { label: string; amount: number }
  const invIntSources: InvIntSource[] = []

  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  for (const { doc, data } of k1Parsed) {
    const partnerName = data.fields['B']?.value?.split('\n')[0]
      ?? doc.employment_entity?.display_name
      ?? 'Partnership'
    // Box 13H items (investment interest expense)
    const hItems = (data.codes['13'] ?? []).filter((item) => item.code === 'H')
    for (const item of hItems) {
      const n = parseFloat(item.value)
      if (!isNaN(n) && n !== 0) {
        invIntSources.push({ label: `${partnerName} — Box 13H`, amount: n })
      }
    }
    // Box 13G items (some funds report investment interest under G)
    const gItems = (data.codes['13'] ?? []).filter((item) => item.code === 'G')
    for (const item of gItems) {
      const n = parseFloat(item.value)
      if (!isNaN(n) && n !== 0) {
        invIntSources.push({ label: `${partnerName} — Box 13G`, amount: n })
      }
    }
  }

  // Margin interest from 1099-MISC / supplemental data (box 5 = investment expenses on some forms)
  // Also check payer_name for known brokers
  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? ''
    // 1099-INT box 5 = investment expenses (not margin interest, but related)
    const invExp = p?.box5_investment_expense
    if (typeof invExp === 'number' && invExp !== 0) {
      invIntSources.push({ label: `${payer} — 1099-INT Box 5 (investment expense)`, amount: -Math.abs(invExp) })
    }
  }

  const totalInvInt = invIntSources.reduce((acc, s) => acc + s.amount, 0)
  // Treat negative values as expense amounts (deductions carry negative sign from Box 13)
  const totalInvIntExpense = Math.abs(totalInvInt)

  // ── Gather Net Investment Income ─────────────────────────────────────────
  // NII = interest + non-qualified dividends (ordinary - qualified) from all sources

  // From K-1s
  const k1Interest = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '5'), 0)
  const k1OrdDiv = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '6a'), 0)
  const k1QualDiv = k1Parsed.reduce((acc, { data }) => acc + parseK1Field(data, '6b'), 0)
  const k1NonQualDiv = k1OrdDiv - k1QualDiv
  // Box 11C = Sec. 1256 contracts (NII), Box 11ZZ items that are NII, etc.
  // We'll keep it simple: interest + non-qual dividends + Sec. 1256
  const k1Sec1256 = parseK1Codes(k1Parsed[0]?.data ?? { codes: {}, fields: {} } as FK1StructuredData, '11', ['C'])

  // From 1099 docs
  const direct1099Interest = income1099.interestIncome.value
  const direct1099OrdDiv = income1099.dividendIncome.value
  const direct1099QualDiv = income1099.qualifiedDividends.value
  const direct1099NonQualDiv = direct1099OrdDiv - direct1099QualDiv

  // Gross NII excluding qualified dividends
  const niiBefore =
    k1Interest +
    k1NonQualDiv +
    k1Sec1256 +
    direct1099Interest +
    direct1099NonQualDiv

  // Total qualified dividends (for election analysis)
  const totalQualDiv = k1QualDiv + direct1099QualDiv

  // ── Skip rendering if no investment interest ─────────────────────────────
  if (totalInvIntExpense === 0 && niiBefore === 0) return null

  // ── Election scenarios ───────────────────────────────────────────────────
  // Scenario A: No QD election
  const scenA_nii = niiBefore
  const scenA_deductible = Math.min(totalInvIntExpense, scenA_nii)
  const scenA_carryforward = totalInvIntExpense - scenA_deductible

  // Scenario B: Full QD election (all qualified divs included in NII)
  const scenB_nii = niiBefore + totalQualDiv
  const scenB_deductible = Math.min(totalInvIntExpense, scenB_nii)
  const scenB_carryforward = totalInvIntExpense - scenB_deductible
  // Tax cost of reclassifying QDs from 23.8% preferential to 37% ordinary
  // Incremental cost = elected_QDs × (37% - 23.8%) = elected_QDs × 13.2%
  const scenB_qdElected = Math.min(totalQualDiv, Math.max(0, totalInvIntExpense - niiBefore))
  // The actual QDs reclassified in scenario B is all of them (full election)
  const scenB_taxCostElection = totalQualDiv * 0.132 // 37% - 23.8%
  // Benefit = additional deduction at 37%
  const scenB_addlDeduction = scenB_deductible - scenA_deductible
  const scenB_taxBenefit = scenB_addlDeduction * 0.37
  const scenB_netBenefit = scenB_taxBenefit - scenB_taxCostElection

  // Scenario C: Partial QD election (elect just enough to cover the gap)
  const gapToFill = Math.max(0, totalInvIntExpense - niiBefore)
  const scenC_qdElected = Math.min(totalQualDiv, gapToFill)
  const scenC_nii = niiBefore + scenC_qdElected
  const scenC_deductible = Math.min(totalInvIntExpense, scenC_nii)
  const scenC_carryforward = totalInvIntExpense - scenC_deductible
  const scenC_taxCostElection = scenC_qdElected * 0.132
  const scenC_taxBenefit = (scenC_deductible - scenA_deductible) * 0.37
  const scenC_netBenefit = scenC_taxBenefit - scenC_taxCostElection

  // Best scenario
  const bestScenario = scenB_netBenefit >= scenC_netBenefit && scenB_netBenefit > 0
    ? 'B'
    : scenC_netBenefit > 0
      ? 'C'
      : 'A'

  // ── NII line items for display ───────────────────────────────────────────
  type NiiLine = { label: string; amount: number }
  const niiLines: NiiLine[] = []
  if (k1Interest !== 0) {
    niiLines.push({ label: `K-1 Box 5 — Interest income`, amount: k1Interest })
  }
  if (k1NonQualDiv !== 0) {
    niiLines.push({ label: `K-1 non-qualified dividends (Box 6a − 6b)`, amount: k1NonQualDiv })
  }
  if (k1Sec1256 !== 0) {
    niiLines.push({ label: `K-1 Box 11C — Sec. 1256 contracts`, amount: k1Sec1256 })
  }
  if (direct1099Interest !== 0) {
    niiLines.push({ label: `1099-INT — Interest income`, amount: direct1099Interest })
  }
  if (direct1099NonQualDiv !== 0) {
    niiLines.push({ label: `1099-DIV — Non-qualified dividends`, amount: direct1099NonQualDiv })
  }

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
          <strong>net investment income (NII)</strong>. Excess carries forward. You may elect to include
          qualified dividends in NII — but that converts them from preferential (20%+3.8%) to ordinary rates.
        </p>
      </Callout>

      {/* Part I and Part II side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Part I — Investment Interest Expense */}
        <FormBlock title="Part I — Total Investment Interest Expense">
          {invIntSources.map((src, i) => (
            <FormLine
              key={i}
              lineRef={`L.${i === 0 ? '1a' : `1${String.fromCharCode(97 + i)}`}`}
              label={src.label}
              value={src.amount}
            />
          ))}
          {invIntSources.length === 0 && (
            <FormLine label="No investment interest sources found" raw="—" />
          )}
          <FormLine lineRef="L.2" label="Prior-year disallowed carryforward" raw="Check prior return" />
          <FormTotalLine label="Line 3 — Total investment interest" value={-totalInvIntExpense} />
        </FormBlock>

        {/* Part II — NII (no QD election baseline) */}
        <FormBlock title="Part II — Net Investment Income (no QD election)">
          {niiLines.map((line, i) => (
            <FormLine key={i} lineRef="L.4a" label={line.label} value={line.amount} />
          ))}
          {niiLines.length === 0 && (
            <FormLine label="No NII sources found in reviewed documents" raw="—" />
          )}
          <FormTotalLine label="Line 4e — NII (no QD election)" value={niiBefore} />
        </FormBlock>
      </div>

      {/* QD Election analysis — only show if there are qualified dividends */}
      {totalQualDiv > 0 && (
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
                  {/* Scenario A */}
                  <TableRow className={bestScenario === 'A' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="py-2">
                      <div className="font-semibold">A — No QD election</div>
                      <div className="text-muted-foreground text-[10px]">QDs taxed at 23.8% (20%+3.8% NIIT)</div>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{fmt(scenA_nii)}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">{fmt(scenA_deductible)}</TableCell>
                    <TableCell className={`py-2 text-right font-mono tabular-nums ${scenA_carryforward > 0 ? 'text-destructive' : ''}`}>
                      {scenA_carryforward > 0 ? `(${fmt(scenA_carryforward)})` : '$0'}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">$0</TableCell>
                    <TableCell className={`py-2 text-right font-mono tabular-nums ${scenA_carryforward > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {scenA_carryforward > 0 ? `(${fmt(scenA_carryforward)}) lost` : 'Break-even'}
                    </TableCell>
                  </TableRow>

                  {/* Scenario B */}
                  <TableRow className={bestScenario === 'B' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="py-2">
                      <div className="font-semibold">B — Full QD election {bestScenario === 'B' ? '★' : ''}</div>
                      <div className="text-muted-foreground text-[10px]">
                        All {fmt(totalQualDiv)} QDs reclassified as ordinary (37%)
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">{fmt(scenB_nii)}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">{fmt(scenB_deductible)}</TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums">
                      {scenB_carryforward > 0 ? `(${fmt(scenB_carryforward)})` : '$0'}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                      {scenB_taxCostElection > 0 ? `(${fmt(scenB_taxCostElection)})` : '$0'}
                    </TableCell>
                    <TableCell className={`py-2 text-right font-mono tabular-nums font-semibold ${scenB_netBenefit > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'}`}>
                      {scenB_netBenefit >= 0 ? '+' : ''}{fmt(scenB_netBenefit)} net savings
                    </TableCell>
                  </TableRow>

                  {/* Scenario C — only show if partial election is meaningful */}
                  {scenC_qdElected > 0 && scenC_qdElected < totalQualDiv && (
                    <TableRow className={bestScenario === 'C' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}>
                      <TableCell className="py-2">
                        <div className="font-semibold">C — Partial QD election {bestScenario === 'C' ? '★' : ''}</div>
                        <div className="text-muted-foreground text-[10px]">
                          Elect {fmt(scenC_qdElected)} to cover gap exactly
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">{fmt(scenC_nii)}</TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-500">{fmt(scenC_deductible)}</TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums">$0</TableCell>
                      <TableCell className="py-2 text-right font-mono tabular-nums text-destructive">
                        {scenC_taxCostElection > 0 ? `(${fmt(scenC_taxCostElection)})` : '$0'}
                      </TableCell>
                      <TableCell className={`py-2 text-right font-mono tabular-nums font-semibold ${scenC_netBenefit > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'}`}>
                        {scenC_netBenefit >= 0 ? '+' : ''}{fmt(scenC_netBenefit)} net savings
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Recommendation callout */}
          {bestScenario !== 'A' && (
            <Callout
              kind="good"
              title={`✓ Recommendation: ${bestScenario === 'B' ? 'Full' : 'Partial'} QD Election (Scenario ${bestScenario})`}
            >
              <p>
                Scenario {bestScenario} generates an estimated net tax savings of{' '}
                <strong>{fmt(bestScenario === 'B' ? scenB_netBenefit : scenC_netBenefit)}</strong>.
                {bestScenario === 'B'
                  ? ` The cost of reclassifying ${fmt(totalQualDiv)} in QDs from 23.8% to 37% is ~${fmt(scenB_taxCostElection)}, but unlocking the full ${fmt(totalInvIntExpense)} deduction at 37% yields ~${fmt(totalInvIntExpense * 0.37)}.`
                  : ` Electing only ${fmt(scenC_qdElected)} in QDs covers the gap exactly with minimal rate cost.`}
              </p>
              <p>Confirm with your prior-year carryforward balance before filing.</p>
            </Callout>
          )}
          {bestScenario === 'A' && scenA_carryforward > 0 && (
            <Callout kind="warn" title="⚠ Investment Interest Limited — Consider QD Election">
              <p>
                Without the QD election, {fmt(scenA_carryforward)} of investment interest expense is disallowed
                and carries forward to next year. The QD election would unlock additional deductions but converts
                preferential dividend rates to ordinary rates. Run both scenarios with your preparer.
              </p>
            </Callout>
          )}
        </>
      )}

      {/* Final form lines with best scenario */}
      {(() => {
        const useQdElected =
          bestScenario === 'B' ? totalQualDiv : bestScenario === 'C' ? scenC_qdElected : 0
        const finalNii = niiBefore + useQdElected
        const finalDeductible = Math.min(totalInvIntExpense, finalNii)
        const finalCarryforward = totalInvIntExpense - finalDeductible

        return (
          <FormBlock
            title={`Form 4952 — Final Lines (Scenario ${bestScenario}${useQdElected > 0 ? `, QD election: ${fmt(useQdElected)}` : ''})`}
          >
            <FormLine lineRef="L.3" label="Total investment interest expense" value={-totalInvIntExpense} />
            <FormLine lineRef="L.4a" label="Gross investment income (excl. QDs)" value={niiBefore} />
            {useQdElected > 0 && (
              <FormLine lineRef="L.4b" label="Qualified dividends elected into NII" value={useQdElected} />
            )}
            <FormLine lineRef="L.4e" label="Net investment income" value={finalNii} />
            <FormTotalLine label="Line 6 — Deductible investment interest expense" value={finalDeductible} double />
            <FormLine
              lineRef="L.7"
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
          <strong>Margin interest (brokerage):</strong> Flows to Schedule A (itemized deductions). Only beneficial
          if you itemize. This component only reflects investment interest from reviewed K-1 documents — add any
          brokerage margin interest from 1099 supplemental statements.
        </p>
        <p>
          <strong>Note:</strong> Investment interest cannot offset Net Investment Income Tax (§1411 NIIT). The
          §163(d) deduction only reduces regular income tax.
        </p>
      </Callout>
    </div>
  )
}
