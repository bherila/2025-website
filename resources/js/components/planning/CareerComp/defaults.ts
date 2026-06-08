import type { CareerCompInputs, JobSpec, ModelAssumptions, OptionGrant, RsuGrant } from './types'

const currentYear = new Date().getFullYear()

export function buildDefaultRsuGrant(jobId: string, ordinal: number): RsuGrant {
  return {
    id: `${jobId}-rsu-${ordinal}`,
    kind: ordinal === 1 ? 'hire' : 'refresher',
    grantDate: `${currentYear}-01-01`,
    vestingStartDate: null,
    shareCount: 1000,
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'monthly',
    vestingEvents: [],
  }
}

export function buildDefaultOptionGrant(jobId: string, ordinal: number): OptionGrant {
  return {
    id: `${jobId}-opt-${ordinal}`,
    kind: ordinal === 1 ? 'hire' : 'refresher',
    type: 'iso',
    grantDate: `${currentYear}-01-01`,
    vestingStartDate: null,
    shareCount: 4000,
    strike: 5,
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'monthly',
    earlyExercise83b: false,
  }
}

export function buildDefaultJob(id: string, name: string): JobSpec {
  return {
    id,
    name,
    notesMarkdown: null,
    archived: false,
    startDate: null,
    priorJobResignationDate: null,
    transitionOverride: {
      currentJobNoticeWeeks: null,
      timeOffBetweenJobsWeeks: null,
    },
    retainedCurrentJobIds: [],
    company: {
      type: 'public',
      currentSharePrice: 25,
      fourNineA: 5,
      fullyDilutedShares: 100000000,
      annualDilutionPct: 3,
      liquidityDate: `${currentYear + 4}-01-01`,
      valuationScenarios: [{
        id: 'base',
        label: 'Base case',
        outcome: 'medium',
        stages: [{
          id: 'stage-current',
          year: currentYear,
          stage: 'Current',
          preferredPostMoneyValuation: 100000000,
          capitalDilutionPct: 0,
          employeePoolDilutionPct: 0,
          commonFmv: 5,
          commonFmvDiscountPct: 0,
          liquidityEvent: false,
        }],
      }],
    },
    comp: {
      baseSalary: 180000,
      cashBonus: 25000,
      annualRaisePct: 0,
    },
    refresher: {
      pctOfBase: 0,
      optionPctOfFullyDilutedShares: 0,
      optionType: 'iso',
      cadenceYears: 1,
      firstYearOffset: 1,
      vestingYears: 4,
      cliffMonths: 0,
      vestingFrequency: 'monthly',
    },
    grantTypes: {
      rsu: true,
      options: true,
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

export const DEFAULT_MODEL_ASSUMPTIONS: ModelAssumptions = {
  commonFmvPctOfPreferred: {
    stageA: 15,
    stageB: 25,
    stageC: 40,
    bridge: 50,
    stageD: 65,
    stageE: 80,
    liquidityEvent: 100,
  },
  tax: {
    filingStatus: 'single',
  },
  careerTransition: {
    currentJobNoticeWeeks: 2,
    timeOffBetweenJobsWeeks: 0,
  },
}

export const DEFAULT_CAREER_COMP_INPUTS: CareerCompInputs = {
  horizonYears: 10,
  startYear: currentYear,
  modelAssumptions: DEFAULT_MODEL_ASSUMPTIONS,
  currentJobs: [],
  hypotheticalJobs: [buildDefaultJob('hyp-1', 'Offer 1')],
}
