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

/**
 * Legacy scenarios stored `primaryCurrentAge` as canonical and let `primaryBirthYear` drift.
 * Backfill the birth year from the saved age so display and compute agree under the new
 * birth-year-canonical model.
 */
export function reconcileLegacyBirthYears(inputs: RothConversionInputs): RothConversionInputs {
  const primaryDerived = ageFromBirthYear(inputs.currentYear, inputs.people.primaryBirthYear)
  const spouseDerived = ageFromBirthYear(inputs.currentYear, inputs.people.spouseBirthYear)
  const primaryMatches = primaryDerived === inputs.people.primaryCurrentAge
  const spouseMatches = spouseDerived === inputs.people.spouseCurrentAge

  if (primaryMatches && spouseMatches) {
    return inputs
  }

  return {
    ...inputs,
    people: {
      ...inputs.people,
      primaryBirthYear: primaryMatches ? inputs.people.primaryBirthYear : inputs.currentYear - inputs.people.primaryCurrentAge,
      spouseBirthYear: spouseMatches ? inputs.people.spouseBirthYear : inputs.currentYear - inputs.people.spouseCurrentAge,
    },
  }
}

export function normalizeRothConversionInputs(inputs: RothConversionInputs): RothConversionInputs {
  const derived = deriveRothConversionAges(inputs)

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
