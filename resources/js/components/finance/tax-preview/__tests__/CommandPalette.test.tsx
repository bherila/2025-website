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
import { CommandPalette } from '../CommandPalette'
import { DockActionsProvider } from '../DockActions'
import type { FormRegistry, FormRenderProps } from '../formRegistry'

const SHELL = { year: 2025, availableYears: [2025] }

function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <TaxPreviewProvider initialData={SHELL}>
      <DockActionsProvider>{children}</DockActionsProvider>
    </TaxPreviewProvider>
  )
}

function MockComponent(_props: FormRenderProps): React.ReactElement {
  return <div data-testid="mock-content" />
}

const sharedDefaults = {
  keywords: [] as string[],
  component: MockComponent,
}

const mockRegistry: FormRegistry = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    category: 'App',
    presentation: 'app',
    ...sharedDefaults,
  },
  estimate: {
    id: 'estimate',
    label: 'Tax Estimate',
    shortLabel: 'Estimate',
    category: 'App',
    presentation: 'app',
    ...sharedDefaults,
  },
  'action-items': {
    id: 'action-items',
    label: 'Action Items',
    shortLabel: 'Action',
    category: 'App',
    presentation: 'app',
    ...sharedDefaults,
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    shortLabel: 'Docs',
    category: 'App',
    presentation: 'app',
    ...sharedDefaults,
  },
  'form-1040': {
    id: 'form-1040',
    label: 'Form 1040 — U.S. Individual Income Tax Return',
    shortLabel: '1040',
    formNumber: '1040',
    keywords: ['1040', 'individual'],
    category: 'Form',
    presentation: 'column',
    component: MockComponent,
  },
  'sch-1': {
    id: 'sch-1',
    label: 'Schedule 1',
    shortLabel: 'Sch 1',
    formNumber: '1',
    keywords: ['additional income'],
    category: 'Schedule',
    presentation: 'column',
    component: MockComponent,
  },
  'sch-2': stubColumn('sch-2', 'Schedule 2', 'Sch 2'),
  'sch-3': stubColumn('sch-3', 'Schedule 3', 'Sch 3'),
  'sch-a': stubColumn('sch-a', 'Schedule A', 'Sch A'),
  'sch-b': {
    id: 'sch-b',
    label: 'Schedule B — Interest & Dividends',
    shortLabel: 'Sch B',
    formNumber: 'B',
    keywords: ['interest', 'dividends'],
    category: 'Schedule',
    presentation: 'column',
    component: MockComponent,
  },
  'sch-c': stubColumn('sch-c', 'Schedule C', 'Sch C'),
  'sch-d': stubColumn('sch-d', 'Schedule D', 'Sch D'),
  'sch-e': stubColumn('sch-e', 'Schedule E', 'Sch E'),
  'sch-f': stubColumn('sch-f', 'Schedule F', 'Sch F'),
  'sch-se': stubColumn('sch-se', 'Schedule SE', 'Sch SE'),
  'form-1116': {
    id: 'form-1116',
    label: 'Form 1116 — Foreign Tax Credit',
    shortLabel: '1116',
    formNumber: '1116',
    keywords: ['foreign tax', 'FTC'],
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
  'form-4797': stubColumn('form-4797', 'Form 4797', '4797'),
  'form-4952': stubColumn('form-4952', 'Form 4952', '4952'),
  'form-6251': stubColumn('form-6251', 'Form 6251', '6251'),
  'form-8582': {
    id: 'form-8582',
    label: 'Form 8582',
    shortLabel: '8582',
    formNumber: '8582',
    keywords: ['passive activity', 'PAL'],
    category: 'Form',
    presentation: 'column',
    component: MockComponent,
    instances: {
      list: () => [{ key: 'a', label: 'Activity A' }],
      create: () => ({ key: 'new', label: 'New activity' }),
      allowCreate: true,
    },
  },
  'form-8606': stubColumn('form-8606', 'Form 8606', '8606'),
  'form-8949': stubColumn('form-8949', 'Form 8949', '8949'),
  'form-8995': stubColumn('form-8995', 'Form 8995', '8995'),
  'wks-se-401k': {
    id: 'wks-se-401k',
    label: 'SE 401(k) Worksheet',
    shortLabel: 'SE 401k',
    keywords: ['401k', 'self-employed retirement'],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
  'wks-amt-exemption': {
    id: 'wks-amt-exemption',
    label: 'AMT Exemption',
    shortLabel: 'AMT',
    keywords: ['AMT'],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
  'wks-taxable-ss': {
    id: 'wks-taxable-ss',
    label: 'Taxable Social Security',
    shortLabel: 'SS',
    keywords: ['social security'],
    category: 'Worksheet',
    presentation: 'modal',
    component: MockComponent,
  },
  'wks-1116-apportionment': {
    id: 'wks-1116-apportionment',
    label: '1116 Apportionment Worksheet',
    shortLabel: '1116 Wks',
    keywords: ['apportionment'],
    category: 'Worksheet',
    presentation: 'column',
    component: MockComponent,
  },
}

function stubColumn(id: string, label: string, shortLabel: string): FormRegistry[keyof FormRegistry] {
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

describe('CommandPalette', () => {
  it('renders grouped results from the registry', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    expect(screen.getByRole('group', { name: 'Schedules' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Forms' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Worksheets' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'App' })).toBeInTheDocument()
  })

  it('expands a multi-instance form into one row per instance', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    expect(screen.getByText('1116 — Passive')).toBeInTheDocument()
    expect(screen.getByText('1116 — General')).toBeInTheDocument()
  })

  it('emits a "+ Create new instance" row only for forms with allowCreate', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    expect(screen.getByText('8582 — + Create new instance')).toBeInTheDocument()
    // Form 1116 has allowCreate=false → no create row
    expect(screen.queryByText('1116 — + Create new instance')).not.toBeInTheDocument()
  })

  it('matches by synonym keyword', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    const input = screen.getByPlaceholderText(/jump to a form/i)
    fireEvent.change(input, { target: { value: 'foreign' } })
    // Should match Form 1116 (keyword "foreign tax")
    expect(screen.getByText('1116 — Passive')).toBeInTheDocument()
    // Schedule B has no "foreign" keyword
    expect(screen.queryByText('Schedule B — Interest & Dividends')).not.toBeInTheDocument()
  })

  it('matches by form number', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    const input = screen.getByPlaceholderText(/jump to a form/i)
    fireEvent.change(input, { target: { value: '8582' } })
    expect(screen.getByText('8582 — Activity A')).toBeInTheDocument()
    expect(screen.queryByText('1116 — Passive')).not.toBeInTheDocument()
  })

  it('selecting a column form pushes a hash route and closes', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Form 1040 — U.S. Individual Income Tax Return'))
    expect(window.location.hash).toBe('#/form-1040')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('selecting an instance pushes the instance hash route', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('1116 — General'))
    expect(window.location.hash).toBe('#/form-1116:general')
  })

  it('selecting a worksheet opens the modal without changing the hash', async () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('SE 401(k) Worksheet'))
    expect(window.location.hash).toBe('')
    // The shell renders the worksheet dialog when worksheetId is set; assert the
    // close callback fired.
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('selecting a "create new instance" row creates and pushes the new instance', () => {
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('8582 — + Create new instance'))
    expect(window.location.hash).toBe('#/form-8582:new')
  })

  it('selecting Home clears the route', () => {
    window.location.hash = '#/form-1040'
    const onOpenChange = jest.fn()
    render(
      <Wrapper>
        <CommandPalette open onOpenChange={onOpenChange} registry={mockRegistry} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Home'))
    expect(window.location.hash).toBe('')
  })
})
