'use client'

import currency from 'currency.js'

import { Callout, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'

export interface ScheduleFInputs {
  /** Line 9 — Gross income (cash method). Sum of lines 1b / 2 / 3a–3b / 4a–4b / 5a–8 on the real form. */
  grossFarmIncome: number
  /** Line 33 — Total expenses. Aggregate of lines 10 through 32f on the real form. */
  totalExpenses: number
}

export interface ScheduleFLines extends ScheduleFInputs {
  /** Line 34 — Net farm profit or (loss). Flows to Schedule 1 line 6 and Schedule SE. */
  netProfitOrLoss: number
  hasActivity: boolean
}

export function computeScheduleF({
  grossFarmIncome,
  totalExpenses,
}: ScheduleFInputs): ScheduleFLines {
  return {
    grossFarmIncome,
    totalExpenses,
    netProfitOrLoss: currency(grossFarmIncome).subtract(totalExpenses).value,
    hasActivity: grossFarmIncome !== 0 || totalExpenses !== 0,
  }
}

interface ScheduleFPreviewProps {
  selectedYear: number
  scheduleF: ScheduleFLines
  grossFarmIncomeInput?: React.ReactNode
  totalExpensesInput?: React.ReactNode
}


export default function ScheduleFPreview({
  selectedYear,
  scheduleF,
  grossFarmIncomeInput,
  totalExpensesInput,
}: ScheduleFPreviewProps) {
  const f = scheduleF

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule F — Profit or Loss From Farming — {selectedYear}</h2>
        <p className="text-xs text-muted-foreground">
          Cash method. Enter gross farm income and total farm expenses below; net flows to Schedule 1 line 6.
        </p>
      </div>

      {!f.hasActivity && (
        <Callout kind="info" title="No Schedule F activity entered">
          <p>
            Enter gross farm income (line 9) and total farm expenses (line 33) to populate the form.
            Net profit/loss flows to Schedule 1 line 6 and, if positive, to Schedule SE for SE tax.
          </p>
        </Callout>
      )}

      <FormBlock title="Part I — Farm income (cash method)">
        <FormLine
          boxRef="9"
          label="Gross income from farming"
          {...(grossFarmIncomeInput ? { control: grossFarmIncomeInput } : { value: f.grossFarmIncome })}
        />
        <FormSubLine text="Sum of lines 1b through 8 on the paper form (livestock, produce, cooperative distributions, agricultural program payments, etc.)." />
      </FormBlock>

      <FormBlock title="Part II — Farm expenses">
        <FormLine
          boxRef="33"
          label="Total farm expenses"
          {...(totalExpensesInput ? { control: totalExpensesInput } : { value: f.totalExpenses })}
        />
        <FormSubLine text="Aggregate of lines 10 through 32f — car/truck, chemicals, depreciation, feed, fertilizer, labor, interest, rent, utilities, etc." />
      </FormBlock>

      <FormTotalLine
        boxRef="34"
        label="Net farm profit or (loss) → Schedule 1 line 6"
        value={f.netProfitOrLoss}
        double
      />

      {f.netProfitOrLoss > 0 && (
        <Callout kind="info" title="Self-employment tax implication">
          <p>
            Net farm profit flows to Schedule SE as self-employment earnings. Include on Schedule SE
            line 1b (net farm profit), not line 2 (non-farm SE income).
          </p>
        </Callout>
      )}
      {f.netProfitOrLoss < 0 && (
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
