import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import { mapAfterTaxLiquidityChartData, mapPaperEquityChartData, mapPaperEquitySeries } from '../mappers'
import type { CareerCompProjection } from '../types'

describe('Career Comparison chart data mappers', () => {
  it('bases after-tax liquidity on cash-inclusive FCF without double-counting medium equity proceeds', () => {
    const projection: CareerCompProjection = {
      startYear: 2026,
      horizonYears: 2,
      currentJobId: 'salary-heavy',
      jobs: [
        {
          id: 'salary-heavy',
          name: 'Salary-heavy role',
          isCurrent: true,
          annual: [
            {
              year: 2026,
              salary: 200000,
              bonus: 0,
              vestedLiquidEquity: 1000,
              shareSaleProceeds: 1000,
              exerciseOutlay: 0,
              freeCashFlow: 201000,
            },
            {
              year: 2027,
              salary: 200000,
              bonus: 0,
              vestedLiquidEquity: 0,
              shareSaleProceeds: 0,
              exerciseOutlay: 0,
              freeCashFlow: 200000,
            },
          ],
          liquidity: {
            low: [
              { year: 2026, cumulativeValue: 500 },
              { year: 2027, cumulativeValue: 500 },
            ],
            medium: [
              { year: 2026, cumulativeValue: 1000 },
              { year: 2027, cumulativeValue: 1600 },
            ],
            high: [
              { year: 2026, cumulativeValue: 2000 },
              { year: 2027, cumulativeValue: 2500 },
            ],
          },
          paperEquity: {
            scenarios: [{
              id: 'base',
              label: 'Base',
              outcome: 'medium',
              totalNetPaperValue: 90000,
              points: [
                { year: 2026, stage: 'A', preferredPostMoneyValuation: 100000000, capitalDilutionPct: 0, employeePoolDilutionPct: 0, dilutedOwnershipPct: 0.05, commonFmv: 10, grossOwnershipValue: 50000, grossCommonValue: 10000, commonIntrinsicValue: 9000, exerciseCost: 1000, netPaperValue: 49000, liquidityEvent: false },
                { year: 2027, stage: 'B', preferredPostMoneyValuation: 200000000, capitalDilutionPct: 10, employeePoolDilutionPct: 5, dilutedOwnershipPct: 0.045, commonFmv: 20, grossOwnershipValue: 90000, grossCommonValue: 20000, commonIntrinsicValue: 18000, exerciseCost: 2000, netPaperValue: 88000, liquidityEvent: false },
              ],
            }],
            totalsByOutcome: { low: 0, medium: 90000, high: 0 },
          },
          vesting: [],
          lifetime: {
            totalCashComp: 400000,
            totalEquityValue: { low: 500, medium: 1600, high: 2500 },
            totalPaperEquityValue: { low: 0, medium: 90000, high: 0 },
            totalValue: { low: 400500, medium: 401600, high: 402500 },
            totalPaperValue: { low: 400000, medium: 490000, high: 400000 },
          },
          afterTax: {
            annual: [
              {
                year: 2026,
                taxableCompIncome: 200000,
                nsoOrdinaryIncome: 0,
                isoAmtPreference: 0,
                equitySaleProceeds: 1000,
                estimatedRegularTax: 51000,
                estimatedAmt: 0,
                totalEstimatedTax: 51000,
                freeCashFlow: 150000,
                sourceIds: [],
              },
              {
                year: 2027,
                taxableCompIncome: 200000,
                nsoOrdinaryIncome: 0,
                isoAmtPreference: 0,
                equitySaleProceeds: 0,
                estimatedRegularTax: 50000,
                estimatedAmt: 0,
                totalEstimatedTax: 50000,
                freeCashFlow: 150000,
                sourceIds: [],
              },
            ],
            lifetime: {
              taxableCompIncome: 400000,
              nsoOrdinaryIncome: 0,
              isoAmtPreference: 0,
              equitySaleProceeds: 1000,
              estimatedRegularTax: 101000,
              estimatedAmt: 0,
              totalEstimatedTax: 101000,
              freeCashFlow: 300000,
              totalValue: { low: 299500, medium: 300600, high: 301500 },
            },
            sources: [],
            form6251: [],
          },
        },
      ],
      deltasVsCurrent: [],
      warnings: [],
    }

    const rows = mapAfterTaxLiquidityChartData(projection)

    expect(rows.find((row) => row.year === 2026)?.['salary-heavy-medium']).toBe(150000)
    expect(rows.find((row) => row.year === 2026)?.['salary-heavy-low']).toBe(149500)
    expect(rows.find((row) => row.year === 2026)?.['salary-heavy-high']).toBe(151000)
    expect(rows.find((row) => row.year === 2027)?.['salary-heavy-medium']).toBe(300600)
    expect(rows.find((row) => row.year === 2027)?.['salary-heavy-low']).toBe(299500)
    expect(rows.find((row) => row.year === 2027)?.['salary-heavy-high']).toBe(301500)
  })

  it('maps paper equity scenarios by job and scenario', () => {
    const projection: CareerCompProjection = {
      startYear: 2026,
      horizonYears: 1,
      currentJobId: null,
      jobs: [{
        id: 'private-job',
        name: 'Private job',
        isCurrent: false,
        annual: [],
        liquidity: { low: [], medium: [], high: [] },
        paperEquity: {
          scenarios: [{
            id: 'base',
            label: 'Base',
            outcome: 'medium',
            totalNetPaperValue: 95000,
            points: [{
              year: 2026,
              stage: 'A',
              preferredPostMoneyValuation: 100000000,
              capitalDilutionPct: 0,
              employeePoolDilutionPct: 0,
              dilutedOwnershipPct: 0.1,
              commonFmv: 20,
              grossOwnershipValue: 100000,
              grossCommonValue: 20000,
              commonIntrinsicValue: 15000,
              exerciseCost: 5000,
              netPaperValue: 95000,
              liquidityEvent: false,
            }],
          }],
          totalsByOutcome: { low: 0, medium: 95000, high: 0 },
        },
        vesting: [],
        lifetime: {
          totalCashComp: 0,
          totalEquityValue: { low: 0, medium: 0, high: 0 },
          totalPaperEquityValue: { low: 0, medium: 95000, high: 0 },
          totalValue: { low: 0, medium: 0, high: 0 },
          totalPaperValue: { low: 0, medium: 95000, high: 0 },
        },
      }],
      deltasVsCurrent: [],
      warnings: [],
    }

    expect(mapPaperEquitySeries(projection)[0]).toMatchObject({ key: 'private-job-paper-base', outcome: 'medium' })
    expect(mapPaperEquityChartData(projection)[0]?.['private-job-paper-base']).toBe(95000)
  })

  it('adds the current job medium liquid equity as a comparison series when it has no paper scenarios', () => {
    expect(mapPaperEquitySeries(sampleCareerCompProjection)[0]).toMatchObject({
      key: 'current-current-equity-medium',
      label: 'Current job liquid equity med',
      source: 'currentJobLiquidity',
    })
    expect(mapPaperEquityChartData(sampleCareerCompProjection)[0]?.['current-current-equity-medium']).toBe(33000)
  })
})
