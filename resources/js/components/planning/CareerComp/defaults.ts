import type { CareerCompInputs, JobSpec, OptionGrant, RsuGrant } from './types'

const currentYear = new Date().getFullYear()

export function buildDefaultRsuGrant(jobId: string, ordinal: number): RsuGrant {
  return {
    id: `${jobId}-rsu-${ordinal}`,
    kind: ordinal === 1 ? 'hire' : 'refresher',
    grantDate: `${currentYear}-01-01`,
    shareCount: 1000,
    cliffMonths: 12,
    vestingYears: 4,
  }
}

export function buildDefaultOptionGrant(jobId: string, ordinal: number): OptionGrant {
  return {
    id: `${jobId}-opt-${ordinal}`,
    kind: ordinal === 1 ? 'hire' : 'refresher',
    type: 'iso',
    grantDate: `${currentYear}-01-01`,
    shareCount: 4000,
    strike: 5,
    cliffMonths: 12,
    vestingYears: 4,
    earlyExercise83b: false,
  }
}

export function buildDefaultJob(id: string, name: string): JobSpec {
  return {
    id,
    name,
    company: {
      type: 'public',
      currentSharePrice: 25,
      fourNineA: 5,
      fullyDilutedShares: 100000000,
      annualDilutionPct: 3,
      liquidityDate: `${currentYear + 4}-01-01`,
    },
    comp: {
      baseSalary: 180000,
      cashBonus: 25000,
    },
    rsuGrants: [buildDefaultRsuGrant(id, 1)],
    optionGrants: [buildDefaultOptionGrant(id, 1)],
    growthBands: {
      lowPct: 0,
      mediumPct: 8,
      highPct: 18,
    },
  }
}

export const DEFAULT_CAREER_COMP_INPUTS: CareerCompInputs = {
  horizonYears: 10,
  startYear: currentYear,
  currentJob: null,
  hypotheticalJobs: [buildDefaultJob('hyp-1', 'Offer 1')],
}
