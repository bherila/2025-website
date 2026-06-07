import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import type { CareerCompProjection } from '../types'
import { AnnualFreeCashFlowChart } from './AnnualFreeCashFlowChart'
import { LiquidityOverTimeChart } from './LiquidityOverTimeChart'

jest.mock('recharts', () => ({
  Bar: ({ name }: { name: string }): ReactElement => <div data-testid="bar" data-name={name} />,
  BarChart: ({ children, data }: { children: ReactNode; data: Array<Record<string, number | string>> }): ReactElement => (
    <div data-testid="bar-chart" data-first-row={JSON.stringify(data[0])}>{children}</div>
  ),
  CartesianGrid: () => null,
  Line: ({ name }: { name: string }): ReactElement => <div data-testid="chart-line" data-name={name} />,
  LineChart: ({ children, data }: { children: ReactNode; data: Array<Record<string, number | string>> }): ReactElement => (
    <div data-testid="line-chart" data-first-row={JSON.stringify(data[0])}>{children}</div>
  ),
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }): ReactElement => <div data-testid="responsive-container">{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: ({ scale, tickFormatter }: { scale?: string; tickFormatter?: (value: number) => string }): ReactElement => (
    <div data-testid="y-axis" data-million={tickFormatter?.(1000000) ?? ''} data-scale={scale ?? 'linear'} />
  ),
}))

function projectionWithAfterTax(projection: CareerCompProjection): CareerCompProjection {
  const firstYearFreeCashFlowByJob: Record<string, number> = {
    current: 100000,
    'hyp-1': 150000,
  }

  return {
    ...projection,
    jobs: projection.jobs.map((job) => ({
      ...job,
      afterTax: {
        annual: job.annual.map((annual) => ({
          year: annual.year,
          taxableCompIncome: 0,
          nsoOrdinaryIncome: 0,
          isoAmtPreference: 0,
          equitySaleProceeds: 0,
          estimatedRegularTax: 0,
          estimatedAmt: 0,
          totalEstimatedTax: 0,
          freeCashFlow: firstYearFreeCashFlowByJob[job.id] ?? 0,
          sourceIds: [],
        })),
        lifetime: {
          taxableCompIncome: 0,
          nsoOrdinaryIncome: 0,
          isoAmtPreference: 0,
          equitySaleProceeds: 0,
          estimatedRegularTax: 0,
          estimatedAmt: 0,
          totalEstimatedTax: 0,
          freeCashFlow: 0,
          totalValue: job.lifetime.totalValue,
        },
        sources: [],
        form6251: [],
      },
    })),
  }
}

describe('Career Compensation chart tables', () => {
  it('renders annual free cash flow table amounts with friendly currency', () => {
    render(<AnnualFreeCashFlowChart projection={sampleCareerCompProjection} />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-million', '$1M')
    expect(screen.getAllByRole('cell', { name: '$180k' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('cell', { name: '$180,000' })).not.toBeInTheDocument()
  })

  it('renders liquidity table amounts with friendly currency', () => {
    render(<LiquidityOverTimeChart projection={sampleCareerCompProjection} />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-million', '$1M')
    expect(screen.getAllByRole('cell', { name: '$33k' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('cell', { name: '$33,000' })).not.toBeInTheDocument()
  })

  it('filters liquidity chart and table by selected jobs', () => {
    render(<LiquidityOverTimeChart projection={sampleCareerCompProjection} />)

    expect(screen.getByRole('columnheader', { name: 'Current job Med' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Offer 1 Med' })).toBeInTheDocument()
    expect(screen.getAllByTestId('chart-line').map((line) => line.getAttribute('data-name'))).toContain('Offer 1 Med')

    fireEvent.click(screen.getByLabelText('Show Offer 1'))

    expect(screen.getByRole('columnheader', { name: 'Current job Med' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Offer 1 Med' })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('chart-line').map((line) => line.getAttribute('data-name'))).not.toContain('Offer 1 Med')
  })

  it('filters liquidity chart and table by selected band', () => {
    render(<LiquidityOverTimeChart projection={sampleCareerCompProjection} />)

    expect(screen.getByRole('columnheader', { name: 'Current job Med' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '$33k' }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Low' }))

    expect(screen.getByRole('columnheader', { name: 'Current job Low' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Current job Med' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '$30k' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"current-low":30000'))
    expect(screen.getByTestId('line-chart')).not.toHaveAttribute('data-first-row', expect.stringContaining('current-medium'))
  })

  it('switches liquidity between before-tax and after-tax values', () => {
    render(<LiquidityOverTimeChart projection={projectionWithAfterTax(sampleCareerCompProjection)} />)

    expect(screen.getByRole('button', { name: 'Before tax' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('cell', { name: '$33k' }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'After tax' }))

    expect(screen.getByRole('button', { name: 'After tax' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('cell', { name: '$133k' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"current-medium":133000'))
  })

  it('supports log scale for the liquidity chart while keeping table values untransformed', () => {
    render(<LiquidityOverTimeChart projection={sampleCareerCompProjection} />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'linear')

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'log')
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"current-medium__actual":33000'))
    expect(screen.getAllByRole('cell', { name: '$33k' }).length).toBeGreaterThan(0)
  })

  it('keeps before-tax liquidity usable when after-tax data is unavailable', () => {
    render(<LiquidityOverTimeChart projection={sampleCareerCompProjection} initialMode="afterTax" />)

    expect(screen.getByRole('button', { name: 'After tax' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Before tax' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/After-tax liquidity unavailable/i)).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '$33k' }).length).toBeGreaterThan(0)
  })
})
