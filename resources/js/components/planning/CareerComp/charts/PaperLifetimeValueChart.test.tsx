import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import { PaperLifetimeValueChart } from './PaperLifetimeValueChart'

jest.mock('recharts', () => ({
  CartesianGrid: () => null,
  Line: ({ name }: { name: string }): ReactElement => <div data-testid="chart-line" data-name={name} />,
  LineChart: ({ children, data }: { children: React.ReactNode; data: Array<Record<string, number>> }): ReactElement => (
    <div data-testid="line-chart" data-first-row={JSON.stringify(data[0])}>{children}</div>
  ),
  ResponsiveContainer: ({ children }: React.PropsWithChildren): ReactElement => <div data-testid="responsive-container">{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: ({ scale }: { scale?: string }): ReactElement => <div data-testid="y-axis" data-scale={scale ?? 'linear'} />,
}))

describe('PaperLifetimeValueChart', () => {
  it('includes cash-adjusted total value lines and supports log scale', () => {
    render(<PaperLifetimeValueChart projection={sampleCareerCompProjection} />)

    expect(screen.getByText('Total equity value')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'linear')
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"current-liquid-medium":233000'))
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"hyp-1-paper-base":275000'))
    expect(screen.getAllByTestId('chart-line')[0]).toHaveAttribute('data-name', 'Current job liquid equity med')

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'log')
  })

  it('filters chart output by selected jobs', () => {
    render(<PaperLifetimeValueChart projection={sampleCareerCompProjection} selectedJobIds={['hyp-1']} />)

    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"hyp-1-paper-base":275000'))
    expect(screen.getByTestId('line-chart')).not.toHaveAttribute('data-first-row', expect.stringContaining('current-liquid-medium'))
  })

  it('keeps the empty state when no jobs are selected', () => {
    render(<PaperLifetimeValueChart projection={sampleCareerCompProjection} selectedJobIds={[]} />)

    expect(screen.getByText('Select at least one job to see total equity value.')).toBeInTheDocument()
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
  })
})
