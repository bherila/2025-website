import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import { Clock, Info } from 'lucide-react'

import type { SummaryMetric } from '../MetricGrid'
import { MetricGrid } from '../MetricGrid'

describe('MetricGrid', () => {
  it('renders one tile per metric with correct title', () => {
    const metrics: SummaryMetric[] = [
      { key: 'total-time', title: 'Total Time', value: '8:00', icon: Clock },
      { key: 'billable', title: 'Billable Hours', value: '6:00', tone: 'green', icon: Clock },
      { key: 'pending', title: 'Pending Billing', value: '2:00', tone: 'blue', icon: Info },
    ]

    render(<MetricGrid metrics={metrics} />)

    expect(screen.getByText('Total Time')).toBeInTheDocument()
    expect(screen.getByText('Billable Hours')).toBeInTheDocument()
    expect(screen.getByText('Pending Billing')).toBeInTheDocument()
  })

  it('renders each metric value', () => {
    const metrics: SummaryMetric[] = [
      { key: 'a', title: 'Alpha', value: '1:30' },
      { key: 'b', title: 'Beta', value: '4:15' },
    ]

    render(<MetricGrid metrics={metrics} />)

    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText('4:15')).toBeInTheDocument()
  })

  it('renders helpText below the metric value when provided', () => {
    const metrics: SummaryMetric[] = [
      {
        key: 'pending',
        title: 'Pending Billing',
        value: '3:00',
        tone: 'blue',
        helpText: <p>Some help text here.</p>,
      },
    ]

    render(<MetricGrid metrics={metrics} />)

    expect(screen.getByText('Some help text here.')).toBeInTheDocument()
  })

  it('renders with a custom className when provided', () => {
    const metrics: SummaryMetric[] = [
      { key: 'x', title: 'X Metric', value: '0:00' },
    ]

    const { container } = render(<MetricGrid metrics={metrics} className="custom-grid-class" />)

    expect(container.firstChild).toHaveClass('custom-grid-class')
  })

  it('uses default grid class when no className is provided', () => {
    const metrics: SummaryMetric[] = [
      { key: 'x', title: 'X Metric', value: '0:00' },
    ]

    const { container } = render(<MetricGrid metrics={metrics} />)

    expect(container.firstChild).toHaveClass('grid')
    expect(container.firstChild).toHaveClass('grid-cols-1')
    expect(container.firstChild).toHaveClass('md:grid-cols-3')
    expect(container.firstChild).toHaveClass('gap-4')
  })
})
