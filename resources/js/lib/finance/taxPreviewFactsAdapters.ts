import type { ScheduleDAggregatesForForm461 } from '@/lib/tax/form461'
import type { ScheduleCNetIncome } from '@/types/finance/tax-return'
import type { ScheduleCFacts, ScheduleDFacts } from '@/types/generated/tax-preview-facts'

export function scheduleCNetIncomeFromFacts(facts: ScheduleCFacts | undefined): ScheduleCNetIncome {
  if (!facts) {
    return { total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }
  }

  return {
    total: facts.netProfit,
    byQuarter: facts.netProfitCumulativeByQuarter,
  }
}

export function emptyScheduleDFacts(): ScheduleDFacts {
  return {
    form8949Rollups: [],
    line5Sources: [],
    line3Sources: [],
    line10Sources: [],
    line12Sources: [],
    line13Sources: [],
    ambiguous11SSources: [],
    line1aGainLoss: 0,
    line1bGainLoss: 0,
    line2GainLoss: 0,
    line3GainLoss: 0,
    line4GainLoss: 0,
    line5GainLoss: 0,
    line6Carryover: 0,
    line7NetShortTerm: 0,
    line8aGainLoss: 0,
    line8bGainLoss: 0,
    line9GainLoss: 0,
    line10GainLoss: 0,
    line11GainLoss: 0,
    line12GainLoss: 0,
    line13CapitalGainDistributions: 0,
    line14Carryover: 0,
    line15NetLongTerm: 0,
    line16Combined: 0,
    line21LimitedLossOrGain: 0,
    appliedToReturn: 0,
    carryforward: 0,
    totalBusinessCapGains: 0,
    totalPersonalCapGains: 0,
    limitedBusinessCapGains: 0,
    limitedPersonalCapGains: 0,
    ambiguous11SAmount: 0,
  }
}

export function scheduleDAggregatesForForm461FromFacts(facts: ScheduleDFacts): ScheduleDAggregatesForForm461 {
  return {
    schD_line21: facts.line21LimitedLossOrGain,
    limitedPersonalCapGains: facts.limitedPersonalCapGains,
  }
}
