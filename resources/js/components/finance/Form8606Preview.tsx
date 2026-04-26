'use client'

import currency from 'currency.js'

import { Callout, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form1099RParsedData, TaxDocument } from '@/types/finance/tax-document'

/** Distribution codes that denote a Roth conversion (Box 7). */
const ROTH_CONVERSION_CODES = new Set(['2', '7', 'G'])

export interface Form8606Inputs {
  /** Current-year nondeductible traditional IRA contributions (user-entered). */
  nondeductibleContributions: number
  /** Prior-year (end of last year) total basis in traditional/SEP/SIMPLE IRAs. */
  priorYearBasis: number
  /** Total year-end fair-market value of all traditional/SEP/SIMPLE IRAs. */
  yearEndFmv: number
  /** Reviewed 1099-R documents for the year — used to identify conversions + distributions. */
  reviewed1099RDocs: TaxDocument[]
}

export interface Form8606Lines {
  line1_nondeductibleContributions: number
  line2_priorYearBasis: number
  line3_totalBasis: number
  /** Line 6 = year-end FMV of traditional IRAs. */
  line6_yearEndFmv: number
  /** Line 7 = distributions other than conversions. */
  line7_distributionsNotConverted: number
  /** Line 8 = amount converted to Roth during the year. */
  line8_convertedToRoth: number
  /** Line 9 = lines 6 + 7 + 8. */
  line9_total: number
  /** Line 10 = line 3 / line 9 (as a ratio, rounded to 5 decimals). */
  line10_proRataRatio: number
  /** Line 11 = line 8 × line 10 — basis allocated to conversions. */
  line11_basisInConversion: number
  /** Line 12 = line 7 × line 10 — basis allocated to non-conversion distributions. */
  line12_basisInDistributions: number
  /** Line 13 = line 11 + line 12 — total basis used this year. */
  line13_totalBasisUsed: number
  /** Line 14 = line 3 − line 13 — basis carried forward to next year. */
  line14_basisCarriedForward: number
  /** Line 15c = line 7 − line 12 — taxable portion of distributions (→ Form 1040 line 4b). */
  line15c_taxableDistributions: number
  /** Line 18 = line 8 − line 11 — taxable portion of conversions (→ Form 1040 line 4b). */
  line18_taxableConversions: number
  /** Combined taxable amount flowing to Form 1040 line 4b. */
  taxableToForm1040Line4b: number
  /** Per-1099-R rollup for UI sourcing. */
  conversions: Form8606SourceRow[]
  distributions: Form8606SourceRow[]
  /** True when at least one Part I, II, or III activity is present. */
  hasActivity: boolean
}

export interface Form8606SourceRow {
  payerName: string
  grossDistribution: number
  taxableAmount: number
  distributionCode: string
  isIra: boolean
}

function readNum(v: number | null | undefined): number {
  return typeof v === 'number' && !isNaN(v) ? v : 0
}

function classify1099R(doc: TaxDocument): Form8606SourceRow | null {
  if (doc.form_type !== '1099_r' || !doc.parsed_data) return null
  const p = doc.parsed_data as Form1099RParsedData
  const gross = readNum(p.box1_gross_distribution)
  if (gross === 0) return null
  return {
    payerName: p.payer_name ?? 'Unknown payer',
    grossDistribution: gross,
    taxableAmount: readNum(p.box2a_taxable_amount),
    distributionCode: (p.box7_distribution_code ?? '').trim(),
    isIra: p.box7_ira_sep_simple === true,
  }
}

