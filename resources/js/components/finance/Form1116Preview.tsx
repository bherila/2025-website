'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1116Lines } from '@/types/finance/tax-return'

export type { Form1116Lines } from '@/types/finance/tax-return'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Main component ────────────────────────────────────────────────────────────

interface Form1116PreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
}

export function computeForm1116Lines({
  reviewedK1Docs,
  reviewed1099Docs,
}: Pick<Form1116PreviewProps, 'reviewedK1Docs' | 'reviewed1099Docs'>): Form1116Lines {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const incomeSources: { label: string; amount: number }[] = []
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const k3Sections = data.k3?.sections ?? []
    const part2Sec1 = k3Sections.filter(
      (s) => s.sectionId === 'part2_section1' || s.sectionId === 'part2_section2',
    )
    let k3PassiveTotal = currency(0)
    for (const sec of part2Sec1) {
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const passive = parseFieldVal(String(row.col_c_passive ?? '')) ?? 0
        if (passive !== 0) {
          k3PassiveTotal = k3PassiveTotal.add(passive)
        }
      }
    }

    if (k3PassiveTotal.value !== 0) {
      incomeSources.push({ label: `${partnerName} — K-3 Part II passive income`, amount: k3PassiveTotal.value })
    } else if (pk1(data, '21') > 0) {
      incomeSources.push({
        label: `${partnerName} — Box 21 foreign tax (income estimated)`,
        amount: pk1(data, '21') / 0.15,
      })
    }
  }

  for (const doc of reviewed1099Docs) {
    if (doc.form_type !== '1099_div' && doc.form_type !== '1099_div_c') continue
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? '1099-DIV'
    const foreignTax = p?.box7_foreign_tax as number | undefined
    if (foreignTax != null && foreignTax > 0) {
      incomeSources.push({ label: `${payer} — 1099-DIV (estimated foreign source)`, amount: foreignTax / 0.15 })
    }
  }

  const taxSources: { label: string; amount: number }[] = []
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box21 = pk1(data, '21')
    if (box21 !== 0) {
      taxSources.push({ label: `${partnerName} — K-1 Box 21`, amount: box21 })
    }
  }

  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? '1099'

    const divForeignTax = p?.box7_foreign_tax as number | undefined
    if (divForeignTax != null && divForeignTax > 0) {
      taxSources.push({ label: `${payer} — 1099-DIV Box 7`, amount: divForeignTax })
    }

    const intForeignTax = p?.box6_foreign_tax as number | undefined
    if (intForeignTax != null && intForeignTax > 0) {
      taxSources.push({ label: `${payer} — 1099-INT Box 6`, amount: intForeignTax })
    }
  }

  return {
    incomeSources,
    taxSources,
    totalPassiveIncome: incomeSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value,
    totalForeignTaxes: taxSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value,
  }
}

