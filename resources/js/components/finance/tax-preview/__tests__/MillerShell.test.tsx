import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn().mockResolvedValue({}) },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/ScheduleCPreview', () => ({
  computeScheduleCNetIncome: () => ({ total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }),
}))

import { TaxPreviewProvider } from '../../TaxPreviewContext'
import { DockActionsProvider } from '../DockActions'
import type { FormRegistry, FormRenderProps } from '../formRegistry'
import { MillerShell } from '../MillerShell'

// --- helpers ---------------------------------------------------------------

const SHELL = { year: 2025, availableYears: [2025] }

function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <TaxPreviewProvider initialData={SHELL}>
      <DockActionsProvider>{children}</DockActionsProvider>
    </TaxPreviewProvider>
  )
}

function MockComponent({ instance, onDrill }: FormRenderProps): React.ReactElement {
  return (
    <div data-testid="mock-content">
      <span>{instance ? `instance:${instance.key}` : 'singleton'}</span>
      <button type="button" onClick={() => onDrill({ form: 'sch-1' })}>
        drill-column
      </button>
      <button type="button" onClick={() => onDrill({ form: 'wks-se-401k' })}>
        drill-worksheet
      </button>
    </div>
  )
}

const mockRegistry: FormRegistry = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    keywords: [],
    category: 'App',
    presentation: 'app',
    component: MockComponent,
  },
  estimate: {
    id: 'estimate',
    label: 'Estimate',
    shortLabel: 'Estimate',
    keywords: [],
    category: 'App',
    presentation: 'app',
    component: MockComponent,
  },
  'action-items': {
    id: 'action-items',
    label: 'Action Items',
    shortLabel: 'Action',
    keywords: [],
    category: 'App',
    presentation: 'app',
    component: MockComponent,
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    shortLabel: 'Docs',
    keywords: [],
    category: 'App',
    presentation: 'app',
    component: MockComponent,
  },
  'form-1040': {
    id: 'form-1040',
    label: 'Form 1040',
    shortLabel: '1040',
    keywords: [],
    category: 'Form',
    presentation: 'column',
    component: MockComponent,
  },
  'sch-1': {
    id: 'sch-1',
    label: 'Schedule 1',
    shortLabel: 'Sch 1',
    keywords: [],
    category: 'Schedule',
    presentation: 'column',
    component: MockComponent,
  },
  'sch-2': stub('sch-2', 'Schedule 2', 'Sch 2'),
  'sch-3': stub('sch-3', 'Schedule 3', 'Sch 3'),
  'sch-a': stub('sch-a', 'Schedule A', 'Sch A'),
  'sch-b': stub('sch-b', 'Schedule B', 'Sch B'),
  'sch-c': stub('sch-c', 'Schedule C', 'Sch C'),
  'sch-d': stub('sch-d', 'Schedule D', 'Sch D'),
  'sch-e': stub('sch-e', 'Schedule E', 'Sch E'),
  'sch-se': stub('sch-se', 'Schedule SE', 'Sch SE'),
  'form-1116': {
    id: 'form-1116',
    label: 'Form 1116',
    shortLabel: '1116',
    keywords: [],
    category: 'Form',
    presentation: 'column',
    component: MockComponent,
    instances: {
      list: () => [
        { key: 'passive', label: 'Passive' },
        { key: 'general', label: 'General' },
      ],
      create: () => ({ key: 'passive', label: 'Passive' }),
      allowCreate: false,
    },
  },
  'form-4797': stub('form-4797', 'Form 4797', '4797'),
  'form-4952': stub('form-4952', 'Form 4952', '4952'),
  'form-6251': stub('form-6251', 'Form 6251', '6251'),
  'form-8582': stub('form-8582', 'Form 8582', '8582'),
  'form-8606': stub('form-8606', 'Form 8606', '8606'),
  'form-8949': stub('form-8949', 'Form 8949', '8949'),
  'form-8995': stub('form-8995', 'Form 8995', '8995'),
  'wks-se-401k': {
    id: 'wks-se-401k',
    label: 'SE 401k Worksheet',
    shortLabel: 'SE 401k',
    keywords: [],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
  'wks-amt-exemption': {
    id: 'wks-amt-exemption',
    label: 'AMT',
    shortLabel: 'AMT',
    keywords: [],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
  'wks-taxable-ss': {
    id: 'wks-taxable-ss',
    label: 'Taxable SS',
    shortLabel: 'SS',
    keywords: [],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
}

function stub(id: string, label: string, shortLabel: string): FormRegistry[keyof FormRegistry] {
  return {
    id: id as never,
    label,
    shortLabel,
    keywords: [],
    category: 'Form' as const,
    presentation: 'column' as const,
    component: MockComponent,
  }
}

beforeEach(() => {
  window.location.hash = ''
  ;(fetchWrapper.get as jest.Mock).mockResolvedValue({})
})

// --- tests -----------------------------------------------------------------

describe('MillerShell', () => {
  it('renders the home view when route is empty', () => {
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={<div>HOME-VIEW</div>} />
      </Wrapper>,
    )
    expect(screen.getByText('HOME-VIEW')).toBeInTheDocument()
  })

  it('renders one column when one segment is in the hash', () => {
    window.location.hash = '#/form-1040'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    expect(screen.queryByText('HOME-VIEW')).not.toBeInTheDocument()
    const sections = document.querySelectorAll('[data-form-id]')
    expect(sections).toHaveLength(1)
    expect(sections[0]?.getAttribute('data-form-id')).toBe('form-1040')
  })

  it('collapses left columns to spines when multiple are open', () => {
    window.location.hash = '#/form-1040/sch-1/form-1116'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    const collapsed = document.querySelectorAll('[data-collapsed="true"]')
    expect(collapsed).toHaveLength(2)
    expect(collapsed[0]?.getAttribute('data-form-id')).toBe('form-1040')
    expect(collapsed[1]?.getAttribute('data-form-id')).toBe('sch-1')
  })

  it('clicking a spine truncates back to that depth', () => {
    window.location.hash = '#/form-1040/sch-1/form-1116'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    const firstSpine = document.querySelector('[data-collapsed="true"][data-form-id="form-1040"]')
    expect(firstSpine).toBeInTheDocument()
    fireEvent.click(firstSpine as Element)
    expect(window.location.hash).toBe('#/form-1040')
  })

  it('renders instance tabs for multi-instance form columns', () => {
    window.location.hash = '#/form-1116:passive'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    expect(screen.getByRole('tab', { name: 'Passive' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking an instance tab updates the hash with the new instance', () => {
    window.location.hash = '#/form-1116:passive'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    expect(window.location.hash).toBe('#/form-1116:general')
  })

  it('shows the empty-state CTA for multi-instance form without an instance', () => {
    window.location.hash = '#/form-1116'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    expect(screen.getByText(/no .* instance selected/i)).toBeInTheDocument()
  })

  it('passes the active instance to the component', () => {
    window.location.hash = '#/form-1116:general'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    expect(screen.getByTestId('mock-content')).toHaveTextContent('instance:general')
  })

  it('drilling into a column-presentation form pushes a new column', () => {
    window.location.hash = '#/form-1040'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    const drillBtn = screen.getByRole('button', { name: 'drill-column' })
    fireEvent.click(drillBtn)
    expect(window.location.hash).toBe('#/form-1040/sch-1')
  })

  it('drilling into a modal-presentation form opens a worksheet dialog without changing the hash', async () => {
    window.location.hash = '#/form-1040'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'drill-worksheet' }))
    expect(window.location.hash).toBe('#/form-1040')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('clicking the close button truncates to that column depth', () => {
    window.location.hash = '#/form-1040/sch-1'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    const closeBtn = screen.getByLabelText('Close columns after Sch 1')
    fireEvent.click(closeBtn)
    expect(window.location.hash).toBe('#/form-1040')
  })

  it('Escape truncates the rightmost column', () => {
    window.location.hash = '#/form-1040/sch-1'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(window.location.hash).toBe('#/form-1040')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(window.location.hash).toBe('')
  })

  it('Escape is ignored when focus is on an editable field', () => {
    window.location.hash = '#/form-1040/sch-1'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(window.location.hash).toBe('#/form-1040/sch-1')
    document.body.removeChild(input)
  })

  it('Escape does not truncate when a dialog is open (worksheet handles it)', async () => {
    window.location.hash = '#/form-1040'
    render(
      <Wrapper>
        <MillerShell registry={mockRegistry} homeView={null} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'drill-worksheet' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(window.location.hash).toBe('#/form-1040')
  })
})
