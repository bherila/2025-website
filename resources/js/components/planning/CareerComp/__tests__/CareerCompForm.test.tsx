import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'

import { CareerCompFormSection, duplicateRsuGrant, GrantEditorColumn, type GrantType, OfferNotesColumn, rsuScheduleEditPatch, ValuationTimelineColumn } from '../CareerCompForm'
import { buildDefaultJob, buildDefaultRsuGrant, DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerCompInputs, RsuGrant } from '../types'

jest.mock('@/components/ui/code-editor', () => ({
  CodeEditor({
    value,
    onChange,
    placeholder,
    ariaLabel,
    ariaLabelledBy,
  }: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    ariaLabel?: string
    ariaLabelledBy?: string
  }) {
    return (
      <textarea
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  },
}))

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
  const [notesJobId, setNotesJobId] = useState<string | null>(null)
  return (
    <>
      <CareerCompFormSection
        section="offers"
        inputs={inputs}
        onChange={setInputs}
        onOpenGrantEditor={(jobId, grantType, grantId) => setEditor({ jobId, grantType, grantId })}
        onOpenValuationTimeline={setTimelineJobId}
        onOpenOfferNotes={setNotesJobId}
        onOpenModelAssumptions={jest.fn()}
        activeGrant={editor}
      />
      {editor ? (
        <GrantEditorColumn inputs={inputs} jobId={editor.jobId} grantType={editor.grantType} grantId={editor.grantId} onChange={setInputs} onGrantCreated={(grantId) => setEditor((current) => (current ? { ...current, grantId } : current))} />
      ) : null}
      {timelineJobId ? (
        <ValuationTimelineColumn inputs={inputs} jobId={timelineJobId} onChange={setInputs} />
      ) : null}
      {notesJobId ? (
        <OfferNotesColumn inputs={inputs} jobId={notesJobId} onChange={setInputs} />
      ) : null}
    </>
  )
}

describe('CareerCompForm public/private gating + grant column entry', () => {
  it('clears imported RSU vesting events when visible schedule fields are edited or duplicated', () => {
    const original: RsuGrant = {
      ...buildDefaultRsuGrant('current', 1),
      vestingEvents: [{ vestDate: '2027-01-01', shareCount: 100, sourceAwardId: 'RSU-1' }],
    }

    expect(rsuScheduleEditPatch({ shareCount: 200 })).toEqual({ shareCount: 200, vestingEvents: [] })
    expect(duplicateRsuGrant(original, [original], 'current')).toMatchObject({
      id: 'current-rsu-2',
      shareCount: original.shareCount,
      vestingEvents: [],
    })
  })

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
          onOpenOfferNotes={jest.fn()}
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
    fireEvent.blur(screen.getByLabelText('Headline valuation'))
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }))

    expect(screen.getByDisplayValue('250,000,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Stage' })).toBeInTheDocument()
  })

  it('renders commas in money input boxes while keeping currency.js parsing', () => {
    render(<Harness initial={makeInputs('private')} />)

    expect(screen.getByLabelText('Base salary')).toHaveValue('180,000')
    fireEvent.click(screen.getByRole('button', { name: /Company valuation timeline/ }))
    expect(screen.getByLabelText('Headline valuation')).toHaveValue('100,000,000')

    fireEvent.change(screen.getByLabelText('Headline valuation'), { target: { value: '180,001,651' } })
    fireEvent.blur(screen.getByLabelText('Headline valuation'))

    expect(screen.getByLabelText('Headline valuation')).toHaveValue('180,001,651')
    expect(screen.getByText('Benchmark $0.27 @ 15%')).toBeInTheDocument()
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

  it('lets option shares be entered as a percent of fully diluted shares as of grant date', () => {
    // Private company so as-of-grant-date dilution applies (public companies are not diluted).
    const baseInputs = makeInputs('private')
    const baseOffer = baseInputs.hypotheticalJobs[0]!
    const inputs: CareerCompInputs = {
      ...baseInputs,
      startYear: 2026,
      hypotheticalJobs: [{
        ...baseOffer,
        company: {
          ...baseOffer.company,
          fullyDilutedShares: 1000,
          annualDilutionPct: 10,
        },
      }],
    }

    render(<Harness initial={inputs} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Option grant 1' }))
    fireEvent.change(screen.getByLabelText('Grant date'), { target: { value: '2028-01-01' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Input shares by percentage of fully diluted shares' }))
    fireEvent.change(screen.getByLabelText('% of fully diluted shares as of grant date'), { target: { value: '10' } })

    expect(screen.getByRole('button', { name: /^Option grant 1/ })).toHaveTextContent('81 sh')
  })

  it('opens and edits markdown notes in a dedicated column', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open notes for Offer 1' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Offer notes' }), { target: { value: '# No early exercise\n\nExercise cost is too high.' } })

    expect(screen.getByRole('textbox', { name: 'Offer notes' })).toHaveValue('# No early exercise\n\nExercise cost is too high.')
    expect(screen.getAllByText('Offer 1')).not.toHaveLength(0)
  })

  it('archives and restores offers without deleting their notes', () => {
    render(<Harness initial={makeInputs('public')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open notes for Offer 1' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Offer notes' }), { target: { value: 'Archived note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Archive Offer 1' }))

    expect(screen.getByText('No active offers')).toBeInTheDocument()
    expect(screen.getByText('Archived offers')).toBeInTheDocument()
    expect(screen.getByText('Notes saved')).toBeInTheDocument()
    expect(screen.queryByText('Base salary')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive Offer 1' }))

    expect(screen.getByText('Base salary')).toBeInTheDocument()
    expect(screen.queryByText('No active offers')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Offer notes' })).toHaveValue('Archived note')
  })

  it('lets archived offers be deleted when the total offer limit is reached', () => {
    const archivedOffers = Array.from({ length: 10 }, (_, index) => ({
      ...buildDefaultJob(`hyp-${index + 1}`, `Offer ${index + 1}`),
      archived: true,
    }))

    render(<Harness initial={{ ...makeInputs('public'), hypotheticalJobs: archivedOffers }} />)

    expect(screen.getByRole('button', { name: 'Add offer' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Offer 1' }))

    expect(screen.queryByText('Offer 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add offer' })).toBeEnabled()
  })
})
