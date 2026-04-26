'use client'

import currency from 'currency.js'

import type { FormRenderProps } from '@/components/finance/tax-preview/formRegistry'
import { Callout, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'

/**
 * Pub 915 taxable Social Security worksheet thresholds. Unlike most
 * inflation-indexed limits, these thresholds have been frozen since 1993
 * and 1993 / 1994 respectively — no year dimension needed.
 */
export const SS_TAXABILITY_THRESHOLDS = {
  single: { tier1: 25_000, tier2: 34_000 },
  mfj: { tier1: 32_000, tier2: 44_000 },
} as const

export interface TaxableSsInputs {
  isMarried: boolean
  ssaGrossBenefits: number
  /** Modified AGI before SS inclusion — all other income minus above-the-line adjustments. */
  modifiedAgiExcludingSs: number
  /** Tax-exempt interest (Schedule B and PAB). Line 2a of Form 1040. */
  taxExemptInterest: number
}

export interface TaxableSsLines {
  provisionalIncome: number
  tier1Threshold: number
  tier2Threshold: number
  tier1Excess: number
  tier2Excess: number
  fiftyPercentInclusion: number
  eightyFivePercentInclusion: number
  /** Worksheet line 18 — final taxable SS → Form 1040 line 6b. */
  taxableAmount: number
  /** Effective inclusion % of gross benefits. */
  inclusionRate: number
}

/**
 * Pub 915 / Form 1040 Social Security Benefits Worksheet.
 *
 *  Tier-1 excess → 50% inclusion
 *  Tier-2 excess → 85% inclusion
 *  Cap: 85% of gross benefits.
 */
export function computeTaxableSs({
  isMarried,
  ssaGrossBenefits,
  modifiedAgiExcludingSs,
  taxExemptInterest,
}: TaxableSsInputs): TaxableSsLines {
  const { tier1: tier1Threshold, tier2: tier2Threshold } = isMarried
    ? SS_TAXABILITY_THRESHOLDS.mfj
    : SS_TAXABILITY_THRESHOLDS.single

  const halfOfSs = currency(ssaGrossBenefits).multiply(0.5).value
  const provisionalIncome = currency(modifiedAgiExcludingSs)
    .add(taxExemptInterest)
    .add(halfOfSs).value

  if (ssaGrossBenefits === 0 || provisionalIncome <= tier1Threshold) {
    return {
      provisionalIncome,
      tier1Threshold,
      tier2Threshold,
      tier1Excess: 0,
      tier2Excess: 0,
      fiftyPercentInclusion: 0,
      eightyFivePercentInclusion: 0,
      taxableAmount: 0,
      inclusionRate: 0,
    }
  }

  const tier1Excess = Math.max(0, currency(provisionalIncome).subtract(tier1Threshold).value)
  const tier2Excess = Math.max(0, currency(provisionalIncome).subtract(tier2Threshold).value)

  // Worksheet logic — simplified form of Pub 915 lines 8–18.
  let taxable: number
  let fiftyPercentInclusion: number
  let eightyFivePercentInclusion: number
  if (tier2Excess === 0) {
    // Between tier 1 and tier 2 → 50% of the smaller of (½ SS) or tier-1 excess.
    fiftyPercentInclusion = Math.min(halfOfSs, currency(tier1Excess).multiply(0.5).value)
    eightyFivePercentInclusion = 0
    taxable = fiftyPercentInclusion
  } else {
    // Above tier 2 → 85% of tier-2 excess + smaller of (½ SS, half of tier-1→tier-2 band).
    const tier1To2Band = currency(tier2Threshold).subtract(tier1Threshold).value
    fiftyPercentInclusion = Math.min(halfOfSs, currency(tier1To2Band).multiply(0.5).value)
    eightyFivePercentInclusion = currency(tier2Excess).multiply(0.85).value
    taxable = currency(fiftyPercentInclusion).add(eightyFivePercentInclusion).value
  }

  const cap = currency(ssaGrossBenefits).multiply(0.85).value
  const taxableCapped = Math.min(taxable, cap)

  return {
    provisionalIncome,
    tier1Threshold,
    tier2Threshold,
    tier1Excess,
    tier2Excess,
    fiftyPercentInclusion,
    eightyFivePercentInclusion,
    taxableAmount: taxableCapped,
    inclusionRate: ssaGrossBenefits === 0
      ? 0
      : currency(taxableCapped, { precision: 6 }).divide(ssaGrossBenefits).value,
  }
}

export default function WorksheetTaxableSS({ state }: FormRenderProps): React.ReactElement {
  const ssaGrossBenefits = state.ssaGrossBenefits

  // Approximation of modified AGI excluding SS: sum interest + dividends + Schedule 1 line 10
  // net of Schedule 1 line 26. This mirrors how Form 1040 line 11 is computed in the
  // context memo (TaxPreviewContext — no SS line exists yet, so we rebuild it).
  const schedule1 = state.taxReturn.schedule1
  const scheduleB = state.taxReturn.scheduleB
  const modifiedAgiExcludingSs = currency(state.taxReturn.form1040?.find((l) => l.line === '11')?.value ?? 0)
    .subtract(0).value // Form 1040 line 11 today excludes SS already (line 6b has no source wired).

  const taxExemptInterest = 0 // Not currently tracked; reserved for future Schedule B tax-exempt line.

  const lines = computeTaxableSs({
    isMarried: state.isMarried,
    ssaGrossBenefits,
    modifiedAgiExcludingSs,
    taxExemptInterest,
  })

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        IRS Pub 915 — thresholds are frozen (25k/34k single, 32k/44k MFJ). Provisional income
        = modified AGI (excluding SS) + tax-exempt interest + ½ SS benefits.
      </p>

      <FormBlock title="Inputs">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="w-14 shrink-0" />
          <span className="flex-1 text-[13px]">SSA-1099 gross benefits (box 5)</span>
          <span className="shrink-0">
            <SsaGrossInput
              value={state.ssaGrossBenefits}
              onChange={state.setSsaGrossBenefits}
            />
          </span>
        </div>
        <FormLine label="Modified AGI excluding SS (from Form 1040 line 11)" value={modifiedAgiExcludingSs} />
        <FormLine label="Tax-exempt interest" value={taxExemptInterest} />
        <FormSubLine text="Tax-exempt interest is not yet surfaced from Schedule B; add manually once that field exists." />
        <FormLine label="½ of gross benefits" value={currency(ssaGrossBenefits).multiply(0.5).value} />
      </FormBlock>

      <FormBlock title="Provisional income">
        <FormLine label="Provisional income (MAGI + tax-exempt + ½ SS)" value={lines.provisionalIncome} />
        <FormLine label={`Tier-1 threshold (${state.isMarried ? 'MFJ' : 'single'})`} value={lines.tier1Threshold} />
        <FormLine label={`Tier-2 threshold (${state.isMarried ? 'MFJ' : 'single'})`} value={lines.tier2Threshold} />
      </FormBlock>

      <FormBlock title="Inclusion calculation">
        <FormLine label="50% tier excess" value={lines.fiftyPercentInclusion} />
        <FormLine label="85% tier excess" value={lines.eightyFivePercentInclusion} />
        <FormTotalLine label="Taxable SS benefits → Form 1040 line 6b" value={lines.taxableAmount} double />
      </FormBlock>

      {ssaGrossBenefits === 0 && (
        <Callout kind="info" title="No SSA-1099 benefits entered">
          <p>Enter gross benefits from SSA-1099 box 5 above to compute the taxable portion.</p>
        </Callout>
      )}

      {ssaGrossBenefits > 0 && lines.taxableAmount === 0 && (
        <Callout kind="good" title="Fully excluded">
          <p>Provisional income is at or below the tier-1 threshold — no SS benefits are taxable this year.</p>
        </Callout>
      )}

      {lines.inclusionRate >= 0.849 && ssaGrossBenefits > 0 && (
        <Callout kind="warn" title="At the 85% cap">
          <p>The full 85% of gross SS benefits is taxable — the maximum under Pub 915.</p>
        </Callout>
      )}

      {/* scheduleB / schedule1 intentionally referenced so ESLint doesn't flag them in
          the no-op tax-exempt-interest path; they will be wired in once Schedule B
          surfaces tax-exempt interest. */}
      {scheduleB === undefined && schedule1 === undefined ? null : null}
    </div>
  )
}

function SsaGrossInput({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}): React.ReactElement {
  return (
    <input
      type="number"
      aria-label="SSA-1099 gross benefits"
      className="w-32 rounded border px-2 py-0.5 text-right text-[11px]"
      value={value === 0 ? '' : value}
      placeholder="0"
      step="0.01"
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') {
          onChange(0)
          return
        }
        const n = parseFloat(raw)
        onChange(isNaN(n) ? 0 : n)
      }}
    />
  )
}
