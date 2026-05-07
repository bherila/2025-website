import type { ScheduleDData } from '@/lib/tax/scheduleD'
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

export function scheduleDDataFromFacts(facts: ScheduleDFacts): ScheduleDData {
  return {
    schD_line1a_proceeds: 0,
    schD_line1a_cost: 0,
    schD_line1a_adjustments: 0,
    schD_line1a_gain_loss: facts.line1aGainLoss,
    schD_line1b_proceeds: 0,
    schD_line1b_cost: 0,
    schD_line1b_adjustments: 0,
    schD_line1b_gain_loss: facts.line1bGainLoss,
    schD_line2_proceeds: 0,
    schD_line2_cost: 0,
    schD_line2_adjustments: 0,
    schD_line2_gain_loss: facts.line2GainLoss,
    schD_line3_proceeds: 0,
    schD_line3_cost: 0,
    schD_line3_adjustments: 0,
    schD_line3_gain_loss: facts.line3GainLoss,
    schD_line4: facts.line4GainLoss,
    schD_line5: facts.line5GainLoss,
    schD_line6: facts.line6Carryover,
    schD_line7: facts.line7NetShortTerm,
    schD_line8a_proceeds: 0,
    schD_line8a_cost: 0,
    schD_line8a_adjustments: 0,
    schD_line8a_gain_loss: facts.line8aGainLoss,
    schD_line8b_proceeds: 0,
    schD_line8b_cost: 0,
    schD_line8b_adjustments: 0,
    schD_line8b_gain_loss: facts.line8bGainLoss,
    schD_line9_proceeds: 0,
    schD_line9_cost: 0,
    schD_line9_adjustments: 0,
    schD_line9_gain_loss: facts.line9GainLoss,
    schD_line10_proceeds: 0,
    schD_line10_cost: 0,
    schD_line10_adjustments: 0,
    schD_line10_gain_loss: facts.line10GainLoss,
    schD_line11: facts.line11GainLoss,
    schD_line12: facts.line12GainLoss,
    schD_line13: facts.line13CapitalGainDistributions,
    schD_line14: facts.line14Carryover,
    schD_line15: facts.line15NetLongTerm,
    schD_line16: facts.line16Combined,
    schD_line21: facts.line21LimitedLossOrGain,
    totalBusinessCapGains: facts.totalBusinessCapGains,
    totalPersonalCapGains: facts.totalPersonalCapGains,
    limitedBusinessCapGains: facts.limitedBusinessCapGains,
    limitedPersonalCapGains: facts.limitedPersonalCapGains,
  }
}
