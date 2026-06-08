import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'

import { CareerCompFormSection, GrantEditorColumn, type GrantType, ValuationTimelineColumn } from '../CareerCompForm'
import { buildDefaultJob, DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerCompInputs } from '../types'

function makeInputs(type: 'public' | 'private'): CareerCompInputs {
  const job = buildDefaultJob('hyp-1', 'Offer 1')
  return {
    ...DEFAULT_CAREER_COMP_INPUTS,
    horizonYears: 10,
    startYear: 2026,
    currentJobs: [],
    hypotheticalJobs: [{ ...job, company: { ...job.company, type } }],
  }
}

interface GrantEditorTarget {
  jobId: string
  grantType: GrantType
  grantId?: string | undefined
}

// The form is controlled and grant editing happens in a child column; this harness mirrors the page
// by holding both the inputs and the active grant-editor target so edit-as-you-type changes re-render.
function Harness({ initial }: { initial: CareerCompInputs }): ReactElement {
  const [inputs, setInputs] = useState(initial)
  const [editor, setEditor] = useState<GrantEditorTarget | null>(null)
  const [timelineJobId, setTimelineJobId] = useState<string | null>(null)
  return (
    <>
      <CareerCompFormSection
        section="offers"
        inputs={inputs}
        onChange={setInputs}
        onOpenGrantEditor={(jobId, grantType, grantId) => setEditor({ jobId, grantType, grantId })}
        onOpenValuationTimeline={setTimelineJobId}
        onOpenModelAssumptions={jest.fn()}
        activeGrant={editor}
      />
      {editor ? (
        <GrantEditorColumn inputs={inputs} jobId={editor.jobId} grantType={editor.grantType} grantId={editor.grantId} onChange={setInputs} onGrantCreated={(grantId) => setEditor((current) => (current ? { ...current, grantId } : current))} />
      ) : null}
      {timelineJobId ? (
        <ValuationTimelineColumn inputs={inputs} jobId={timelineJobId} onChange={setInputs} />
      ) : null}
    </>
  )
}