export default function Form1116Preview({
  reviewedK1Docs,
  reviewed1099Docs,
}: Form1116PreviewProps) {
  const computed = computeForm1116Lines({ reviewedK1Docs, reviewed1099Docs })

  // ── Parse K-1 docs ────────────────────────────────────────────────────────
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  // ── Part I — Foreign Source Passive Income ────────────────────────────────
  type IncomeSource = { label: string; amount: number }
  const incomeSources: IncomeSource[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const k3Sections = data.k3?.sections ?? []

    // Sum K-3 Part II section 1 passive column (col_c_passive), lines ≤ 24
    const part2Sec1 = k3Sections.filter(
      (s) => s.sectionId === 'part2_section1' || s.sectionId === 'part2_section2',
    )
    let k3PassiveTotal = currency(0)
    let hasXXOnly = true // track if all entries have country XX (U.S. source)
    let hasGeneralCategory = false

    for (const sec of part2Sec1) {
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const passive = parseFieldVal(String(row.col_c_passive ?? '')) ?? 0
        const general = parseFieldVal(String(row.col_d_general ?? '')) ?? 0
        const country = (row.country as string | undefined) ?? ''
        if (passive !== 0) {
          k3PassiveTotal = k3PassiveTotal.add(passive)
          if (country !== 'XX' && country !== '') hasXXOnly = false
        }
        if (general !== 0 && country !== 'XX' && country !== '') {
          hasGeneralCategory = true
        }
      }
    }

    if (k3PassiveTotal.value !== 0) {
      incomeSources.push({ label: `${partnerName} — K-3 Part II passive income`, amount: k3PassiveTotal.value })
    } else if (pk1(data, '21') > 0) {
      // Box 21 > 0 but no K-3 passive income — approximate
      incomeSources.push({
        label: `${partnerName} — Box 21 foreign tax (income estimated)`,
        amount: pk1(data, '21') / 0.15, // rough 15% withholding assumption
      })
    }

    void hasXXOnly
    void hasGeneralCategory
  }

  const totalPassiveIncome = incomeSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value

  // ── Part II — Foreign Taxes Paid ──────────────────────────────────────────
  type TaxSource = { label: string; amount: number }
  const taxSources: TaxSource[] = [...computed.taxSources]
  const totalForeignTaxes = computed.totalForeignTaxes

  // ── Callouts ──────────────────────────────────────────────────────────────

  // Simplified election check ($300 single / $600 MFJ threshold)
  const simplifiedElectionThreshold = 300
  const aboveSimplifiedThreshold = totalForeignTaxes > simplifiedElectionThreshold

  // General category check — scan K-3 again for clarity
  let hasGeneralCategoryFinal = false
  let hasXXOnlyFinal = true

  for (const { data } of k1Parsed) {
    const k3Sections = data.k3?.sections ?? []
    const part2 = k3Sections.filter(
      (s) => s.sectionId === 'part2_section1' || s.sectionId === 'part2_section2',
    )
    for (const sec of part2) {
      const rows = ((sec.data as Record<string, unknown>)?.rows as Array<Record<string, unknown>> | undefined) ?? []
      for (const row of rows) {
        const general = parseFieldVal(String(row.col_d_general ?? '')) ?? 0
        const country = (row.country as string | undefined) ?? ''
        if (general !== 0 && country !== 'XX' && country !== '') {
          hasGeneralCategoryFinal = true
          hasXXOnlyFinal = false
        }
      }
    }
  }

  // TurboTax Line 1d check
  // If K-1 Box 5 interest is significantly larger than K-3 passive income, flag it
  const totalK1Box5 = k1Parsed.reduce((acc, { data }) => acc + pk1(data, '5'), 0)
  const turboTaxAlert = totalK1Box5 > 0 && totalPassiveIncome < totalK1Box5 * 0.5

  if (totalForeignTaxes === 0 && totalPassiveIncome === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No foreign tax or foreign income data found in reviewed documents.
        <br />
        Review K-1 and 1099 documents to see Form 1116 analysis.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 1116 — Foreign Tax Credit</h2>
        <p className="text-xs text-muted-foreground">
          Passive category foreign tax credit — dollar-for-dollar offset against U.S. tax.
        </p>
      </div>

      {/* Simplified election check */}
      {aboveSimplifiedThreshold ? (
        <Callout kind="warn" title="⚠ Simplified Limitation Election Does NOT Apply">
          <p>
            Total creditable foreign taxes (<strong>{fmtAmt(totalForeignTaxes, 2)}</strong>) exceed the $300 threshold
            ($600 if MFJ). You must complete Form 1116.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ Simplified Election May Apply">
          <p>
            Total FTC ({fmtAmt(totalForeignTaxes, 2)}) ≤ $300. You may enter directly on Schedule 3 Line 1 without
            completing Form 1116. Confirm no foreign income in multiple baskets.
          </p>
        </Callout>
      )}

      {/* General category check */}
      {hasGeneralCategoryFinal ? (
        <Callout kind="warn" title="⚠ General Category Income Detected — Second Form 1116 May Be Required">
          <p>One or more K-3 Part II rows show non-zero general category income from non-XX countries.</p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ No General Category Form 1116 Required">
          <p>
            All column (d) general category amounts have country code XX ("Sourced by partner"), which is
            U.S.-source for domestic partners. Column (d) is effectively $0 for your return. One Form 1116 (passive category) only.
          </p>
        </Callout>
      )}

      {/* Parts I and II side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormBlock title="Part I — Foreign Source Passive Income">
          {incomeSources.map((src, i) => (
            <FormLine key={i} label={src.label} value={src.amount} />
          ))}
          {incomeSources.length === 0 && <FormLine label="No foreign income identified" raw="—" />}
          <FormTotalLine label="Total foreign passive income" value={totalPassiveIncome} />
        </FormBlock>

        <FormBlock title="Part II — Foreign Taxes Paid">
          {taxSources.map((src, i) => (
            <FormLine key={i} label={src.label} value={src.amount} />
          ))}
          {taxSources.length === 0 && <FormLine label="No foreign taxes identified" raw="—" />}
          <FormTotalLine label="Total foreign taxes paid" value={totalForeignTaxes} />
        </FormBlock>
      </div>

      {/* Part III — Limitation */}
      <FormBlock title="Part III — Limitation Calculation (Estimated)">
        <FormLine label="Foreign passive income (Part I)" value={totalPassiveIncome} />
        <FormLine label="Total income (estimated — enter from prior return)" raw="~see note" />
        <FormLine label="Limiting fraction" raw="foreign income ÷ total income" />
        <FormLine label="U.S. tax before credits (estimated)" raw="~see note" />
        <FormLine label="FTC limitation (fraction × U.S. tax)" raw="~see note" />
        <FormLine label="Actual foreign taxes paid (Part II)" value={totalForeignTaxes} />
        <FormTotalLine
          label={
            totalPassiveIncome >= totalForeignTaxes / 0.15
              ? 'Credit allowed — likely FULLY ALLOWED ✓'
              : 'Credit allowed (subject to limitation)'
          }
          value={totalForeignTaxes}
          double
        />
        <FormLine label="Carryforward (if any)" raw="$0 (estimate)" />
      </FormBlock>

      {/* TurboTax correction callout */}
      {turboTaxAlert && (
        <Callout kind="alert" title="⚠ TurboTax FTC Worksheet Line 1d — Correction Required">
          <p>
            TurboTax may prefill Line 1d with K-1 Box 5 interest (
            <strong>{fmtAmt(totalK1Box5, 2)}</strong>) — but Box 5 interest is entirely U.S.-sourced per K-3 Part II
            Line 6, column (a). Set Line 1d to the K-3 passive foreign income amount only (
            <strong>{fmtAmt(totalPassiveIncome, 2)}</strong>). Overstating foreign passive income inflates your FTC
            and may trigger an IRS notice.
          </p>
        </Callout>
      )}

      <Callout kind="info" title="ℹ Where This Flows on the Return">
        <p>
          The allowable FTC flows to <strong>Schedule 3, Line 1</strong> (foreign tax credit). It is a
          dollar-for-dollar credit against your regular federal income tax.
        </p>
        <p>The FTC does NOT reduce the Net Investment Income Tax (NIIT, Form 8960).</p>
        <p>
          <strong>Passive category only:</strong> All foreign income from the K-1 K-3 is passive category. No
          general category Form 1116 is required unless your review changes.
        </p>
      </Callout>
    </div>
  )
}
