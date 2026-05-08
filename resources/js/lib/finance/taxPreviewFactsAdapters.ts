import currency from 'currency.js'

import type { ScheduleDAggregatesForForm461 } from '@/lib/tax/form461'
import type { ScheduleCNetIncome } from '@/types/finance/tax-return'
import type { ScheduleCFacts, ScheduleDFacts, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

export function scheduleCNetIncomeFromFacts(facts: ScheduleCFacts | undefined): ScheduleCNetIncome {
  if (!facts) {
    return { total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }
  }

  return {
    total: facts.netProfit,
    byQuarter: facts.netProfitCumulativeByQuarter,
  }
}

export function schedule2Line11AdditionalMedicareTaxFromFacts(facts: TaxPreviewFacts): number {
  return currency(facts.scheduleSE.additionalMedicareTax)
    .add(facts.form8959.additionalTax)
    .value
}

export function scheduleDAggregatesForForm461FromFacts(facts: ScheduleDFacts | undefined): ScheduleDAggregatesForForm461 {
  return {
    schD_line21: facts?.line21LimitedLossOrGain ?? 0,
    limitedPersonalCapGains: facts?.limitedPersonalCapGains ?? 0,
  }
}
