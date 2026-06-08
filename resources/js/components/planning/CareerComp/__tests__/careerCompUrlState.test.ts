import { parseCareerCompUrlState, serializeCareerCompUrlState } from '../careerCompUrlState'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerCompInputs } from '../types'

const baseJob = DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!

describe('careerCompUrlState', () => {
  it('round-trips non-default inputs through compact URL state', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      horizonYears: 7,
      startYear: 2027,
      modelAssumptions: {
        ...DEFAULT_CAREER_COMP_INPUTS.modelAssumptions,
        careerTransition: {
          currentJobNoticeWeeks: 3,
          timeOffBetweenJobsWeeks: 1,
        },
      },
      currentJobs: [{ ...baseJob, id: 'current', name: 'Current job' }],
      hypotheticalJobs: [
        {
          ...baseJob,
          id: 'hyp-1',
          name: 'Offer A',
          startDate: '2027-03-15',
          priorJobResignationDate: '2027-02-15',
          transitionOverride: {
            currentJobNoticeWeeks: 2,
            timeOffBetweenJobsWeeks: 2,
          },
          comp: { ...baseJob.comp, baseSalary: 225000, cashBonus: 50000 },
          company: { ...baseJob.company, type: 'private', fourNineA: 7.5 },
        },
      ],
    }

    const serialized = serializeCareerCompUrlState(inputs)
    expect(serialized).toContain('cc=')
    expect(parseCareerCompUrlState(serialized)).toEqual(inputs)
  })

  it('round-trips raise + refresher policy fields', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      hypotheticalJobs: [
        {
          ...baseJob,
          comp: { ...baseJob.comp, annualRaisePct: 4 },
          refresher: { ...baseJob.refresher, pctOfBase: 50, cadenceYears: 2, vestingYears: 4 },
        },
      ],
    }

    const parsed = parseCareerCompUrlState(serializeCareerCompUrlState(inputs))
    expect(parsed.hypotheticalJobs[0]?.comp.annualRaisePct).toBe(4)
    expect(parsed.hypotheticalJobs[0]?.refresher.pctOfBase).toBe(50)
    expect(parsed.hypotheticalJobs[0]?.refresher.cadenceYears).toBe(2)
  })

  it('excludes offer notes from compact URL state', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      hypotheticalJobs: [
        {
          ...baseJob,
          notesMarkdown: 'x'.repeat(5000),
        },
      ],
    }

    expect(serializeCareerCompUrlState(inputs)).toBe('')
  })

  it('falls back to base inputs when payload parsing fails', () => {
    expect(parseCareerCompUrlState('?cc=not-valid', DEFAULT_CAREER_COMP_INPUTS)).toEqual(DEFAULT_CAREER_COMP_INPUTS)
  })

  it('degrades a legacy shared link whose grants predate vestingFrequency to monthly', () => {
    // Mirrors a 'cc=' payload encoded before vestingFrequency existed: the grant has no such key.
    const legacyDiff = {
      hypotheticalJobs: [
        {
          id: 'hyp-1',
          name: 'Legacy offer',
          company: { type: 'public', currentSharePrice: 30, fourNineA: 0, fullyDilutedShares: 0, annualDilutionPct: 0, liquidityDate: null },
          comp: { baseSalary: 150000, cashBonus: 0 },
          rsuGrants: [{ id: 'r1', kind: 'hire', grantDate: '2026-01-01', shareCount: 800, cliffMonths: 12, vestingYears: 4 }],
          optionGrants: [],
          growthBands: { lowPct: 0, mediumPct: 5, highPct: 10 },
        },
      ],
    }
    const payload = btoa(encodeURIComponent(JSON.stringify(legacyDiff)))

    const parsed = parseCareerCompUrlState(`cc=${payload}`)

    expect(parsed.hypotheticalJobs[0]?.name).toBe('Legacy offer')
    expect(parsed.hypotheticalJobs[0]?.rsuGrants[0]?.vestingFrequency).toBe('monthly')
    // Predates raises/refreshers → fills safe defaults (feature off).
    expect(parsed.hypotheticalJobs[0]?.comp.annualRaisePct).toBe(0)
    expect(parsed.hypotheticalJobs[0]?.refresher.pctOfBase).toBe(0)
  })
})
