import type { FilingStatus, RothConversionInputs } from './types'

export function findMeta<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((item) => item.id === id)

  if (!found) {
    throw new Error(`Unknown Roth conversion metadata id: ${id}`)
  }

  return found
}

export function isMarriedFilingStatus(status: FilingStatus): boolean {
  return status === 'married_filing_jointly' || status === 'qualifying_surviving_spouse'
}

export function ageFromBirthYear(currentYear: number, birthYear: number): number {
  return Math.max(0, Math.round(currentYear - birthYear))
}

export function deriveRothConversionAges(inputs: RothConversionInputs): RothConversionInputs {
  return {
    ...inputs,
    people: {
      ...inputs.people,
      primaryCurrentAge: ageFromBirthYear(inputs.currentYear, inputs.people.primaryBirthYear),
      spouseCurrentAge: ageFromBirthYear(inputs.currentYear, inputs.people.spouseBirthYear),
    },
  }
}

interface NormalizeRothConversionInputsOptions {
  preserveCurrentAges?: boolean
}

export function normalizeRothConversionInputs(inputs: RothConversionInputs, options: NormalizeRothConversionInputsOptions = {}): RothConversionInputs {
  const derived = options.preserveCurrentAges ? inputs : deriveRothConversionAges(inputs)

  if (isMarriedFilingStatus(derived.filingStatus)) {
    return derived
  }

  return {
    ...derived,
    people: {
      ...derived.people,
      firstDeathAge: null,
    },
    income: {
      ...derived.income,
      wagesSpouse: 0,
      selfEmploymentSpouse: 0,
    },
    socialSecurity: {
      ...derived.socialSecurity,
      piaSpouse: 0,
    },
    balances: {
      ...derived.balances,
      traditionalSpouse: 0,
      rothSpouse: 0,
    },
  }
}
