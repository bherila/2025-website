import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'

import { CareerCompFormSection, GrantEditorColumn, type GrantType } from '../CareerCompForm'
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

interface GrantEditorTarget {
  jobId: string
  grantType: GrantType
  grantId?: string | undefined
}

// The form is controlled and grant editing happens in a child column; this harness mirrors the page
// by holding both the inputs and the active grant-editor target so edits/saves re-render.
function Harness({ initial }: { initial: CareerCompInputs }): ReactElement {
  const [inputs, setInputs] = useState(initial)
  const [editor, setEditor] = useState<GrantEditorTarget | null>(null)
  return (
    <>
      <CareerCompFormSection
        section="offers"
        inputs={inputs}
        onChange={setInputs}
        onOpenGrantEditor={(jobId, grantType, grantId) => setEditor({ jobId, grantType, grantId })}
      />
      {editor ? (
        <GrantEditorColumn inputs={inputs} jobId={editor.jobId} grantType={editor.grantType} grantId={editor.grantId} onChange={setInputs} onClose={() => setEditor(null)} />
      ) : null}
    </>
  )
}

describe('CareerCompForm public/private gating + grant column entry', () => {
  it('shows current share price and hides private-only fields for a public company', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('Current share price')).toBeInTheDocument()
    expect(screen.queryByText('409A price')).not.toBeInTheDocument()
    expect(screen.queryByText('Annual dilution')).not.toBeInTheDocument()
    expect(screen.queryByText('Liquidity date')).not.toBeInTheDocument()
    expect(screen.queryByText('Fully diluted shares')).not.toBeInTheDocument()
  })

  it('shows 409A/dilution/liquidity and hides current share price for a private company', () => {
    render(<Harness initial={makeInputs('private')} />)

    expect(screen.getByText('409A price')).toBeInTheDocument()
    expect(screen.getByText('Annual dilution')).toBeInTheDocument()
    expect(screen.getByText('Liquidity date')).toBeInTheDocument()
    expect(screen.queryByText('Current share price')).not.toBeInTheDocument()
  })

  it('adds a new RSU grant via its own column, which closes after saving', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add RSU grant' }))
    // The editor column exposes grant fields (e.g. vesting frequency) plus a Save action.
    expect(screen.getByText('Vesting frequency')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save grant' }))

    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save grant' })).not.toBeInTheDocument()
  })

  it('duplicates and removes RSU grant rows inline', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate RSU grant 1' }))
    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove RSU grant 2' }))
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
  })

  it('opens an existing option grant in its editor column', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Option grant 1' }))
    expect(screen.getByText('83(b) early exercise')).toBeInTheDocument()
  })
})
