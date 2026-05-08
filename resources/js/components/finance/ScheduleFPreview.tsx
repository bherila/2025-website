'use client'

import { Callout, FactsLoadingPlaceholder, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { ScheduleFFacts } from '@/types/generated/tax-preview-facts'

interface ScheduleFPreviewProps {
  selectedYear: number
  scheduleF?: ScheduleFFacts | null
}

export default function ScheduleFPreview({
  selectedYear,
  scheduleF,
}: ScheduleFPreviewProps) {
  if (!scheduleF) {
    return <FactsLoadingPlaceholder label="Schedule F" />
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule F — Profit or Loss From Farming — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          Cash method. Net profit/loss flows to Schedule 1 line 6.
        </p>
      </div>

      {!scheduleF.hasActivity && (
        <Callout kind="info" title="No Schedule F activity detected">
          <p>
            No farm income or expenses are present in the backend tax facts.
          </p>
        </Callout>
      )}

      <FormBlock title="Part I — Farm income (cash method)">
        <FormLine
          boxRef="9"
          label="Gross income from farming"
          value={scheduleF.grossFarmIncome}
        />
        <FormSubLine text="Sum of lines 1b through 8 on the paper form (livestock, produce, cooperative distributions, agricultural program payments, etc.)." />
      </FormBlock>

      <FormBlock title="Part II — Farm expenses">
        <FormLine
          boxRef="33"
          label="Total farm expenses"
          value={scheduleF.totalFarmExpenses}
        />
        <FormSubLine text="Aggregate of lines 10 through 32f — car/truck, chemicals, depreciation, feed, fertilizer, labor, interest, rent, utilities, etc." />
      </FormBlock>

      <FormTotalLine
        boxRef="34"
        label="Net farm profit or (loss) → Schedule 1 line 6"
        value={scheduleF.netFarmProfit}
        double
      />

      {scheduleF.netFarmProfit > 0 && (
        <Callout kind="info" title="Self-employment tax implication">
          <p>
            Net farm profit flows to Schedule SE as self-employment earnings. Include on Schedule SE
            line 1b (net farm profit), not line 2 (non-farm SE income).
          </p>
        </Callout>
      )}
      {scheduleF.netFarmProfit < 0 && (
        <Callout kind="warn" title="Farm loss — passive/active participation matters">
          <p>
            If this is a passive farming activity, Form 8582 may limit the loss. Confirm the
            material-participation test before claiming the full loss against other income.
          </p>
        </Callout>
      )}
    </div>
  )
}