export function computeForm8606({
  nondeductibleContributions,
  priorYearBasis,
  yearEndFmv,
  reviewed1099RDocs,
}: Form8606Inputs): Form8606Lines {
  const sources = reviewed1099RDocs
    .map(classify1099R)
    .filter((r): r is Form8606SourceRow => r !== null && r.isIra)

  const conversions: Form8606SourceRow[] = []
  const distributions: Form8606SourceRow[] = []
  for (const row of sources) {
    if (ROTH_CONVERSION_CODES.has(row.distributionCode)) {
      conversions.push(row)
    } else {
      distributions.push(row)
    }
  }

  const line1 = currency(nondeductibleContributions).value
  const line2 = currency(priorYearBasis).value
  const line3 = currency(line1).add(line2).value
  const line6 = currency(yearEndFmv).value
  const line7 = distributions.reduce((acc, r) => acc.add(r.grossDistribution), currency(0)).value
  const line8 = conversions.reduce((acc, r) => acc.add(r.grossDistribution), currency(0)).value
  const line9 = currency(line6).add(line7).add(line8).value
  const line10 = line9 > 0
    ? Math.min(1, currency(line3, { precision: 5 }).divide(line9).value)
    : 0
  const line11 = currency(line8, { precision: 2 }).multiply(line10).value
  const line12 = currency(line7, { precision: 2 }).multiply(line10).value
  const line13 = currency(line11).add(line12).value
  const line14 = currency(line3).subtract(line13).value
  const line15c = currency(line7).subtract(line12).value
  const line18 = currency(line8).subtract(line11).value

  const hasActivity =
    line1 !== 0 || line2 !== 0 || line7 !== 0 || line8 !== 0 || line6 !== 0

  return {
    line1_nondeductibleContributions: line1,
    line2_priorYearBasis: line2,
    line3_totalBasis: line3,
    line6_yearEndFmv: line6,
    line7_distributionsNotConverted: line7,
    line8_convertedToRoth: line8,
    line9_total: line9,
    line10_proRataRatio: line10,
    line11_basisInConversion: line11,
    line12_basisInDistributions: line12,
    line13_totalBasisUsed: line13,
    line14_basisCarriedForward: line14,
    line15c_taxableDistributions: line15c,
    line18_taxableConversions: line18,
    taxableToForm1040Line4b: currency(line15c).add(line18).value,
    conversions,
    distributions,
    hasActivity,
  }
}

/**
 * Line row that pairs the computed numeric value with an optional inline input
 * control rendered to the right. Matches FormLine's layout so the preview
 * blocks line up visually.
 */
