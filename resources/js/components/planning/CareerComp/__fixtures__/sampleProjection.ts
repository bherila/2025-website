import type { CareerCompProjection } from '../types'

/**
 * Hand-authored sample projection for unit-testing the chart/table mappers and page render.
 * This is NOT the cross-language golden contract — that is the committed PHP fixture at
 * tests/Fixtures/career-comparison/golden-projection.json, asserted in goldenFixture.test.ts.
 */
export const sampleCareerCompProjection: CareerCompProjection = {
  startYear: 2026,
  horizonYears: 3,
  currentJobId: 'current',
  currentJobIds: ['current'],
  jobs: [
    {
      id: 'current',
      name: 'Current job',
      isCurrent: true,
      annual: [
        { year: 2026, salary: 180000, bonus: 20000, vestedLiquidEquity: 30000, shareSaleProceeds: 0, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 0, freeCashFlow: 230000 },
        { year: 2027, salary: 185000, bonus: 20000, vestedLiquidEquity: 30000, shareSaleProceeds: 0, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 0, freeCashFlow: 235000 },
        { year: 2028, salary: 190000, bonus: 20000, vestedLiquidEquity: 30000, shareSaleProceeds: 0, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 0, freeCashFlow: 240000 },
      ],
      liquidity: {
        low: [{ year: 2026, cumulativeValue: 30000 }, { year: 2027, cumulativeValue: 60000 }, { year: 2028, cumulativeValue: 90000 }],
        medium: [{ year: 2026, cumulativeValue: 33000 }, { year: 2027, cumulativeValue: 69000 }, { year: 2028, cumulativeValue: 108000 }],
        high: [{ year: 2026, cumulativeValue: 36000 }, { year: 2027, cumulativeValue: 78000 }, { year: 2028, cumulativeValue: 126000 }],
      },
      paperEquity: { scenarios: [], totalsByOutcome: { low: 0, medium: 0, high: 0 } },
      vesting: [
        { grantId: 'rsu-current', type: 'rsu', year: 2026, vestedShares: 1000, exercisableShares: 0 },
        { grantId: 'rsu-current', type: 'rsu', year: 2027, vestedShares: 1000, exercisableShares: 0 },
      ],
      lifetime: {
        totalCashComp: 615000,
        totalEquityValue: { low: 90000, medium: 108000, high: 126000 },
        totalPaperEquityValue: { low: 0, medium: 0, high: 0 },
        totalValue: { low: 705000, medium: 723000, high: 741000 },
        totalPaperValue: { low: 615000, medium: 615000, high: 615000 },
      },
    },
    {
      id: 'hyp-1',
      name: 'Offer 1',
      isCurrent: false,
      annual: [
        { year: 2026, salary: 200000, bonus: 30000, vestedLiquidEquity: 50000, shareSaleProceeds: 0, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 10000, freeCashFlow: 270000 },
        { year: 2027, salary: 205000, bonus: 30000, vestedLiquidEquity: 50000, shareSaleProceeds: 0, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 10000, freeCashFlow: 275000 },
        { year: 2028, salary: 210000, bonus: 30000, vestedLiquidEquity: 50000, shareSaleProceeds: 25000, equitySaleBasis: 0, equityCapitalGain: 0, exerciseOutlay: 10000, freeCashFlow: 305000 },
      ],
      liquidity: {
        low: [{ year: 2026, cumulativeValue: 50000 }, { year: 2027, cumulativeValue: 100000 }, { year: 2028, cumulativeValue: 150000 }],
        medium: [{ year: 2026, cumulativeValue: 55000 }, { year: 2027, cumulativeValue: 116000 }, { year: 2028, cumulativeValue: 183000 }],
        high: [{ year: 2026, cumulativeValue: 60000 }, { year: 2027, cumulativeValue: 135000 }, { year: 2028, cumulativeValue: 225000 }],
      },
      paperEquity: {
        scenarios: [
          {
            id: 'base',
            label: 'Base',
            outcome: 'medium',
            totalNetPaperValue: 300000,
            points: [
              { year: 2026, stage: 'A', preferredPostMoneyValuation: 100000000, capitalDilutionPct: 0, employeePoolDilutionPct: 0, dilutedOwnershipPct: 0.05, commonFmv: 25, grossOwnershipValue: 50000, grossCommonValue: 30000, commonIntrinsicValue: 25000, exerciseCost: 5000, netPaperValue: 45000, liquidityEvent: false },
              { year: 2027, stage: 'B', preferredPostMoneyValuation: 250000000, capitalDilutionPct: 10, employeePoolDilutionPct: 5, dilutedOwnershipPct: 0.1, commonFmv: 40, grossOwnershipValue: 250000, grossCommonValue: 80000, commonIntrinsicValue: 70000, exerciseCost: 10000, netPaperValue: 240000, liquidityEvent: false },
              { year: 2028, stage: 'Exit', preferredPostMoneyValuation: 350000000, capitalDilutionPct: 0, employeePoolDilutionPct: 0, dilutedOwnershipPct: 0.09, commonFmv: 55, grossOwnershipValue: 315000, grossCommonValue: 110000, commonIntrinsicValue: 100000, exerciseCost: 15000, netPaperValue: 300000, liquidityEvent: true },
            ],
          },
        ],
        totalsByOutcome: { low: 0, medium: 300000, high: 0 },
      },
      vesting: [
        { grantId: 'rsu-offer', type: 'rsu', year: 2026, vestedShares: 1200, exercisableShares: 0 },
        { grantId: 'iso-offer', type: 'iso', year: 2027, vestedShares: 800, exercisableShares: 800 },
      ],
      lifetime: {
        totalCashComp: 705000,
        totalEquityValue: { low: 150000, medium: 183000, high: 225000 },
        totalPaperEquityValue: { low: 0, medium: 300000, high: 0 },
        totalValue: { low: 855000, medium: 888000, high: 930000 },
        totalPaperValue: { low: 705000, medium: 1005000, high: 705000 },
      },
    },
  ],
  deltasVsCurrent: [
    { jobId: 'hyp-1', name: 'Offer 1', cashCompDelta: 90000, totalValueDelta: { low: 150000, medium: 165000, high: 189000 }, totalPaperValueDelta: { low: 90000, medium: 390000, high: 90000 } },
  ],
  warnings: [],
}
