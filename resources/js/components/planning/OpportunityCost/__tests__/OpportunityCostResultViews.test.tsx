import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { ProjectionAfterTaxFreeCashFlow, ProjectionAfterTaxLiquidity } from '../OpportunityCostResultViews'
import { opportunityCostProjectionSchema } from '../types'

// Local Node-API declarations so this test does not depend on @types/node being in `types`.
declare const __dirname: string
declare const require: (id: string) => unknown

const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const { resolve } = require('node:path') as { resolve: (...parts: string[]) => string }

jest.mock('../charts/AnnualFreeCashFlowChart', () => ({
  AnnualFreeCashFlowChart: function MockAnnualFreeCashFlowChart({ mode }: { mode?: string }): ReactElement {
    return <div data-testid={`annual-fcf-chart-${mode ?? 'preTax'}`} />
  },
}))

jest.mock('../charts/LiquidityOverTimeChart', () => ({
  LiquidityOverTimeChart: function MockLiquidityOverTimeChart({ mode }: { mode?: string }): ReactElement {
    return <div data-testid={`liquidity-chart-${mode ?? 'preTax'}`} />
  },
}))

const GOLDEN_FIXTURE_PATH = resolve(__dirname, '../../../../../../tests/Fixtures/opportunity-cost/golden-projection.json')
const raw: unknown = JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, 'utf8'))

describe('Opportunity Cost after-tax result views', () => {
  it('renders the after-tax liquidity chart from the golden fixture', () => {
    const projection = opportunityCostProjectionSchema.parse(raw)

    render(<ProjectionAfterTaxLiquidity projection={projection} />)

    expect(screen.getByTestId('liquidity-chart-afterTax')).toBeInTheDocument()
  })

  it('renders after-tax FCF, LTV, and source breakdown tables from the golden fixture', () => {
    const projection = opportunityCostProjectionSchema.parse(raw)

    render(<ProjectionAfterTaxFreeCashFlow projection={projection} />)

    expect(screen.getByTestId('annual-fcf-chart-afterTax')).toBeInTheDocument()
    expect(screen.getByText('After-tax lifetime value comparison')).toBeInTheDocument()
    expect(screen.getByText('Annual federal and AMT breakdown')).toBeInTheDocument()
    expect(screen.getByText('Equity tax source breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('Private offer').length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: '$69,761' })).toBeInTheDocument()
    expect(screen.getAllByText('ISO AMT preference').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('cell', { name: 'form_6251_iso_bargain_element' }).length).toBeGreaterThan(0)
  })
})
