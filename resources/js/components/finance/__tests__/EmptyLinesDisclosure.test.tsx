import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { type EmptyLine,EmptyLinesDisclosure } from '@/components/finance/EmptyLinesDisclosure'
import { TAX_TABS } from '@/components/finance/tax-tab-ids'

describe('EmptyLinesDisclosure', () => {
  it('renders nothing when given an empty lines array', () => {
    const { container } = render(<EmptyLinesDisclosure lines={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('collapses by default and shows the line count in the toggle', () => {
    const lines: EmptyLine[] = [
      { lineNumber: '2a', label: 'Alimony received', state: 'null' },
      { lineNumber: '4', label: 'Other gains', state: 'null' },
    ]
    render(<EmptyLinesDisclosure lines={lines} />)
    expect(screen.getByRole('button', { name: /show 2 empty lines/i })).toBeInTheDocument()
    expect(screen.queryByText('Alimony received')).not.toBeInTheDocument()
  })

  it('pluralises correctly for a single line', () => {
    const lines: EmptyLine[] = [{ lineNumber: '4', label: 'Other gains', state: 'null' }]
    render(<EmptyLinesDisclosure lines={lines} />)
    expect(screen.getByRole('button', { name: /show 1 empty line$/i })).toBeInTheDocument()
  })

  it('expands to show rows when the toggle is clicked', () => {
    const lines: EmptyLine[] = [
      { lineNumber: '2a', label: 'Alimony received', state: 'null' },
      { lineNumber: '4', label: 'Other gains', state: 'null' },
    ]
    render(<EmptyLinesDisclosure lines={lines} />)
    fireEvent.click(screen.getByRole('button', { name: /show 2 empty lines/i }))
    expect(screen.getByText('Alimony received')).toBeInTheDocument()
    expect(screen.getByText('Other gains')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide empty lines/i })).toBeInTheDocument()
  })

  it('collapses back when clicked a second time', () => {
    const lines: EmptyLine[] = [{ lineNumber: '4', label: 'Other gains', state: 'null' }]
    render(<EmptyLinesDisclosure lines={lines} />)
    const toggle = screen.getByRole('button', { name: /show 1 empty line/i })
    fireEvent.click(toggle)
    expect(screen.getByText('Other gains')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /hide empty lines/i }))
    expect(screen.queryByText('Other gains')).not.toBeInTheDocument()
  })

  it('prepends the section label on the toggle when provided', () => {
    const lines: EmptyLine[] = [{ lineNumber: '2a', label: 'Alimony', state: 'null' }]
    render(<EmptyLinesDisclosure lines={lines} sectionLabel="Part I" />)
    expect(screen.getByRole('button', { name: /part i — show 1 empty line/i })).toBeInTheDocument()
  })

  it('renders a Go-to-source button when sourceTab is set and onGoToSource is provided', () => {
    const onGoToSource = jest.fn()
    const lines: EmptyLine[] = [
      {
        lineNumber: '4',
        label: 'Other gains',
        state: 'null',
        sourceTab: TAX_TABS.capitalGains,
        sourceLabel: 'Capital Gains',
      },
    ]
    render(<EmptyLinesDisclosure lines={lines} onGoToSource={onGoToSource} />)
    fireEvent.click(screen.getByRole('button', { name: /show 1 empty line/i }))
    const goToSource = screen.getByRole('button', { name: /go to capital gains/i })
    fireEvent.click(goToSource)
    expect(onGoToSource).toHaveBeenCalledWith(TAX_TABS.capitalGains)
  })

  it('omits the Go-to-source button when onGoToSource is not provided', () => {
    const lines: EmptyLine[] = [
      { lineNumber: '4', label: 'Other gains', state: 'null', sourceTab: TAX_TABS.capitalGains },
    ]
    render(<EmptyLinesDisclosure lines={lines} />)
    fireEvent.click(screen.getByRole('button', { name: /show 1 empty line/i }))
    expect(screen.queryByRole('button', { name: /go to source/i })).not.toBeInTheDocument()
  })

  it('renders the manualEntry node instead of Go-to-source when both are provided', () => {
    const onGoToSource = jest.fn()
    const lines: EmptyLine[] = [
      {
        lineNumber: '2a',
        label: 'Alimony received',
        state: 'null',
        sourceTab: TAX_TABS.schedule1,
        manualEntry: <input data-testid="manual-input" />,
      },
    ]
    render(<EmptyLinesDisclosure lines={lines} onGoToSource={onGoToSource} />)
    fireEvent.click(screen.getByRole('button', { name: /show 1 empty line/i }))
    expect(screen.getByTestId('manual-input')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /go to source/i })).not.toBeInTheDocument()
  })

  it('shows "no activity" for zero-state lines', () => {
    const lines: EmptyLine[] = [
      { lineNumber: '6', label: 'Farm income', state: 'zero', tooltip: 'No farm income reported' },
    ]
    render(<EmptyLinesDisclosure lines={lines} />)
    fireEvent.click(screen.getByRole('button', { name: /show 1 empty line/i }))
    expect(screen.getByText(/no activity/i)).toBeInTheDocument()
  })

  it('exposes state as a data-attribute on each row for testability', () => {
    const lines: EmptyLine[] = [
      { lineNumber: '2a', label: 'Alimony', state: 'null' },
      { lineNumber: '6', label: 'Farm', state: 'zero' },
    ]
    render(<EmptyLinesDisclosure lines={lines} />)
    fireEvent.click(screen.getByRole('button', { name: /show 2 empty lines/i }))
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-line', '2a')
    expect(rows[0]).toHaveAttribute('data-state', 'null')
    expect(rows[1]).toHaveAttribute('data-line', '6')
    expect(rows[1]).toHaveAttribute('data-state', 'zero')
  })
})
