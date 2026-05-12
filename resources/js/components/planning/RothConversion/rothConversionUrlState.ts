import currency from 'currency.js'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from './defaults'
import type { FilingStatus, RothConversionInputs, RothConversionStrategy } from './types'
import { rothConversionInputsSchema } from './types'

const QUERY_KEYS = {
  filingStatus: 'fs',
  primaryAge: 'age',
  endAge: 'end',
  retirementAge: 'retire',
  traditional: 'trad',
  traditionalSpouse: 'tradSp',
  roth: 'roth',
  taxable: 'taxable',
  cash: 'cash',
  taxExemptInterest: 'tei',
  annualConversion: 'conv',
  conversionMode: 'mode',
  bracketTarget: 'bracket',
  claimAgePrimary: 'ss',
  stateTaxPercent: 'state',
  inflationPercent: 'infl',
  growthPercent: 'growth',
  cashYieldPercent: 'cashYield',
  priorYearMagi: 'magi1',
  twoYearsPriorMagi: 'magi2',
} as const

const filingStatuses = new Set<FilingStatus>([
  'single',
  'married_filing_jointly',
  'head_of_household',
  'qualifying_surviving_spouse',
])

const conversionModes = new Set<RothConversionStrategy['conversionMode']>(['constant', 'fill_bracket', 'schedule'])
const bracketTargets = new Set<RothConversionStrategy['bracketTarget']>([12, 22, 24, 32])

