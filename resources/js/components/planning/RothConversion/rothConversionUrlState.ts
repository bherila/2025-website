import currency from 'currency.js'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from './defaults'
import { isMarriedFilingStatus, normalizeRothConversionInputs } from './inputUtils'
import type { FilingStatus, RothConversionInputs, RothConversionStrategy } from './types'
import { rothConversionInputsSchema } from './types'

const QUERY_KEYS = {
  filingStatus: 'fs',
  primaryBirthYear: 'birth',
  legacyPrimaryAge: 'age',
  endAge: 'end',
  spouseBirthYear: 'birthSp',
  retirementAge: 'retire',
  traditional: 'trad',
  traditionalSpouse: 'tradSp',
  roth: 'roth',
  taxable: 'taxable',
  cash: 'cash',
  propertyTax: 'ptax',
  medicalExpense: 'med',
  otherNondeductible: 'exp',
  caProp13PropertyTaxLimit: 'prop13',
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

function parseBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === null) {
    return fallback
  }

  if (raw === '1' || raw === 'true') {
    return true
  }

  if (raw === '0' || raw === 'false') {
    return false
  }

  return fallback
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
  const legacyPrimaryAgeParam = params.get(QUERY_KEYS.legacyPrimaryAge)
  const primaryBirthYearFallback = legacyPrimaryAgeParam === null
    ? base.people.primaryBirthYear
    : base.currentYear - parseNumber(legacyPrimaryAgeParam, base.people.primaryCurrentAge)
  const primaryBirthYear = parseNumber(
    params.get(QUERY_KEYS.primaryBirthYear),
    primaryBirthYearFallback,
  )
  const next: RothConversionInputs = {
    ...base,
    filingStatus: parseFilingStatus(params.get(QUERY_KEYS.filingStatus), base.filingStatus),
    people: {
      ...base.people,
      primaryBirthYear,
      primaryEndAge: parseNumber(params.get(QUERY_KEYS.endAge), base.people.primaryEndAge),
      spouseBirthYear: parseNumber(params.get(QUERY_KEYS.spouseBirthYear), base.people.spouseBirthYear),
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
    expenses: {
      ...base.expenses,
      propertyTax: parseMoney(params.get(QUERY_KEYS.propertyTax), base.expenses.propertyTax),
      medicalExpense: parseMoney(params.get(QUERY_KEYS.medicalExpense), base.expenses.medicalExpense),
      otherNondeductible: parseMoney(params.get(QUERY_KEYS.otherNondeductible), base.expenses.otherNondeductible),
      caProp13PropertyTaxLimit: parseBoolean(params.get(QUERY_KEYS.caProp13PropertyTaxLimit), base.expenses.caProp13PropertyTaxLimit),
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

  const parsed = rothConversionInputsSchema.safeParse(normalizeRothConversionInputs(next))
  return parsed.success ? parsed.data : base
}

export function serializeRothConversionUrlState(inputs: RothConversionInputs): string {
  const params = new URLSearchParams()
  const defaults = DEFAULT_ROTH_CONVERSION_INPUTS
  const normalizedInputs = normalizeRothConversionInputs(inputs)

  if (normalizedInputs.filingStatus !== defaults.filingStatus) {
    params.set(QUERY_KEYS.filingStatus, normalizedInputs.filingStatus)
  }
  if (normalizedInputs.people.primaryBirthYear !== defaults.people.primaryBirthYear) {
    params.set(QUERY_KEYS.primaryBirthYear, String(normalizedInputs.people.primaryBirthYear))
  }
  if (normalizedInputs.people.primaryEndAge !== defaults.people.primaryEndAge) {
    params.set(QUERY_KEYS.endAge, String(normalizedInputs.people.primaryEndAge))
  }
  if (isMarriedFilingStatus(normalizedInputs.filingStatus) && normalizedInputs.people.spouseBirthYear !== defaults.people.spouseBirthYear) {
    params.set(QUERY_KEYS.spouseBirthYear, String(normalizedInputs.people.spouseBirthYear))
  }
  if (normalizedInputs.income.retirementAgePrimary !== defaults.income.retirementAgePrimary) {
    params.set(QUERY_KEYS.retirementAge, String(normalizedInputs.income.retirementAgePrimary))
  }
  if (normalizedInputs.income.taxExemptInterest !== defaults.income.taxExemptInterest) {
    params.set(QUERY_KEYS.taxExemptInterest, String(normalizedInputs.income.taxExemptInterest))
  }
  if (normalizedInputs.balances.traditionalPrimary !== defaults.balances.traditionalPrimary) {
    params.set(QUERY_KEYS.traditional, String(normalizedInputs.balances.traditionalPrimary))
  }
  if (isMarriedFilingStatus(normalizedInputs.filingStatus) && normalizedInputs.balances.traditionalSpouse !== defaults.balances.traditionalSpouse) {
    params.set(QUERY_KEYS.traditionalSpouse, String(normalizedInputs.balances.traditionalSpouse))
  }
  if (normalizedInputs.balances.rothPrimary !== defaults.balances.rothPrimary) {
    params.set(QUERY_KEYS.roth, String(normalizedInputs.balances.rothPrimary))
  }
  if (normalizedInputs.balances.taxableBrokerage !== defaults.balances.taxableBrokerage) {
    params.set(QUERY_KEYS.taxable, String(normalizedInputs.balances.taxableBrokerage))
  }
  if (normalizedInputs.balances.cash !== defaults.balances.cash) {
    params.set(QUERY_KEYS.cash, String(normalizedInputs.balances.cash))
  }
  if (normalizedInputs.expenses.propertyTax !== defaults.expenses.propertyTax) {
    params.set(QUERY_KEYS.propertyTax, String(normalizedInputs.expenses.propertyTax))
  }
  if (normalizedInputs.expenses.medicalExpense !== defaults.expenses.medicalExpense) {
    params.set(QUERY_KEYS.medicalExpense, String(normalizedInputs.expenses.medicalExpense))
  }
  if (normalizedInputs.expenses.otherNondeductible !== defaults.expenses.otherNondeductible) {
    params.set(QUERY_KEYS.otherNondeductible, String(normalizedInputs.expenses.otherNondeductible))
  }
  if (normalizedInputs.expenses.caProp13PropertyTaxLimit !== defaults.expenses.caProp13PropertyTaxLimit) {
    params.set(QUERY_KEYS.caProp13PropertyTaxLimit, normalizedInputs.expenses.caProp13PropertyTaxLimit ? '1' : '0')
  }
  if (normalizedInputs.strategy.annualConversion !== defaults.strategy.annualConversion) {
    params.set(QUERY_KEYS.annualConversion, String(normalizedInputs.strategy.annualConversion))
  }
  if (normalizedInputs.strategy.conversionMode !== defaults.strategy.conversionMode) {
    params.set(QUERY_KEYS.conversionMode, normalizedInputs.strategy.conversionMode)
  }
  if (normalizedInputs.strategy.bracketTarget !== defaults.strategy.bracketTarget) {
    params.set(QUERY_KEYS.bracketTarget, String(normalizedInputs.strategy.bracketTarget))
  }
  if (normalizedInputs.socialSecurity.claimAgePrimary !== defaults.socialSecurity.claimAgePrimary) {
    params.set(QUERY_KEYS.claimAgePrimary, String(normalizedInputs.socialSecurity.claimAgePrimary))
  }
  if (normalizedInputs.assumptions.stateTaxPercent !== defaults.assumptions.stateTaxPercent) {
    params.set(QUERY_KEYS.stateTaxPercent, String(normalizedInputs.assumptions.stateTaxPercent))
  }
  if (normalizedInputs.assumptions.inflationPercent !== defaults.assumptions.inflationPercent) {
    params.set(QUERY_KEYS.inflationPercent, String(normalizedInputs.assumptions.inflationPercent))
  }
  if (normalizedInputs.assumptions.postRetirementGrowthPercent !== defaults.assumptions.postRetirementGrowthPercent) {
    params.set(QUERY_KEYS.growthPercent, String(normalizedInputs.assumptions.postRetirementGrowthPercent))
  }
  if (normalizedInputs.assumptions.cashYieldPercent !== defaults.assumptions.cashYieldPercent) {
    params.set(QUERY_KEYS.cashYieldPercent, String(normalizedInputs.assumptions.cashYieldPercent))
  }
  if (normalizedInputs.assumptions.priorYearMagi !== defaults.assumptions.priorYearMagi) {
    params.set(QUERY_KEYS.priorYearMagi, String(normalizedInputs.assumptions.priorYearMagi))
  }
  if (normalizedInputs.assumptions.twoYearsPriorMagi !== defaults.assumptions.twoYearsPriorMagi) {
    params.set(QUERY_KEYS.twoYearsPriorMagi, String(normalizedInputs.assumptions.twoYearsPriorMagi))
  }

  return params.toString()
}
