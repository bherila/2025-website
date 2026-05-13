import { DEFAULT_ROTH_CONVERSION_INPUTS } from '../defaults'
import { parseRothConversionUrlState, serializeRothConversionUrlState } from '../rothConversionUrlState'

describe('rothConversionUrlState', () => {
  it('parses compact URL state into planner inputs', () => {
    const birthYear = DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 60
    const parsed = parseRothConversionUrlState(`?fs=single&birth=${birthYear}&end=90&trad=500000&conv=25000&mode=fill_bracket&bracket=32&ss=67`)

    expect(parsed.filingStatus).toBe('single')
    expect(parsed.people.primaryBirthYear).toBe(birthYear)
    expect(parsed.people.primaryCurrentAge).toBe(60)
    expect(parsed.people.primaryEndAge).toBe(90)
    expect(parsed.balances.traditionalPrimary).toBe(500000)
    expect(parsed.strategy.annualConversion).toBe(25000)
    expect(parsed.strategy.conversionMode).toBe('fill_bracket')
    expect(parsed.strategy.bracketTarget).toBe(32)
    expect(parsed.socialSecurity.claimAgePrimary).toBe(67)
    expect(parseRothConversionUrlState('?mode=schedule').strategy.conversionMode).toBe('schedule')
  })

  it('parses legacy age URL state by deriving the birth year', () => {
    const parsed = parseRothConversionUrlState('?age=60')

    expect(parsed.people.primaryBirthYear).toBe(DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 60)
    expect(parsed.people.primaryCurrentAge).toBe(60)
  })

  it('falls back for malformed conversion mode and bracket query values', () => {
    const parsed = parseRothConversionUrlState('?mode=bogus&bracket=13')

    expect(parsed.strategy.conversionMode).toBe(DEFAULT_ROTH_CONVERSION_INPUTS.strategy.conversionMode)
    expect(parsed.strategy.bracketTarget).toBe(DEFAULT_ROTH_CONVERSION_INPUTS.strategy.bracketTarget)
  })

  it('serializes only values that differ from defaults', () => {
    const inputs = {
      ...DEFAULT_ROTH_CONVERSION_INPUTS,
      people: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.people,
        primaryBirthYear: DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 61,
        primaryCurrentAge: 61,
      },
      strategy: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.strategy,
        annualConversion: 10000,
      },
    }

    expect(serializeRothConversionUrlState(inputs)).toBe(`birth=${DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 61}&conv=10000`)
  })

  it('round trips serialized URL state through the parser', () => {
    const inputs = {
      ...DEFAULT_ROTH_CONVERSION_INPUTS,
      filingStatus: 'single' as const,
      people: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.people,
        primaryBirthYear: DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 62,
        primaryCurrentAge: 62,
        primaryEndAge: 92,
      },
      income: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.income,
        retirementAgePrimary: 64,
        taxExemptInterest: 7_500,
      },
      balances: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.balances,
        traditionalPrimary: 600_000,
        traditionalSpouse: 25_000,
        rothPrimary: 175_000,
        taxableBrokerage: 250_000,
        cash: 20_000,
      },
      strategy: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.strategy,
        conversionMode: 'constant' as const,
        annualConversion: 35_000,
        bracketTarget: 22 as const,
      },
      socialSecurity: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.socialSecurity,
        claimAgePrimary: 68,
      },
      assumptions: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.assumptions,
        stateTaxPercent: 6,
        inflationPercent: 3,
        postRetirementGrowthPercent: 4,
        cashYieldPercent: 1.25,
        priorYearMagi: 120_000,
        twoYearsPriorMagi: 110_000,
      },
    }

    const reparsed = parseRothConversionUrlState(serializeRothConversionUrlState(inputs))

    expect(reparsed.filingStatus).toBe(inputs.filingStatus)
    expect(reparsed.people.primaryBirthYear).toBe(inputs.people.primaryBirthYear)
    expect(reparsed.people.primaryCurrentAge).toBe(inputs.people.primaryCurrentAge)
    expect(reparsed.people.primaryEndAge).toBe(inputs.people.primaryEndAge)
    expect(reparsed.income.retirementAgePrimary).toBe(inputs.income.retirementAgePrimary)
    expect(reparsed.income.taxExemptInterest).toBe(inputs.income.taxExemptInterest)
    expect(reparsed.balances.traditionalPrimary).toBe(inputs.balances.traditionalPrimary)
    expect(reparsed.balances.traditionalSpouse).toBe(0)
    expect(reparsed.balances.rothPrimary).toBe(inputs.balances.rothPrimary)
    expect(reparsed.balances.taxableBrokerage).toBe(inputs.balances.taxableBrokerage)
    expect(reparsed.balances.cash).toBe(inputs.balances.cash)
    expect(reparsed.strategy.conversionMode).toBe(inputs.strategy.conversionMode)
    expect(reparsed.strategy.annualConversion).toBe(inputs.strategy.annualConversion)
    expect(reparsed.strategy.bracketTarget).toBe(inputs.strategy.bracketTarget)
    expect(reparsed.socialSecurity.claimAgePrimary).toBe(inputs.socialSecurity.claimAgePrimary)
    expect(reparsed.assumptions.stateTaxPercent).toBe(inputs.assumptions.stateTaxPercent)
    expect(reparsed.assumptions.inflationPercent).toBe(inputs.assumptions.inflationPercent)
    expect(reparsed.assumptions.postRetirementGrowthPercent).toBe(inputs.assumptions.postRetirementGrowthPercent)
    expect(reparsed.assumptions.cashYieldPercent).toBe(inputs.assumptions.cashYieldPercent)
    expect(reparsed.assumptions.priorYearMagi).toBe(inputs.assumptions.priorYearMagi)
    expect(reparsed.assumptions.twoYearsPriorMagi).toBe(inputs.assumptions.twoYearsPriorMagi)
  })
})