function InputLine({
  boxRef,
  label,
  value,
  input,
}: {
  boxRef?: string
  label: string
  value: number
  input?: React.ReactNode
}): React.ReactElement {
  if (!input) {
    return <FormLine boxRef={boxRef ?? ''} label={label} value={value} />
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="w-14 shrink-0 select-none font-mono text-[10px] text-muted-foreground">{boxRef ?? ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <span className="shrink-0">{input}</span>
    </div>
  )
}

interface Form8606PreviewProps {
  selectedYear: number
  form8606: Form8606Lines
  nondeductibleContributionsInput?: React.ReactNode
  priorYearBasisInput?: React.ReactNode
  yearEndFmvInput?: React.ReactNode
}

export default function Form8606Preview({
  selectedYear,
  form8606,
  nondeductibleContributionsInput,
  priorYearBasisInput,
  yearEndFmvInput,
}: Form8606PreviewProps) {
  const f = form8606
  const hasPartI = f.line1_nondeductibleContributions !== 0 || f.line2_priorYearBasis !== 0
  const hasPartII = f.line8_convertedToRoth !== 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8606 — Nondeductible IRAs — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          Tracks traditional IRA basis, Roth conversions, and the pro-rata rule across years.
        </p>
      </div>

      {!f.hasActivity && (
        <Callout kind="info" title="No Form 8606 activity detected">
          <p>
            Enter nondeductible traditional IRA contributions or prior-year basis below, or review a
            1099-R with an IRA distribution code, to populate this form. Form 8606 is required whenever
            you have basis in traditional IRAs — even in years with no distributions.
          </p>
        </Callout>
      )}

      <FormBlock title="Inputs — User entered">
        <InputLine
          boxRef="1"
          label="Nondeductible contributions to traditional IRA this year"
          value={f.line1_nondeductibleContributions}
          input={nondeductibleContributionsInput}
        />
        <InputLine
          boxRef="2"
          label="Prior-year basis (from last year's Form 8606 line 14)"
          value={f.line2_priorYearBasis}
          input={priorYearBasisInput}
        />
        <InputLine
          boxRef="6"
          label="Year-end FMV of all traditional/SEP/SIMPLE IRAs"
          value={f.line6_yearEndFmv}
          input={yearEndFmvInput}
        />
        <FormSubLine text="FMV is required to compute the pro-rata rule (line 10)." />
      </FormBlock>

      {(hasPartI || hasPartII) && (
        <FormBlock title="Part I — Nondeductible contributions & basis">
          <FormLine boxRef="3" label="Total basis before distributions (line 1 + line 2)" value={f.line3_totalBasis} />
          {hasPartII && (
            <>
              <FormLine
                boxRef="7"
                label="Distributions from IRAs (other than conversions)"
                value={f.line7_distributionsNotConverted}
              />
              <FormLine boxRef="8" label="Amount converted to Roth this year" value={f.line8_convertedToRoth} />
              <FormLine boxRef="9" label="Add lines 6, 7, and 8" value={f.line9_total} />
              <FormLine
                boxRef="10"
                label="Pro-rata ratio (line 3 ÷ line 9)"
                raw={f.line10_proRataRatio.toFixed(5)}
              />
              <FormLine
                boxRef="11"
                label="Nontaxable portion of conversions (line 8 × line 10)"
                value={f.line11_basisInConversion}
              />
              <FormLine
                boxRef="12"
                label="Nontaxable portion of other distributions (line 7 × line 10)"
                value={f.line12_basisInDistributions}
              />
              <FormLine boxRef="13" label="Total basis used this year (line 11 + line 12)" value={f.line13_totalBasisUsed} />
              <FormLine
                boxRef="15c"
                label="Taxable portion of other distributions"
                value={f.line15c_taxableDistributions}
              />
            </>
          )}
          <FormTotalLine label="Line 14 — Basis carried forward to next year" value={f.line14_basisCarriedForward} />
        </FormBlock>
      )}

      {hasPartII && (
        <FormBlock title="Part II — Roth conversions">
          {f.conversions.map((row, i) => (
            <div key={i}>
              <FormLine
                label={`${row.payerName} — code ${row.distributionCode || '(none)'}`}
                value={row.grossDistribution}
              />
              <FormSubLine text={`Taxable per 1099-R box 2a: ${fmtAmt(row.taxableAmount)} · Form 8606 overrides with line 18`} />
            </div>
          ))}
          <FormTotalLine label="Line 18 — Taxable amount of Roth conversions" value={f.line18_taxableConversions} />
        </FormBlock>
      )}

      {f.distributions.length > 0 && (
        <FormBlock title="Traditional IRA distributions (non-conversion)">
          {f.distributions.map((row, i) => (
            <div key={i}>
              <FormLine label={`${row.payerName} — code ${row.distributionCode || '(none)'}`} value={row.grossDistribution} />
              <FormSubLine text={`1099-R box 2a taxable: ${fmtAmt(row.taxableAmount)}`} />
            </div>
          ))}
        </FormBlock>
      )}

      {(hasPartI || hasPartII) && (
        <FormTotalLine
          label="Taxable amount → Form 1040 line 4b (IRA distributions)"
          value={f.taxableToForm1040Line4b}
          double
        />
      )}

      {f.line2_priorYearBasis === 0 && f.line1_nondeductibleContributions > 0 && (
        <Callout kind="warn" title="Prior-year basis is zero">
          <p>
            You're reporting nondeductible contributions but no prior-year basis. If you've made
            nondeductible contributions in past years, retrieve line 14 from your most recent
            Form 8606 and enter it above — otherwise the pro-rata calculation will under-credit your basis.
          </p>
        </Callout>
      )}
    </div>
  )
}
