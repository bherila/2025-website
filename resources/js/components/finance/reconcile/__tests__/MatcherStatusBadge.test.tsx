import { render, screen } from '@testing-library/react'
import type React from 'react'

import MatcherStatusBadge from '../MatcherStatusBadge'

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const baseRun = {
  id: 1,
  document_id: 120,
  user_id: 1,
  status: 'succeeded',
  mode: 'preserve',
  started_at: '2026-05-10T17:00:00.000Z',
  finished_at: '2026-05-10T17:01:00.000Z',
  result_summary: null,
  error: null,
  created_at: '2026-05-10T17:00:00.000Z',
  updated_at: '2026-05-10T17:01:00.000Z',
} as const

describe('MatcherStatusBadge', () => {
  it('renders active and terminal statuses', () => {
    const { rerender } = render(<MatcherStatusBadge run={{ ...baseRun, status: 'queued' }} />)
    expect(screen.getByText('Queued')).toBeInTheDocument()

    rerender(<MatcherStatusBadge run={{ ...baseRun, status: 'running' }} />)
    expect(screen.getByText('Running')).toBeInTheDocument()

    rerender(<MatcherStatusBadge run={baseRun} />)
    expect(screen.getByText('Matched')).toBeInTheDocument()

    rerender(<MatcherStatusBadge run={{ ...baseRun, status: 'failed', error: 'Matcher failed' }} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/Matcher failed/)).toBeInTheDocument()
  })

  it('renders never-run state', () => {
    render(<MatcherStatusBadge run={null} lastMatchedAt={null} />)

    expect(screen.getByText('Never run')).toBeInTheDocument()
  })
})
