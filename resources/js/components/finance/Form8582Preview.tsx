'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { computeForm8582Lines, RENTAL_PHASEOUT_END, RENTAL_PHASEOUT_START, RENTAL_SPECIAL_ALLOWANCE } from '@/finance/8582/form8582'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form8582Lines } from '@/types/finance/tax-return'

export type { Form8582Lines } from '@/types/finance/tax-return'

// ── K-1 field helpers ─────────────────────────────────────────────────────────

function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Compute wrapper ───────────────────────────────────────────────────────────

interface Form8582PreviewProps {
  reviewedK1Docs: TaxDocument[]
  magi: number
  isMarried: boolean
}

export function computeForm8582({
  reviewedK1Docs,
  magi,
  isMarried,
}: Form8582PreviewProps): Form8582Lines {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const activities = k1Parsed.map(({ doc, data }) => {
    const activityName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const ein = data.fields['A']?.value ?? undefined

    const box2 = parseK1Field(data, '2')
    const box3 = parseK1Field(data, '3')

    const passiveAmount = currency(box2).add(box3).value

    const currentIncome = Math.max(0, passiveAmount)
    const currentLoss = Math.min(0, passiveAmount)

    // TODO: Wire up prior-year PAL carryforward storage.
    // Currently assumes 0 prior-year suspended losses per activity.
    // See issue: "Add Form 8582 — Passive Activity Loss (PAL) tracking"
    // for the planned fin_pal_carryforwards table or JSON column approach.
    const priorYearUnallowed = 0

    return { activityName, ein, currentIncome, currentLoss, priorYearUnallowed }
  })

  return computeForm8582Lines({ activities, magi, isMarried })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Form8582Preview({
  reviewedK1Docs,
  magi,
  isMarried,
}: Form8582PreviewProps) {
  const computed = computeForm8582({
    reviewedK1Docs,
    magi,
    isMarried,
  })

  const {
    activities,
    totalPassiveIncome,
    totalPassiveLoss,
    totalPriorYearUnallowed,
    netPassiveResult,
    rentalAllowance,
    totalAllowedLoss,
    totalSuspendedLoss,
    isLossLimited,
  } = computed

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No passive activity data found in reviewed K-1 documents.
        <br />
        Passive activities are reported in K-1 Box 2 (rental real estate) and Box 3 (other rental).
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8582 — Passive Activity Loss Limitations</h2>
        <p className="text-xs text-muted-foreground">
          Limits passive activity losses to passive income. Excess losses are suspended and carried forward.
        </p>
      </div>

      {/* Part I — Per-Activity Breakdown */}
      <FormBlock title="Part I — Passive Activities">
        {activities.map((a, i) => (
          <div key={i}>
            {a.currentIncome !== 0 && (
              <FormLine
                label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''} — income`}
                value={a.currentIncome}
              />
            )}
            {a.currentLoss !== 0 && (
              <FormLine
                label={`${a.activityName}${a.ein ? ` (EIN ${a.ein})` : ''} — loss`}
                value={a.currentLoss}
              />
            )}
            {a.priorYearUnallowed !== 0 && (
              <FormLine
                label={`${a.activityName} — prior-year unallowed loss`}
                value={a.priorYearUnallowed}
              />
            )}
          </div>
        ))}
        <FormTotalLine label="Line 1a — Total passive income" value={totalPassiveIncome} />
        <FormTotalLine label="Line 1b — Total passive loss" value={totalPassiveLoss} />
        {totalPriorYearUnallowed !== 0 && (
          <FormLine label="Line 1c — Prior-year unallowed losses" value={totalPriorYearUnallowed} />
        )}
        <FormTotalLine label="Line 1d — Combine lines 1a through 1c" value={netPassiveResult} double />
      </FormBlock>

      {/* Part II — Special Allowance */}
      {netPassiveResult < 0 && (
        <FormBlock title="Part II — Special Allowance for Rental Real Estate">
          <FormLine
            label="Modified AGI"
            value={magi}
          />
          <FormLine
            label={`Special allowance (${fmtAmt(RENTAL_SPECIAL_ALLOWANCE, 0)} max, phased out ${fmtAmt(RENTAL_PHASEOUT_START, 0)}–${fmtAmt(RENTAL_PHASEOUT_END, 0)} MAGI)`}
            value={rentalAllowance}
          />
        </FormBlock>
      )}

      {/* Part III — Result */}
      <FormBlock title="Part III — Allowed vs. Suspended Losses">
        <FormLine label="Total allowed passive loss this year" value={-totalAllowedLoss} />
        {isLossLimited ? (
          <>
            <FormTotalLine label="Suspended loss — carried forward" value={-totalSuspendedLoss} double />
            <Callout kind="warn" title="⚠ Passive Activity Loss Limitation Applies">
              <p>
                Net passive losses of <strong>{fmtAmt(Math.abs(netPassiveResult), 0)}</strong> exceed
                passive income of <strong>{fmtAmt(totalPassiveIncome, 0)}</strong>
                {rentalAllowance > 0 && (
                  <> plus the rental special allowance of <strong>{fmtAmt(rentalAllowance, 0)}</strong></>
                )}.
                The suspended loss of <strong>{fmtAmt(totalSuspendedLoss, 0)}</strong> carries
                forward to offset future passive income or disposition gains.
              </p>
            </Callout>
          </>
        ) : (
          <FormLine
            label="PAL status"
            raw={netPassiveResult >= 0
              ? '✓ Net passive income — no limitation applies'
              : `✓ All passive losses allowed (within $${RENTAL_SPECIAL_ALLOWANCE.toLocaleString()} special allowance)`}
          />
        )}
      </FormBlock>

      <Callout kind="info" title="ℹ Prior-Year Suspended Losses">
        <p>
          Prior-year suspended losses are currently assumed to be $0 per activity.
          When carryforward storage is implemented, enter prior-year Form 8582 suspended losses
          to get accurate allowed/suspended calculations.
        </p>
      </Callout>
    </div>
  )
}
