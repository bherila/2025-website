'use client'

import { Callout, FactsLoadingPlaceholder, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form8606Facts } from '@/types/generated/tax-preview-facts'

interface Form8606PreviewProps {
  selectedYear: number
  form8606?: Form8606Facts | null
}

export default function Form8606Preview({
  selectedYear,
  form8606,
}: Form8606PreviewProps) {
  if (!form8606) {
    return <FactsLoadingPlaceholder label="Form 8606" />
  }

  const hasPartI = form8606.line1_nondeductibleContributions !== 0 || form8606.line2_priorYearBasis !== 0
  const hasPartII = form8606.line8_convertedToRoth !== 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8606 — Nondeductible IRAs — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          Tracks traditional IRA basis, Roth conversions, and the pro-rata rule across years.
        </p>
      </div>

      {!form8606.hasActivity && (
        <Callout kind="info" title="No Form 8606 activity detected">
          <p>
            No nondeductible IRA contributions, basis, fair-market value, or IRA distributions are present in the backend tax facts.
          </p>
        </Callout>
      )}

      <FormBlock title="Inputs — Backend facts">
        <FormLine
          boxRef="1"
          label="Nondeductible contributions to traditional IRA this year"
          value={form8606.line1_nondeductibleContributions}
        />
        <FormLine
          boxRef="2"
          label="Prior-year basis (from last year's Form 8606 line 14)"
          value={form8606.line2_priorYearBasis}
        />
        <FormLine
          boxRef="6"
          label="Year-end FMV of all traditional/SEP/SIMPLE IRAs"
          value={form8606.line6_yearEndFmv}
        />
        <FormSubLine text="FMV is required to compute the pro-rata rule (line 10)." />
      </FormBlock>

      {(hasPartI || hasPartII) && (
        <FormBlock title="Part I — Nondeductible contributions & basis">
          <FormLine boxRef="3" label="Total basis before distributions (line 1 + line 2)" value={form8606.line3_totalBasis} />
          {hasPartII && (
            <>
              <FormLine
                boxRef="7"
                label="Distributions from IRAs (other than conversions)"
                value={form8606.line7_distributionsNotConverted}
              />
              <FormLine boxRef="8" label="Amount converted to Roth this year" value={form8606.line8_convertedToRoth} />
              <FormLine boxRef="9" label="Add lines 6, 7, and 8" value={form8606.line9_total} />
              <FormLine
                boxRef="10"
                label="Pro-rata ratio (line 3 ÷ line 9)"
                raw={form8606.line10_proRataRatio.toFixed(5)}
              />
              <FormLine
                boxRef="11"
                label="Nontaxable portion of conversions (line 8 × line 10)"
                value={form8606.line11_basisInConversion}
              />
              <FormLine
                boxRef="12"
                label="Nontaxable portion of other distributions (line 7 × line 10)"
                value={form8606.line12_basisInDistributions}
              />
              <FormLine boxRef="13" label="Total basis used this year (line 11 + line 12)" value={form8606.line13_totalBasisUsed} />
              <FormLine
                boxRef="15c"
                label="Taxable portion of other distributions"
                value={form8606.line15c_taxableDistributions}
              />
            </>
          )}
          <FormTotalLine boxRef="14" label="Basis carried forward to next year" value={form8606.line14_basisCarriedForward} />
        </FormBlock>
      )}

      {hasPartII && (
        <FormBlock title="Part II — Roth conversions">
          {form8606.conversions.map((row, i) => (
            <div key={`${row.payerName}-${row.distributionCode}-${i}`}>
              <FormLine
                label={`${row.payerName} — code ${row.distributionCode || '(none)'}`}
                value={row.grossDistribution}
              />
              <FormSubLine text={`Taxable per 1099-R box 2a: ${fmtAmt(row.taxableAmount)} · Form 8606 overrides with line 18`} />
            </div>
          ))}
          <FormTotalLine boxRef="18" label="Taxable amount of Roth conversions" value={form8606.line18_taxableConversions} />
        </FormBlock>
      )}

      {form8606.distributions.length > 0 && (
        <FormBlock title="Traditional IRA distributions (non-conversion)">
          {form8606.distributions.map((row, i) => (
            <div key={`${row.payerName}-${row.distributionCode}-${i}`}>
              <FormLine label={`${row.payerName} — code ${row.distributionCode || '(none)'}`} value={row.grossDistribution} />
              <FormSubLine text={`1099-R box 2a taxable: ${fmtAmt(row.taxableAmount)}`} />
            </div>
          ))}
        </FormBlock>
      )}

      {(hasPartI || hasPartII) && (
        <FormTotalLine
          label="Taxable amount → Form 1040 line 4b (IRA distributions)"
          value={form8606.taxableToForm1040Line4b}
          double
        />
      )}

      {form8606.line2_priorYearBasis === 0 && form8606.line1_nondeductibleContributions > 0 && (
        <Callout kind="warn" title="Prior-year basis is zero">
          <p>
            You're reporting nondeductible contributions but no prior-year basis. If you've made
            nondeductible contributions in past years, retrieve line 14 from your most recent
            Form 8606 and enter it before relying on the pro-rata calculation.
          </p>
        </Callout>
      )}
    </div>
  )
}
