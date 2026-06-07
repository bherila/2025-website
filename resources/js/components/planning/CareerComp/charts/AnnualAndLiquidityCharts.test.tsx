import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
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
  YAxis: ({ tickFormatter }: { tickFormatter?: (value: number) => string }): ReactElement => (
    <div data-testid="y-axis" data-million={tickFormatter?.(1000000) ?? ''} />
  ),
}))

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
})