describe('CareerCompForm public/private gating + grant column entry', () => {
  it('edits model assumptions in their own section', () => {
    function AssumptionsHarness(): ReactElement {
      const [inputs, setInputs] = useState(() => makeInputs('private'))

      return (
        <CareerCompFormSection
          section="model-assumptions"
          inputs={inputs}
          onChange={setInputs}
          onOpenGrantEditor={jest.fn()}
          onOpenValuationTimeline={jest.fn()}
          onOpenModelAssumptions={jest.fn()}
        />
      )
    }

    render(<AssumptionsHarness />)

    fireEvent.change(screen.getByLabelText('Stage B'), { target: { value: '33' } })

    expect(screen.getByLabelText('Stage B')).toHaveValue(33)
    expect(screen.getByRole('combobox', { name: 'Filing status' })).toHaveTextContent('Single')
    expect(screen.getByText('Current job notice period')).toBeInTheDocument()
  })

  it('shows current share price and hides private-only fields for a public company', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByText('Career transition')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go to assumptions/ })).toBeInTheDocument()
    expect(screen.getByText('Current share price')).toBeInTheDocument()
    expect(screen.queryByText('409A price')).not.toBeInTheDocument()
    expect(screen.queryByText('Annual dilution')).not.toBeInTheDocument()
    expect(screen.queryByText('Liquidity date')).not.toBeInTheDocument()
    expect(screen.getByText('Fully diluted shares')).toBeInTheDocument()
  })

  it('lets an offer retain selected current jobs', () => {
    const currentJob = buildDefaultJob('current-1', 'Side role')
    render(<Harness initial={{ ...makeInputs('public'), currentJobs: [currentJob] }} />)

    expect(screen.getByText('Retained current jobs')).toBeInTheDocument()
    expect(screen.getByText('None retained; this offer quits every current job.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Side role' }))

    expect(screen.getByText('1 retained alongside this offer.')).toBeInTheDocument()
  })

  it('edits the job-level start date without touching grant dates', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-07-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit RSU grant 1' }))

    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('Grant date')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('Vesting start')).toHaveValue('')
  })

  it('reveals per-offer transition override controls', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.queryByLabelText('Prior job resignation date')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Override/ }))

    expect(screen.getByLabelText('Notice period')).toHaveValue(2)
    expect(screen.getByLabelText('Time off')).toHaveValue(0)
    fireEvent.change(screen.getByLabelText('Prior job resignation date'), { target: { value: '2027-05-25' } })

    expect(screen.getByLabelText('Prior job resignation date')).toHaveValue('2027-05-25')
  })

  it('shows 409A/dilution/liquidity and hides current share price for a private company', () => {
    render(<Harness initial={makeInputs('private')} />)

    expect(screen.getByText('409A price')).toBeInTheDocument()
    expect(screen.getByText('Annual dilution')).toBeInTheDocument()
    expect(screen.getByText('Liquidity date')).toBeInTheDocument()
    expect(screen.getByText('Company valuation timeline')).toBeInTheDocument()
    expect(screen.queryByText('Current share price')).not.toBeInTheDocument()
  })

  it('opens and edits the private valuation timeline column', () => {
    render(<Harness initial={makeInputs('private')} />)

    fireEvent.click(screen.getByRole('button', { name: /Company valuation timeline/ }))
    expect(screen.getAllByText('Company valuation timeline')).toHaveLength(2)
    expect(screen.getByText('Benchmark $0.15 @ 15%')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Headline valuation'), { target: { value: '250000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }))

    expect(screen.getByDisplayValue('250000000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Stage' })).toBeInTheDocument()
  })

  it('hides RSU controls when RSU grants are disabled and restores draft rows when re-enabled', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('RSU refresher')).toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Grants RSU' }))
    expect(screen.queryByText('RSU refresher')).not.toBeInTheDocument()
    expect(screen.queryByText('RSU grant 1')).not.toBeInTheDocument()
    expect(screen.getByText('Option grant 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Grants RSU' }))
    expect(screen.getByText('RSU refresher')).toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
  })

  it('hides option controls when options are disabled and restores draft rows when re-enabled', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('Projected ISO refresher')).toBeInTheDocument()
    expect(screen.getByText('Option grant 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Grants options' }))
    expect(screen.queryByText('Projected ISO refresher')).not.toBeInTheDocument()
    expect(screen.queryByText('Option grant 1')).not.toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Grants options' }))
    expect(screen.getByText('Projected ISO refresher')).toBeInTheDocument()
    expect(screen.getByText('Option grant 1')).toBeInTheDocument()
  })

  it('adds a new RSU grant via its own column as fields change', () => {
    render(<Harness initial={makeInputs('public')} />)

    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add RSU grant' }))
    expect(screen.getByText('Vesting frequency')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Share count'), { target: { value: '2500' } })

    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save grant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('duplicates and removes RSU grant rows inline', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate RSU grant 1' }))
    expect(screen.getByText('RSU grant 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove RSU grant 2' }))
    expect(screen.queryByText('RSU grant 2')).not.toBeInTheDocument()
    expect(screen.getByText('RSU grant 1')).toBeInTheDocument()
  })

  it('highlights the open grant and navigates RSU grants with arrow keys', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate RSU grant 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit RSU grant 1' }))

    expect(screen.getByRole('button', { name: /^RSU grant 1/ })).toHaveAttribute('aria-current', 'true')

    fireEvent.keyDown(screen.getByLabelText('RSU grants section'), { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: /^RSU grant 2/ })).toHaveAttribute('aria-current', 'true')

    fireEvent.keyDown(screen.getByLabelText('RSU grants section'), { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: /^RSU grant 1/ })).toHaveAttribute('aria-current', 'true')
  })

  it('highlights the open option grant and navigates option grants with arrow keys', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Option grant 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Option grant 1' }))

    expect(screen.getByRole('button', { name: /^Option grant 1/ })).toHaveAttribute('aria-current', 'true')

    fireEvent.keyDown(screen.getByLabelText('Option grants section'), { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: /^Option grant 2/ })).toHaveAttribute('aria-current', 'true')
  })

  it('opens an existing option grant in its editor column', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Option grant 1' }))
    expect(screen.getByText('83(b) early exercise')).toBeInTheDocument()
  })
})
