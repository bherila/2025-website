import { normalizeCareerCompInputs } from '../inputUtils'

describe('normalizeCareerCompInputs (backend-shaped inputs)', () => {
  it('keeps a current job whose nullable backend fields (liquidityDate, grantValue) are null', () => {
    // Mirrors the shape emitted by CareerCompInputs::defaults() on the PHP side, where
    // public-company liquidityDate and share-count-based RSU grantValue are null.
    const serverInputs = {
      horizonYears: 10,
      startYear: 2026,
      currentJob: {
        id: 'current',
        name: 'Current role',
        startDate: null,
        company: { type: 'public', currentSharePrice: 80, fourNineA: 0, fullyDilutedShares: 0, annualDilutionPct: 0, liquidityDate: null },
        comp: { baseSalary: 185000, cashBonus: 25000 },
        rsuGrants: [{ id: 'current-rsu-hire', kind: 'hire', grantDate: '2026-01-01', shareCount: 1000, grantValue: null, grantPrice: 80, cliffMonths: 12, vestingYears: 4 }],
        optionGrants: [],
        growthBands: { lowPct: 0, mediumPct: 5, highPct: 10 },
      },
      hypotheticalJobs: [],
    }

    const normalized = normalizeCareerCompInputs(serverInputs)

    expect(normalized.currentJob).not.toBeNull()
    expect(normalized.currentJob?.id).toBe('current')
    expect(normalized.currentJob?.startDate).toBeNull()
    expect(normalized.currentJob?.rsuGrants).toHaveLength(1)
    expect(normalized.currentJob?.rsuGrants[0]?.shareCount).toBe(1000)
  })

  it('clamps horizonYears to the backend-accepted maximum of 30', () => {
    const normalized = normalizeCareerCompInputs({
      horizonYears: 45,
      startYear: 2026,
      currentJob: null,
      hypotheticalJobs: [],
    })

    expect(normalized.horizonYears).toBe(30)
  })

  it('coerces empty optional dates to null and drops grants with no grant date', () => {
    const inputs = {
      horizonYears: 5,
      startYear: 2026,
      currentJob: null,
      hypotheticalJobs: [{
        id: 'hyp-1',
        name: 'Offer 1',
        startDate: '',
        company: { type: 'public', currentSharePrice: 25, fourNineA: 5, fullyDilutedShares: 100000000, annualDilutionPct: 3, liquidityDate: '' },
        comp: { baseSalary: 180000, cashBonus: 25000 },
        rsuGrants: [
          { id: 'r-keep', kind: 'hire', grantDate: '2026-01-01', shareCount: 1000, cliffMonths: 12, vestingYears: 4 },
          { id: 'r-drop', kind: 'refresher', grantDate: '', shareCount: 500, cliffMonths: 12, vestingYears: 4 },
        ],
        optionGrants: [
          { id: 'o-drop', kind: 'hire', type: 'iso', grantDate: '', shareCount: 4000, strike: 5, cliffMonths: 12, vestingYears: 4, earlyExercise83b: false },
        ],
        growthBands: { lowPct: 0, mediumPct: 8, highPct: 18 },
      }],
    }

    const normalized = normalizeCareerCompInputs(inputs)
    const job = normalized.hypotheticalJobs[0]

    expect(job?.company.liquidityDate).toBeNull()
    expect(job?.startDate).toBeNull()
    expect(job?.rsuGrants).toHaveLength(1)
    expect(job?.rsuGrants[0]?.id).toBe('r-keep')
    expect(job?.optionGrants).toHaveLength(0)
  })

  it('normalizes disabled grant families out of submitted inputs', () => {
    const inputs = {
      horizonYears: 5,
      startYear: 2026,
      currentJob: null,
      hypotheticalJobs: [{
        id: 'hyp-1',
        name: 'Offer 1',
        company: { type: 'public', currentSharePrice: 25, fourNineA: 5, fullyDilutedShares: 100000000, annualDilutionPct: 3, liquidityDate: null },
        comp: { baseSalary: 180000, cashBonus: 25000 },
        grantTypes: { rsu: false, options: false },
        refresher: {
          pctOfBase: 20,
          optionPctOfFullyDilutedShares: 1.5,
          optionType: 'iso',
          cadenceYears: 1,
          firstYearOffset: 1,
          vestingYears: 4,
          cliffMonths: 0,
          vestingFrequency: 'monthly',
        },
        rsuGrants: [{ id: 'r-hidden', kind: 'hire', grantDate: '2026-01-01', shareCount: 1000, cliffMonths: 12, vestingYears: 4 }],
        optionGrants: [{ id: 'o-hidden', kind: 'hire', type: 'iso', grantDate: '2026-01-01', shareCount: 4000, strike: 5, cliffMonths: 12, vestingYears: 4, earlyExercise83b: false }],
        growthBands: { lowPct: 0, mediumPct: 8, highPct: 18 },
      }],
    }

    const normalized = normalizeCareerCompInputs(inputs)
    const job = normalized.hypotheticalJobs[0]

    expect(job?.grantTypes).toEqual({ rsu: false, options: false })
    expect(job?.refresher.pctOfBase).toBe(0)
    expect(job?.refresher.optionPctOfFullyDilutedShares).toBe(0)
    expect(job?.rsuGrants).toHaveLength(0)
    expect(job?.optionGrants).toHaveLength(0)
  })
})
