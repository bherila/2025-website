import { DEFAULT_OPPORTUNITY_COST_INPUTS } from '../defaults'
import { cloneJobWithId, parseOpportunityCostUrlState, serializeOpportunityCostUrlState } from '../opportunityCostUrlState'
import type { OpportunityCostInputs } from '../types'

describe('opportunityCostUrlState', () => {
  it('round-trips non-default inputs through compact URL state', () => {
    const inputs: OpportunityCostInputs = {
      ...DEFAULT_OPPORTUNITY_COST_INPUTS,
      horizonYears: 7,
      startYear: 2027,
      currentJob: cloneJobWithId(DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!, 'current', 'Current job'),
      hypotheticalJobs: [
        {
          ...DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!,
          id: 'hyp-1',
          name: 'Offer A',
          comp: { baseSalary: 225000, cashBonus: 50000 },
          company: { ...DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!.company, type: 'private', fourNineA: 7.5 },
        },
      ],
    }

    const serialized = serializeOpportunityCostUrlState(inputs)
    expect(serialized).toContain('oc=')
    expect(parseOpportunityCostUrlState(serialized)).toEqual(inputs)
  })

  it('can exclude current job without using a forked serializer', () => {
    const inputs: OpportunityCostInputs = {
      ...DEFAULT_OPPORTUNITY_COST_INPUTS,
      currentJob: cloneJobWithId(DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!, 'current', 'Current job'),
    }

    const parsed = parseOpportunityCostUrlState(serializeOpportunityCostUrlState(inputs, { excludeCurrent: true }))
    expect(parsed.currentJob).toBeNull()
  })

  it('exclusive variant carries no current-job dollar values while inclusive does', () => {
    const inputs: OpportunityCostInputs = {
      ...DEFAULT_OPPORTUNITY_COST_INPUTS,
      currentJob: {
        ...cloneJobWithId(DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!, 'current', 'Confidential Current'),
        comp: { baseSalary: 424242, cashBonus: 1234 },
      },
      hypotheticalJobs: [
        { ...DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs[0]!, name: 'Public Offer', comp: { baseSalary: 191919, cashBonus: 4321 } },
      ],
    }

    const exclusive = JSON.stringify(parseOpportunityCostUrlState(serializeOpportunityCostUrlState(inputs, { excludeCurrent: true })))
    expect(exclusive).not.toContain('424242')
    expect(exclusive).not.toContain('Confidential Current')
    expect(exclusive).toContain('191919')

    const inclusive = JSON.stringify(parseOpportunityCostUrlState(serializeOpportunityCostUrlState(inputs)))
    expect(inclusive).toContain('424242')
  })

  it('falls back to base inputs when payload parsing fails', () => {
    expect(parseOpportunityCostUrlState('?oc=not-valid', DEFAULT_OPPORTUNITY_COST_INPUTS)).toEqual(DEFAULT_OPPORTUNITY_COST_INPUTS)
  })
})
