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
  it('includes a current job comparison line and supports log scale', () => {
    render(<PaperLifetimeValueChart projection={sampleCareerCompProjection} />)

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'linear')
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"current-current-equity-medium":33000'))
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-first-row', expect.stringContaining('"hyp-1-paper-base":45000'))
    expect(screen.getAllByTestId('chart-line')[0]).toHaveAttribute('data-name', 'Current job liquid equity med')

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    expect(screen.getByTestId('y-axis')).toHaveAttribute('data-scale', 'log')
  })
})
