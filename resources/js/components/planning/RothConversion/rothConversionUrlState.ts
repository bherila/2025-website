import currency from 'currency.js'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from './defaults'
import { type FilingStatus, type RothConversionInputs, rothConversionInputsSchema } from './types'

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
  priorYearMagi: 'magi1',
  twoYearsPriorMagi: 'magi2',
} as const

const filingStatuses = new Set<FilingStatus>([
  'single',
  'married_filing_jointly',
  'head_of_household',
  'qualifying_surviving_spouse',
])

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
      conversionMode: params.get(QUERY_KEYS.conversionMode) === 'constant' ? 'constant' : base.strategy.conversionMode,
      bracketTarget: parseNumber(params.get(QUERY_KEYS.bracketTarget), base.strategy.bracketTarget) as 12 | 22 | 24,
    },
    assumptions: {
      ...base.assumptions,
      stateTaxPercent: parseNumber(params.get(QUERY_KEYS.stateTaxPercent), base.assumptions.stateTaxPercent),
      inflationPercent: parseNumber(params.get(QUERY_KEYS.inflationPercent), base.assumptions.inflationPercent),
      postRetirementGrowthPercent: parseNumber(params.get(QUERY_KEYS.growthPercent), base.assumptions.postRetirementGrowthPercent),
      priorYearMagi: parseMoney(params.get(QUERY_KEYS.priorYearMagi), base.assumptions.priorYearMagi),
      twoYearsPriorMagi: parseMoney(params.get(QUERY_KEYS.twoYearsPriorMagi), base.assumptions.twoYearsPriorMagi),
    },
  }

  return rothConversionInputsSchema.parse(next)
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
  if (inputs.assumptions.priorYearMagi !== defaults.assumptions.priorYearMagi) {
    params.set(QUERY_KEYS.priorYearMagi, String(inputs.assumptions.priorYearMagi))
  }
  if (inputs.assumptions.twoYearsPriorMagi !== defaults.assumptions.twoYearsPriorMagi) {
    params.set(QUERY_KEYS.twoYearsPriorMagi, String(inputs.assumptions.twoYearsPriorMagi))
  }

  return params.toString()
}