function parseMoney(raw: string | null, fallback: number): number {
  if (raw === null) {
    return fallback
  }

  const parsed = currency(raw).value
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function parseNumber(raw: string | null, fallback: number): number {
  if (raw === null) {
    return fallback
  }

  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseFilingStatus(raw: string | null, fallback: FilingStatus): FilingStatus {
  return raw !== null && filingStatuses.has(raw as FilingStatus) ? raw as FilingStatus : fallback
}

function parseConversionMode(raw: string | null, fallback: RothConversionStrategy['conversionMode']): RothConversionStrategy['conversionMode'] {
  return raw !== null && conversionModes.has(raw as RothConversionStrategy['conversionMode']) ? raw as RothConversionStrategy['conversionMode'] : fallback
}

function parseBracketTarget(raw: string | null, fallback: RothConversionStrategy['bracketTarget']): RothConversionStrategy['bracketTarget'] {
  if (raw === null) {
    return fallback
  }

  const parsed = Number(raw)
  return bracketTargets.has(parsed as RothConversionStrategy['bracketTarget']) ? parsed as RothConversionStrategy['bracketTarget'] : fallback
}

export function parseRothConversionUrlState(search: string, base: RothConversionInputs = DEFAULT_ROTH_CONVERSION_INPUTS): RothConversionInputs {
  const params = new URLSearchParams(search)
  const next: RothConversionInputs = {
    ...base,
    filingStatus: parseFilingStatus(params.get(QUERY_KEYS.filingStatus), base.filingStatus),
    people: {
      ...base.people,
      primaryCurrentAge: parseNumber(params.get(QUERY_KEYS.primaryAge), base.people.primaryCurrentAge),
      primaryEndAge: parseNumber(params.get(QUERY_KEYS.endAge), base.people.primaryEndAge),
    },
    income: {
      ...base.income,
      retirementAgePrimary: parseNumber(params.get(QUERY_KEYS.retirementAge), base.income.retirementAgePrimary),
      taxExemptInterest: parseMoney(params.get(QUERY_KEYS.taxExemptInterest), base.income.taxExemptInterest),
    },
    balances: {
      ...base.balances,
      traditionalPrimary: parseMoney(params.get(QUERY_KEYS.traditional), base.balances.traditionalPrimary),
      traditionalSpouse: parseMoney(params.get(QUERY_KEYS.traditionalSpouse), base.balances.traditionalSpouse),
      rothPrimary: parseMoney(params.get(QUERY_KEYS.roth), base.balances.rothPrimary),
      taxableBrokerage: parseMoney(params.get(QUERY_KEYS.taxable), base.balances.taxableBrokerage),
      cash: parseMoney(params.get(QUERY_KEYS.cash), base.balances.cash),
    },
    socialSecurity: {
      ...base.socialSecurity,
      claimAgePrimary: parseNumber(params.get(QUERY_KEYS.claimAgePrimary), base.socialSecurity.claimAgePrimary),
    },
    strategy: {
      ...base.strategy,
      annualConversion: parseMoney(params.get(QUERY_KEYS.annualConversion), base.strategy.annualConversion),
      conversionMode: parseConversionMode(params.get(QUERY_KEYS.conversionMode), base.strategy.conversionMode),
      bracketTarget: parseBracketTarget(params.get(QUERY_KEYS.bracketTarget), base.strategy.bracketTarget),
    },
    assumptions: {
      ...base.assumptions,
      stateTaxPercent: parseNumber(params.get(QUERY_KEYS.stateTaxPercent), base.assumptions.stateTaxPercent),
      inflationPercent: parseNumber(params.get(QUERY_KEYS.inflationPercent), base.assumptions.inflationPercent),
      postRetirementGrowthPercent: parseNumber(params.get(QUERY_KEYS.growthPercent), base.assumptions.postRetirementGrowthPercent),
      cashYieldPercent: parseNumber(params.get(QUERY_KEYS.cashYieldPercent), base.assumptions.cashYieldPercent),
      priorYearMagi: parseMoney(params.get(QUERY_KEYS.priorYearMagi), base.assumptions.priorYearMagi),
      twoYearsPriorMagi: parseMoney(params.get(QUERY_KEYS.twoYearsPriorMagi), base.assumptions.twoYearsPriorMagi),
    },
  }

  const parsed = rothConversionInputsSchema.safeParse(next)
  return parsed.success ? parsed.data : base
}

export function serializeRothConversionUrlState(inputs: RothConversionInputs): string {
  const params = new URLSearchParams()
  const defaults = DEFAULT_ROTH_CONVERSION_INPUTS

  if (inputs.filingStatus !== defaults.filingStatus) {
    params.set(QUERY_KEYS.filingStatus, inputs.filingStatus)
  }
  if (inputs.people.primaryCurrentAge !== defaults.people.primaryCurrentAge) {
    params.set(QUERY_KEYS.primaryAge, String(inputs.people.primaryCurrentAge))
  }
  if (inputs.people.primaryEndAge !== defaults.people.primaryEndAge) {
    params.set(QUERY_KEYS.endAge, String(inputs.people.primaryEndAge))
  }
  if (inputs.income.retirementAgePrimary !== defaults.income.retirementAgePrimary) {
    params.set(QUERY_KEYS.retirementAge, String(inputs.income.retirementAgePrimary))
  }
  if (inputs.income.taxExemptInterest !== defaults.income.taxExemptInterest) {
    params.set(QUERY_KEYS.taxExemptInterest, String(inputs.income.taxExemptInterest))
  }
  if (inputs.balances.traditionalPrimary !== defaults.balances.traditionalPrimary) {
    params.set(QUERY_KEYS.traditional, String(inputs.balances.traditionalPrimary))
  }
  if (inputs.balances.traditionalSpouse !== defaults.balances.traditionalSpouse) {
    params.set(QUERY_KEYS.traditionalSpouse, String(inputs.balances.traditionalSpouse))
  }
  if (inputs.balances.rothPrimary !== defaults.balances.rothPrimary) {
    params.set(QUERY_KEYS.roth, String(inputs.balances.rothPrimary))
  }
  if (inputs.balances.taxableBrokerage !== defaults.balances.taxableBrokerage) {
    params.set(QUERY_KEYS.taxable, String(inputs.balances.taxableBrokerage))
  }
  if (inputs.balances.cash !== defaults.balances.cash) {
    params.set(QUERY_KEYS.cash, String(inputs.balances.cash))
  }
  if (inputs.strategy.annualConversion !== defaults.strategy.annualConversion) {
    params.set(QUERY_KEYS.annualConversion, String(inputs.strategy.annualConversion))
  }
  if (inputs.strategy.conversionMode !== defaults.strategy.conversionMode) {
    params.set(QUERY_KEYS.conversionMode, inputs.strategy.conversionMode)
  }
  if (inputs.strategy.bracketTarget !== defaults.strategy.bracketTarget) {
    params.set(QUERY_KEYS.bracketTarget, String(inputs.strategy.bracketTarget))
  }
  if (inputs.socialSecurity.claimAgePrimary !== defaults.socialSecurity.claimAgePrimary) {
    params.set(QUERY_KEYS.claimAgePrimary, String(inputs.socialSecurity.claimAgePrimary))
  }
  if (inputs.assumptions.stateTaxPercent !== defaults.assumptions.stateTaxPercent) {
    params.set(QUERY_KEYS.stateTaxPercent, String(inputs.assumptions.stateTaxPercent))
  }
  if (inputs.assumptions.inflationPercent !== defaults.assumptions.inflationPercent) {
    params.set(QUERY_KEYS.inflationPercent, String(inputs.assumptions.inflationPercent))
  }
  if (inputs.assumptions.postRetirementGrowthPercent !== defaults.assumptions.postRetirementGrowthPercent) {
    params.set(QUERY_KEYS.growthPercent, String(inputs.assumptions.postRetirementGrowthPercent))
  }
  if (inputs.assumptions.cashYieldPercent !== defaults.assumptions.cashYieldPercent) {
    params.set(QUERY_KEYS.cashYieldPercent, String(inputs.assumptions.cashYieldPercent))
  }
  if (inputs.assumptions.priorYearMagi !== defaults.assumptions.priorYearMagi) {
    params.set(QUERY_KEYS.priorYearMagi, String(inputs.assumptions.priorYearMagi))
  }
  if (inputs.assumptions.twoYearsPriorMagi !== defaults.assumptions.twoYearsPriorMagi) {
    params.set(QUERY_KEYS.twoYearsPriorMagi, String(inputs.assumptions.twoYearsPriorMagi))
  }

  return params.toString()
}
