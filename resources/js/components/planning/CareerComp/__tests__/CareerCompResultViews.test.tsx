import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import { ProjectionAfterTaxFreeCashFlow, ProjectionAfterTaxLiquidity, ProjectionLifetimeValue } from '../CareerCompResultViews'
import { careerCompProjectionSchema } from '../types'

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

jest.mock('../charts/PaperLifetimeValueChart', () => ({
  PaperLifetimeValueChart: function MockPaperLifetimeValueChart({ selectedBand, selectedJobIds }: { selectedBand?: string; selectedJobIds?: string[] }): ReactElement {
    return <div data-testid="total-equity-chart" data-band={selectedBand ?? 'medium'} data-jobs={(selectedJobIds ?? []).join(',')} />
  },
}))

const GOLDEN_FIXTURE_PATH = resolve(__dirname, '../../../../../../tests/Fixtures/career-comparison/golden-projection.json')
const raw: unknown = JSON.parse(readFileSync(GOLDEN_FIXTURE_PATH, 'utf8'))

describe('Career Comparison after-tax result views', () => {
  it('includes newly projected jobs by default before the job filter is touched', () => {
    const { rerender } = render(<ProjectionLifetimeValue projection={sampleCareerCompProjection} />)
    const addedJobProjection = {
      ...sampleCareerCompProjection,
      jobs: [
        ...sampleCareerCompProjection.jobs,
        {
          ...sampleCareerCompProjection.jobs[1]!,
          id: 'hyp-2',
          name: 'Offer 2',
        },
      ],
    }

    rerender(<ProjectionLifetimeValue projection={addedJobProjection} />)

    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-jobs', 'current,hyp-1,hyp-2')
    expect(screen.getByRole('cell', { name: 'Offer 2' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Show Current job'))

    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-jobs', 'hyp-1,hyp-2')
    expect(screen.getByRole('cell', { name: 'Offer 2' })).toBeInTheDocument()
  })

  it('filters lifetime value output by outcome and selected jobs', () => {
    render(<ProjectionLifetimeValue projection={sampleCareerCompProjection} />)

    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-band', 'medium')
    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-jobs', 'current,hyp-1')
    expect(screen.getByRole('cell', { name: 'Offer 1' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Liquid total med' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Low' }))
    fireEvent.click(screen.getByLabelText('Show Offer 1'))

    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-band', 'low')
    expect(screen.getByTestId('total-equity-chart')).toHaveAttribute('data-jobs', 'current')
    expect(screen.queryByRole('cell', { name: 'Offer 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Liquid total low' })).toBeInTheDocument()
  })

  it('renders the after-tax liquidity chart from the golden fixture', () => {
    const projection = careerCompProjectionSchema.parse(raw)

    render(<ProjectionAfterTaxLiquidity projection={projection} />)

    expect(screen.getByTestId('liquidity-chart-afterTax')).toBeInTheDocument()
  })

  it('renders after-tax FCF, LTV, and source breakdown tables from the golden fixture', () => {
    const projection = careerCompProjectionSchema.parse(raw)

    render(<ProjectionAfterTaxFreeCashFlow projection={projection} />)

    expect(screen.getByTestId('annual-fcf-chart-afterTax')).toBeInTheDocument()
    expect(screen.getByText('After-tax lifetime value comparison')).toBeInTheDocument()
    expect(screen.getByText('Annual federal and AMT breakdown')).toBeInTheDocument()
    expect(screen.getByText('Equity tax source breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('Private offer').length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: '$47,077' })).toBeInTheDocument()
    expect(screen.getAllByText('ISO AMT preference').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('cell', { name: 'form_6251_iso_bargain_element' }).length).toBeGreaterThan(0)
  })
})
