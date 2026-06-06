import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import {
  activateCareerCompWorkflow,
  claimCareerComparison,
  computeCareerComp,
  deleteCareerCompWorkflow,
  getCareerCompWorkflow,
  importRsuIntoCurrentJob,
  listCareerCompWorkflows,
  listSavedCareerJobs,
  saveCareerComparison,
  shareCareerComparison,
  updateCareerComparison,
} from '../careerCompApi'
import { CareerCompPage } from '../CareerCompPage'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerComparisonMeta, CareerCompInitialData } from '../types'

jest.mock('../careerCompApi', () => ({
  computeCareerComp: jest.fn(),
  saveCareerComparison: jest.fn(),
  updateCareerComparison: jest.fn(),
  claimCareerComparison: jest.fn(),
  listSavedCareerJobs: jest.fn(),
  listCareerCompWorkflows: jest.fn(),
  getCareerCompWorkflow: jest.fn(),
  activateCareerCompWorkflow: jest.fn(),
  deleteCareerCompWorkflow: jest.fn(),
  shareCareerComparison: jest.fn(),
  importRsuIntoCurrentJob: jest.fn(),
}))

const mockCompute = computeCareerComp as jest.Mock
const mockSave = saveCareerComparison as jest.Mock
const mockUpdate = updateCareerComparison as jest.Mock
const mockClaim = claimCareerComparison as jest.Mock
const mockList = listSavedCareerJobs as jest.Mock
const mockListWorkflows = listCareerCompWorkflows as jest.Mock
const mockGetWorkflow = getCareerCompWorkflow as jest.Mock
const mockActivateWorkflow = activateCareerCompWorkflow as jest.Mock
const mockDeleteWorkflow = deleteCareerCompWorkflow as jest.Mock
const mockShare = shareCareerComparison as jest.Mock
const mockImportRsu = importRsuIntoCurrentJob as jest.Mock

const savedComparison: CareerComparisonMeta = {
  id: 1,
  shortCode: 'abc1234',
  shareUrl: 'http://localhost/financial-planning/career-comparison/s/abc1234',
  ownerUserId: 5,
  shareIncludesCurrent: true,
}

function baseInitialData(overrides: Partial<CareerCompInitialData> = {}): CareerCompInitialData {
  return {
    inputs: DEFAULT_CAREER_COMP_INPUTS,
    projection: sampleCareerCompProjection,
    authenticated: false,
    ...overrides,
  }
}

describe('CareerCompPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompute.mockResolvedValue(sampleCareerCompProjection)
    mockSave.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleCareerCompProjection })
    mockUpdate.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleCareerCompProjection })
    mockClaim.mockResolvedValue({ id: 1, shortCode: 'abc1234', shareUrl: savedComparison.shareUrl, projection: sampleCareerCompProjection })
    mockList.mockResolvedValue({ jobs: [] })
    mockListWorkflows.mockResolvedValue({ workflows: [] })
    mockGetWorkflow.mockResolvedValue({ ...savedComparison, title: 'Saved workflow', inputs: DEFAULT_CAREER_COMP_INPUTS, projection: sampleCareerCompProjection, lastActiveAt: null, updatedAt: null })
    mockActivateWorkflow.mockResolvedValue({ ...savedComparison, title: 'Saved workflow', inputs: DEFAULT_CAREER_COMP_INPUTS, projection: sampleCareerCompProjection, lastActiveAt: null, updatedAt: null })
    mockDeleteWorkflow.mockResolvedValue({ deleted: true })
    mockShare.mockResolvedValue({ id: 2, shortCode: 'share123', shareUrl: 'http://localhost/financial-planning/career-comparison/s/share123', projection: sampleCareerCompProjection })
    mockImportRsu.mockResolvedValue({ currentJob: { ...DEFAULT_CAREER_COMP_INPUTS.currentJob!, rsuGrants: [] }, importedGrants: [] })
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
    window.history.replaceState(null, '', '/financial-planning/career-comparison')
  })

  it('renders the show-route calculator shell and result launchers', () => {
    render(<CareerCompPage initialData={baseInitialData()} />)

    expect(screen.getByRole('heading', { name: 'Career Comparison' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Annual FCF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open LTV Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Vesting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax FCF' })).toBeInTheDocument()
  })

  it('saves a new comparison for an authenticated user and switches to Update', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][1]).toBe(true)
    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('forks to URL state when an unauthenticated guest views a comparison they cannot edit', async () => {
    render(<CareerCompPage initialData={baseInitialData({ comparison: { ...savedComparison, ownerUserId: 9 }, canEdit: false })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fork' }))

    expect(await screen.findByText(/forked to url state/i)).toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('creates and copies a point-in-time share snapshot for a saved comparison', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true, comparison: savedComparison, canEdit: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/financial-planning/career-comparison/s/share123')
  })

  it('strips the shared code from the URL when starting a new workflow', () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison/s/abc1234')

    render(<CareerCompPage initialData={baseInitialData({ authenticated: true, comparison: savedComparison, canEdit: false })} />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    expect(window.location.pathname).toBe('/financial-planning/career-comparison')
    expect(window.location.search).toBe('')
  })

  it('claims an anonymous comparison on login', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true, comparison: { ...savedComparison, ownerUserId: null }, canEdit: false })} />)

    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('abc1234'))
    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('imports RSU grants into the current job for authenticated users', async () => {
    mockImportRsu.mockResolvedValue({
      currentJob: {
        ...DEFAULT_CAREER_COMP_INPUTS.currentJob!,
        rsuGrants: [{ id: 'rsu-tool-2026', kind: 'hire', grantDate: '2026-01-01', shareCount: 100, grantValue: null, grantPrice: 10, cliffMonths: 0, vestingYears: 1, vestingFrequency: 'quarterly' }],
      },
      importedGrants: [{ id: 'rsu-tool-2026', kind: 'hire', grantDate: '2026-01-01', shareCount: 100, grantValue: null, grantPrice: 10, cliffMonths: 0, vestingYears: 1, vestingFrequency: 'quarterly' }],
    })

    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Import RSU' }))

    await waitFor(() => expect(mockImportRsu).toHaveBeenCalledWith(DEFAULT_CAREER_COMP_INPUTS.currentJob))
    expect(await screen.findByText('Imported 1 RSU grant.')).toBeInTheDocument()
  })
})
