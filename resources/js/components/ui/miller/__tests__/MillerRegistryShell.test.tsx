import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import type { MillerRegistryEntry, MillerRenderProps } from '../millerRegistry'
import { MillerRegistryShell } from '../MillerRegistryShell'
import { useMillerRoute } from '../useMillerRoute'

type Id = 'home' | 'form-1040' | 'sch-1' | 'form-1116' | 'worksheet'
type TestState = { year: number }

function MockComponent({ instance, onDrill }: MillerRenderProps<TestState, Id>): React.ReactElement {
  return (
    <div data-testid="mock-content">
      <span>{instance ? `instance:${instance.key}` : 'singleton'}</span>
      <button type="button" onClick={() => onDrill({ id: 'sch-1' })}>drill-column</button>
      <button type="button" onClick={() => onDrill({ id: 'worksheet' })}>drill-modal</button>
      <button type="button" onClick={() => onDrill({ id: 'form-1040', placement: 'left-of-current' })}>drill-left</button>
    </div>
  )
}

const registry: Record<Id, MillerRegistryEntry<TestState, Id>> = {
  home: { id: 'home', label: 'Home', shortLabel: 'Home', presentation: 'app', component: MockComponent },
  'form-1040': { id: 'form-1040', label: 'Form 1040', shortLabel: '1040', presentation: 'column', component: MockComponent },
  'sch-1': { id: 'sch-1', label: 'Schedule 1', shortLabel: 'Sch 1', presentation: 'column', component: MockComponent },
  'form-1116': {
    id: 'form-1116',
    label: 'Form 1116',
    shortLabel: '1116',
    presentation: 'column',
    component: MockComponent,
    instances: {
      list: () => [{ key: 'passive', label: 'Passive' }, { key: 'general', label: 'General' }],
      create: () => ({ key: 'passive', label: 'Passive' }),
      allowCreate: false,
    },
  },
  worksheet: { id: 'worksheet', label: 'Worksheet', shortLabel: 'Wks', presentation: 'modal', component: MockComponent },
}

const VALID_IDS: ReadonlySet<string> = new Set(['home', 'form-1040', 'sch-1', 'form-1116', 'worksheet'])

function ShellHarness({ onUnhandled }: { onUnhandled?: (id: Id) => void }): React.ReactElement {
  const routeApi = useMillerRoute<Id>(VALID_IDS)

  return (
    <MillerRegistryShell
      registry={registry}
      state={{ year: 2025 }}
      homeView={<div>HOME-VIEW</div>}
      route={routeApi.route}
      pushColumn={routeApi.pushColumn}
      replaceFrom={routeApi.replaceFrom}
      truncateTo={routeApi.truncateTo}
      navigate={routeApi.navigate}
      onDrillUnhandled={(target) => onUnhandled?.(target.id)}
    />
  )
}

describe('MillerRegistryShell', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('renders the home view when route is empty', () => {
    render(<ShellHarness />)
    expect(screen.getByText('HOME-VIEW')).toBeInTheDocument()
  })

  it('renders one column when one segment is in the hash', () => {
    window.location.hash = '#/form-1040'
    render(<ShellHarness />)
    const sections = document.querySelectorAll('[data-miller-id]')
    expect(sections).toHaveLength(1)
    expect(sections[0]?.getAttribute('data-miller-id')).toBe('form-1040')
  })

  it('renders instance tabs for multi-instance columns', () => {
    window.location.hash = '#/form-1116:passive'
    render(<ShellHarness />)
    expect(screen.getByRole('tab', { name: 'Passive' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking an instance tab updates the hash with the new instance', () => {
    window.location.hash = '#/form-1116:passive'
    render(<ShellHarness />)
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    expect(window.location.hash).toBe('#/form-1116:general')
  })

  it('drilling into a column pushes a new column', () => {
    window.location.hash = '#/form-1040'
    render(<ShellHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'drill-column' }))
    expect(window.location.hash).toBe('#/form-1040/sch-1')
  })

  it('can insert a form to the left of current column', () => {
    window.location.hash = '#/sch-1'
    render(<ShellHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'drill-left' }))
    expect(window.location.hash).toBe('#/form-1040/sch-1')
  })

  it('forwards modal drills to onDrillUnhandled', () => {
    window.location.hash = '#/form-1040'
    const onUnhandled = jest.fn()
    render(<ShellHarness onUnhandled={onUnhandled} />)
    fireEvent.click(screen.getByRole('button', { name: 'drill-modal' }))
    expect(onUnhandled).toHaveBeenCalledWith('worksheet')
    expect(window.location.hash).toBe('#/form-1040')
  })
})
