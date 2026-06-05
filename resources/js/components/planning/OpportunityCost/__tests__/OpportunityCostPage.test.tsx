import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { sampleOpportunityCostProjection } from '../__fixtures__/sampleProjection'
import { DEFAULT_OPPORTUNITY_COST_INPUTS } from '../defaults'
import {
  claimOpportunityCostComparison,
  computeOpportunityCost,
  listSavedCareerJobs,
  saveOpportunityCostComparison,
  updateOpportunityCostComparison,
} from '../opportunityCostApi'
import { OpportunityCostPage } from '../OpportunityCostPage'
import type { OpportunityCostComparisonMeta, OpportunityCostInitialData } from '../types'

jest.mock('../opportunityCostApi', () => ({
  computeOpportunityCost: jest.fn(),
  saveOpportunityCostComparison: jest.fn(),
  updateOpportunityCostComparison: jest.fn(),
  claimOpportunityCostComparison: jest.fn(),
  listSavedCareerJobs: jest.fn(),
}))

const mockCompute = computeOpportunityCost as jest.Mock
const mockSave = saveOpportunityCostComparison as jest.Mock
const mockUpdate = updateOpportunityCostComparison as jest.Mock
const mockClaim = claimOpportunityCostComparison as jest.Mock
const mockList = listSavedCareerJobs as jest.Mock

const savedComparison: OpportunityCostComparisonMeta = {
  id: 1,
  shortCode: 'abc1234',
  shareUrl: 'http://localhost/financial-planning/opportunity-cost/s/abc1234',
  ownerUserId: 5,
  shareIncludesCurrent: true,
}

function baseInitialData(overrides: Partial<OpportunityCostInitialData> = {}): OpportunityCostInitialData {
  return {
    inputs: DEFAULT_OPPORTUNITY_COST_INPUTS,
    projection: sampleOpportunityCostProjection,
    authenticated: false,
    ...overrides,
  }
}

describe('OpportunityCostPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompute.mockResolvedValue(sampleOpportunityCostProjection)
    mockSave.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleOpportunityCostProjection })
    mockUpdate.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleOpportunityCostProjection })
    mockClaim.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleOpportunityCostProjection })
    mockList.mockResolvedValue({ jobs: [] })
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
    window.history.replaceState(null, '', '/financial-planning/opportunity-cost')
  })

  it('renders the show-route calculator shell and result launchers', () => {
    render(<OpportunityCostPage initialData={baseInitialData()} />)

    expect(screen.getByRole('heading', { name: 'Opportunity Cost Planner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Annual FCF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open LTV Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Vesting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax FCF' })).toBeInTheDocument()
  })

  it('saves a new comparison for an authenticated user and switches to Update', async () => {
    render(<OpportunityCostPage initialData={baseInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][1]).toBe(true)
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('forks to URL state when an unauthenticated guest views a comparison they cannot edit', async () => {
    render(<OpportunityCostPage initialData={baseInitialData({ comparison: { ...savedComparison, ownerUserId: 9 }, canEdit: false })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }))

    expect(await screen.findByText(/forked to url state/i)).toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('copies the canonical share url for a saved comparison', async () => {
    render(<OpportunityCostPage initialData={baseInitialData({ authenticated: true, comparison: savedComparison, canEdit: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(savedComparison.shareUrl))
  })

  it('claims an anonymous comparison on login', async () => {
    render(<OpportunityCostPage initialData={baseInitialData({ authenticated: true, comparison: { ...savedComparison, ownerUserId: null }, canEdit: false })} />)

    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('abc1234'))
    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument()
  })
})
