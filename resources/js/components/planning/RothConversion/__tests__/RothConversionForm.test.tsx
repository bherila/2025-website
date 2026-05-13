import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from '../defaults'
import { RothConversionFormSection } from '../RothConversionForm'

describe('RothConversionFormSection', () => {
  it('hides spouse-only people fields for single filers', () => {
    render(
      <RothConversionFormSection
        section="people"
        inputs={{ ...DEFAULT_ROTH_CONVERSION_INPUTS, filingStatus: 'single' }}
        onChange={jest.fn()}
      />,
    )

    expect(screen.getByText('Primary current age')).toBeInTheDocument()
    expect(screen.queryByText('Spouse birth year')).not.toBeInTheDocument()
    expect(screen.queryByText('Spouse current age')).not.toBeInTheDocument()
    expect(screen.queryByText('First death age')).not.toBeInTheDocument()
  })

  it('hides spouse-only income and balance fields for single filers', () => {
    const inputs = { ...DEFAULT_ROTH_CONVERSION_INPUTS, filingStatus: 'single' as const }

    const { rerender } = render(
      <RothConversionFormSection section="income" inputs={inputs} onChange={jest.fn()} />,
    )
    expect(screen.queryByText('Spouse wages')).not.toBeInTheDocument()
    expect(screen.queryByText('Spouse PIA / mo')).not.toBeInTheDocument()

    rerender(<RothConversionFormSection section="balances" inputs={inputs} onChange={jest.fn()} />)
    expect(screen.queryByText('Traditional spouse')).not.toBeInTheDocument()
    expect(screen.queryByText('Roth spouse')).not.toBeInTheDocument()
  })
})
