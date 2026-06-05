import { mapAfterTaxLiquidityChartData } from '../mappers'
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
          vesting: [],
          lifetime: {
            totalCashComp: 400000,
            totalEquityValue: { low: 500, medium: 1600, high: 2500 },
            totalValue: { low: 400500, medium: 401600, high: 402500 },
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
})
