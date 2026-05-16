import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from '../defaults'
import { ProjectionTaxDetail } from '../RothConversionResultViews'
import type { RothConversionProjection, RothConversionScenarioProjection } from '../types'

jest.mock('../charts/IrmaaTierChart', () => ({
  __esModule: true,
  default: function MockIrmaaTierChart(): ReactElement {
    return <div data-testid="irmaa-tier-chart" />
  },
}))

function scenarioWithLegacyYear(): RothConversionScenarioProjection {
  return {
    id: 'base',
    name: 'Base',
    strategy: {},
    summary: {
      lifetimeFederalTax: 0,
      lifetimeStateTax: 0,
      lifetimeNiit: 0,
      lifetimeIrmaa: 0,
      lifetimeSocialSecurity: 0,
      lifetimeExpenses: 0,
      presentValueLifetimeTax: 0,
      presentValueSocialSecurity: 0,
      presentValueLifetimeExpenses: 0,
      finalEstateValue: 0,
      presentValueFinalEstate: 0,
      irmaaHitYears: 0,
      cashShortfallTaxRecomputedYears: 0,
      unfundedCashShortfall: 0,
    },
    years: [
      {
        calendarYear: 2026,
        primaryAge: 65,
        filingStatusLabel: 'Married filing jointly',
        magi: 100000,
        federalTax: 12000,
        stateTax: 2000,
        niit: 300,
        irmaa: 600,
        totalTax: 14000,
        standardOrItemizedDeduction: 32000,
        rmd: 20000,
        rothConversion: 40000,
      } as RothConversionScenarioProjection['years'][number],
    ],
    socialSecurityBreakeven: [],
  }
}

function scenarioWithCashShortfall(): RothConversionScenarioProjection {
  const scenario = scenarioWithLegacyYear()

  return {
    ...scenario,
    years: [
      {
        ...scenario.years[0],
        cashShortfallWithdrawals: {
          shortfall: 33170,
          taxable: 35859.46,
          taxableBasisRecovered: 17929.74,
          taxableRealizedGain: 17929.74,
          roth: 0,
          traditional: 0,
          traditionalOrdinaryIncome: 0,
          total: 35859.46,
          estimatedAdditionalFederalTax: 2689.46,
          estimatedAdditionalStateTax: 0,
          estimatedAdditionalNiit: 0,
          estimatedAdditionalTax: 2689.46,
          unfunded: 0,
        },
      } as RothConversionScenarioProjection['years'][number],
    ],
  }
}

function projectionWithScenario(scenario: RothConversionScenarioProjection): RothConversionProjection {
  return {
    inputs: DEFAULT_ROTH_CONVERSION_INPUTS,
    scenarios: [scenario],
    warnings: [],
    reference: {
      rmdRates: [],
      socialSecurityTaxation: [],
      irmaaTiers: [],
      conversionWindows: [],
    },
  }
}

describe('ProjectionTaxDetail', () => {
  it('renders legacy projection years without expense details', () => {
    const scenario = scenarioWithLegacyYear()

    render(<ProjectionTaxDetail projection={projectionWithScenario(scenario)} scenario={scenario} />)

    expect(screen.getByTestId('irmaa-tier-chart')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$0' })).toBeInTheDocument()
  })

  it('renders cash shortfall withdrawal tax details', () => {
    const scenario = scenarioWithCashShortfall()

    render(<ProjectionTaxDetail projection={projectionWithScenario(scenario)} scenario={scenario} />)

    expect(screen.getByText('Cash shortfall withdrawals')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$33,170' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Taxable $35,859' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$17,930' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '$2,689' })).toBeInTheDocument()
  })
})
