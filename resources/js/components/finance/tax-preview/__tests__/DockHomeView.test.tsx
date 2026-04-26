import { fireEvent, render, screen, within } from '@testing-library/react'
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
import { DockHomeView } from '../DockHomeView'

const STORAGE_KEY = 'taxPreviewPrefs'
const SHELL = { year: 2025, availableYears: [2025] }

function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <TaxPreviewProvider initialData={SHELL}>
      <DockActionsProvider>{children}</DockActionsProvider>
    </TaxPreviewProvider>
  )
}

beforeEach(() => {
  window.location.hash = ''
  window.localStorage.clear()
  ;(fetchWrapper.get as jest.Mock).mockResolvedValue({})
})

describe('DockHomeView', () => {
  it('does not render Pinned or Recent cards when prefs are empty', () => {
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
  })

  it('renders the Pinned card with stored entries', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, pinnedForms: ['form-1040'], recentForms: {} }),
    )
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    const pinnedCard = screen.getByText('Pinned').closest('[data-slot="card"]') as HTMLElement
    expect(pinnedCard).toBeInTheDocument()
    expect(within(pinnedCard).getByText('1040')).toBeInTheDocument()
  })

  it('renders the Recent card and excludes pinned ids', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pinnedForms: ['form-1040'],
        recentForms: { '2025': ['form-1040', 'sch-a', 'sch-b'] },
      }),
    )
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    const recentCard = screen.getByText('Recent').closest('[data-slot="card"]') as HTMLElement
    expect(recentCard).toBeInTheDocument()
    expect(within(recentCard).getByText('Sch A')).toBeInTheDocument()
    expect(within(recentCard).getByText('Sch B')).toBeInTheDocument()
    // form-1040 is in pinned, so it should not appear in Recent
    expect(within(recentCard).queryByText('1040')).not.toBeInTheDocument()
  })

  it('Clear button empties the Recent list for the active year', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pinnedForms: [],
        recentForms: { '2025': ['sch-a'] },
      }),
    )
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.recentForms['2025']).toEqual([])
  })

  it('clicking the pin icon toggles a form into the Pinned card', () => {
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Pin Sch A$/i }))
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.pinnedForms).toContain('sch-a')
  })

  it('renders Recent above App and Forms but below Pinned', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pinnedForms: ['form-1040'],
        recentForms: { '2025': ['sch-b'] },
      }),
    )
    render(
      <Wrapper>
        <DockHomeView />
      </Wrapper>,
    )
    const titleTexts = Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
      (el) => el.textContent,
    )
    const pinnedIdx = titleTexts.indexOf('Pinned')
    const recentIdx = titleTexts.indexOf('Recent')
    const appIdx = titleTexts.indexOf('App')
    const formsIdx = titleTexts.indexOf('Forms')
    expect(pinnedIdx).toBeGreaterThanOrEqual(0)
    expect(pinnedIdx).toBeLessThan(recentIdx)
    expect(recentIdx).toBeLessThan(appIdx)
    expect(appIdx).toBeLessThan(formsIdx)
  })
})
