import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'

import { CareerCompFormSection } from '../CareerCompForm'
import { buildDefaultJob } from '../defaults'
import type { CareerCompInputs } from '../types'

function makeInputs(type: 'public' | 'private'): CareerCompInputs {
  const job = buildDefaultJob('hyp-1', 'Offer 1')
  return {
    horizonYears: 10,
    startYear: 2026,
    currentJob: null,
    hypotheticalJobs: [{ ...job, company: { ...job.company, type } }],
  }
}

// The form is controlled; this harness holds state so add/duplicate/remove edits re-render.
function Harness({ initial }: { initial: CareerCompInputs }): ReactElement {
  const [inputs, setInputs] = useState(initial)
  return <CareerCompFormSection section="offers" inputs={inputs} onChange={setInputs} />
}

describe('CareerCompForm public/private gating + multi-grant entry', () => {
  it('shows current share price and hides private-only fields for a public company', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('Current share price')).toBeInTheDocument()
    expect(screen.queryByText('409A price')).not.toBeInTheDocument()
    expect(screen.queryByText('Annual dilution')).not.toBeInTheDocument()
    expect(screen.queryByText('Liquidity date')).not.toBeInTheDocument()
    // The dead "Fully diluted shares" input was removed entirely.
    expect(screen.queryByText('Fully diluted shares')).not.toBeInTheDocument()
  })

  it('shows 409A/dilution/liquidity and hides current share price for a private company', () => {
    render(<Harness initial={makeInputs('private')} />)

    expect(screen.getByText('409A price')).toBeInTheDocument()
    expect(screen.getByText('Annual dilution')).toBeInTheDocument()
    expect(screen.getByText('Liquidity date')).toBeInTheDocument()
    expect(screen.queryByText('Current share price')).not.toBeInTheDocument()
  })

  it('adds and duplicates RSU grants without repeating manual entry', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add RSU grant' }))
    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate RSU grant 1' }))
    expect(screen.getByText('RSU grant 3')).toBeInTheDocument()
  })

  it('removes a specific RSU grant', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add RSU grant' }))
    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove RSU grant 2' }))
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
  })

  it('exposes a vesting frequency control on equity grants', () => {
    render(<Harness initial={makeInputs('public')} />)

    // One for the default RSU grant and one for the default option grant.
    expect(screen.getAllByText('Vesting frequency').length).toBeGreaterThanOrEqual(2)
  })
})
