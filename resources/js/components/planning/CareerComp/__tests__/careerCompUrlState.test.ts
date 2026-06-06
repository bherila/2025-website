import { cloneJobWithId, parseCareerCompUrlState, serializeCareerCompUrlState } from '../careerCompUrlState'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerCompInputs } from '../types'

describe('careerCompUrlState', () => {
  it('round-trips non-default inputs through compact URL state', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      horizonYears: 7,
      startYear: 2027,
      currentJob: cloneJobWithId(DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!, 'current', 'Current job'),
      hypotheticalJobs: [
        {
          ...DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!,
          id: 'hyp-1',
          name: 'Offer A',
          comp: { baseSalary: 225000, cashBonus: 50000 },
          company: { ...DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!.company, type: 'private', fourNineA: 7.5 },
        },
      ],
    }

    const serialized = serializeCareerCompUrlState(inputs)
    expect(serialized).toContain('cc=')
    expect(parseCareerCompUrlState(serialized)).toEqual(inputs)
  })

  it('can exclude current job without using a forked serializer', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      currentJob: cloneJobWithId(DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!, 'current', 'Current job'),
    }

    const parsed = parseCareerCompUrlState(serializeCareerCompUrlState(inputs, { excludeCurrent: true }))
    expect(parsed.currentJob).toBeNull()
  })

  it('exclusive variant carries no current-job dollar values while inclusive does', () => {
    const inputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      currentJob: {
        ...cloneJobWithId(DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!, 'current', 'Confidential Current'),
        comp: { baseSalary: 424242, cashBonus: 1234 },
      },
      hypotheticalJobs: [
        { ...DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!, name: 'Public Offer', comp: { baseSalary: 191919, cashBonus: 4321 } },
      ],
    }

    const exclusive = JSON.stringify(parseCareerCompUrlState(serializeCareerCompUrlState(inputs, { excludeCurrent: true })))
    expect(exclusive).not.toContain('424242')
    expect(exclusive).not.toContain('Confidential Current')
    expect(exclusive).toContain('191919')

    const inclusive = JSON.stringify(parseCareerCompUrlState(serializeCareerCompUrlState(inputs)))
    expect(inclusive).toContain('424242')
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
  })
})
