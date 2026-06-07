import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { sampleCareerCompProjection } from '../__fixtures__/sampleProjection'
import {
  computeCareerComp,
  deleteSharedCareerComparison,
  importRsuIntoCurrentJob,
  saveLatestCareerComparison,
  saveSharedCareerComparison,
  shareCareerComparison,
  updateSharedCareerComparisonExpiration,
} from '../careerCompApi'
import { CareerCompPage } from '../CareerCompPage'
import { serializeCareerCompUrlState } from '../careerCompUrlState'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerComparisonMeta, CareerCompInitialData, CareerCompInputs } from '../types'

jest.mock('../careerCompApi', () => ({
  computeCareerComp: jest.fn(),
  saveLatestCareerComparison: jest.fn(),
  shareCareerComparison: jest.fn(),
  saveSharedCareerComparison: jest.fn(),
  updateSharedCareerComparisonExpiration: jest.fn(),
  deleteSharedCareerComparison: jest.fn(),
  importRsuIntoCurrentJob: jest.fn(),
}))

const mockCompute = computeCareerComp as jest.Mock
const mockSaveLatest = saveLatestCareerComparison as jest.Mock
const mockShare = shareCareerComparison as jest.Mock
const mockSaveShare = saveSharedCareerComparison as jest.Mock
const mockUpdateExpiration = updateSharedCareerComparisonExpiration as jest.Mock
const mockDeleteShare = deleteSharedCareerComparison as jest.Mock
const mockImportRsu = importRsuIntoCurrentJob as jest.Mock

const sharedFork: CareerComparisonMeta = {
  id: 2,
  shortCode: 'share123',
  shareUrl: 'http://localhost/financial-planning/career-comparison/s/share123',
  ownerUserId: 5,
  shareIncludesCurrent: true,
  expiresAt: null,
  isCreator: false,
}

function workflowResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    title: null,
    shortCode: null,
    shareUrl: null,
    ownerUserId: 5,
    shareIncludesCurrent: true,
    expiresAt: null,
    updatedAt: null,
    inputs: DEFAULT_CAREER_COMP_INPUTS,
    projection: sampleCareerCompProjection,
    ...overrides,
  }
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
    mockSaveLatest.mockResolvedValue(workflowResponse())
    mockShare.mockResolvedValue(workflowResponse({ id: 2, shortCode: 'share123', shareUrl: sharedFork.shareUrl, isCreator: true }))
    mockSaveShare.mockResolvedValue(workflowResponse({ id: 2, shortCode: 'share123', shareUrl: sharedFork.shareUrl }))
    mockUpdateExpiration.mockResolvedValue(workflowResponse({ id: 2, shortCode: 'share123', shareUrl: sharedFork.shareUrl, isCreator: true }))
    mockDeleteShare.mockResolvedValue({ deleted: true })
    mockImportRsu.mockResolvedValue({ currentJob: { ...DEFAULT_CAREER_COMP_INPUTS.currentJob!, rsuGrants: [] }, importedGrants: [] })
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
    window.history.replaceState(null, '', '/financial-planning/career-comparison')
  })

  it('renders the calculator shell and result launchers', () => {
    render(<CareerCompPage initialData={baseInitialData()} />)

    expect(screen.getByRole('heading', { name: 'Career Comparison' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax FCF' })).toBeInTheDocument()
  })

  it('opens ISO limit warning details from the warning banner', () => {
    const warning = 'New job offer: ISO first-exercisable value exceeds $100k in 2026; spillover treated as NSO.'

    render(<CareerCompPage initialData={baseInitialData({ projection: { ...sampleCareerCompProjection, warnings: [warning] } })} />)

    fireEvent.click(screen.getByRole('button', { name: warning }))

    expect(screen.getByRole('dialog', { name: 'Why ISO/NSO still matters with early exercise' })).toBeInTheDocument()
    expect(screen.getByText(/early exercise does not remove the ISO \$100k limit/i)).toBeInTheDocument()
    expect(screen.getByText(/immediate ISO AMT preference and NSO ordinary-income spread may both be \$0/i)).toBeInTheDocument()
  })

  it('autosaves the private latest for an authenticated user', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    await waitFor(() => expect(mockSaveLatest).toHaveBeenCalled())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('ignores stale URL state when an authenticated user has server inputs', async () => {
    const urlInputs: CareerCompInputs = {
      ...DEFAULT_CAREER_COMP_INPUTS,
      horizonYears: 17,
      currentJob: DEFAULT_CAREER_COMP_INPUTS.currentJob
        ? {
            ...DEFAULT_CAREER_COMP_INPUTS.currentJob,
            comp: {
              ...DEFAULT_CAREER_COMP_INPUTS.currentJob.comp,
              baseSalary: 999999,
            },
          }
        : null,
    }
    window.history.replaceState(null, '', `/financial-planning/career-comparison?${serializeCareerCompUrlState(urlInputs)}`)

    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    await waitFor(() => expect(mockSaveLatest).toHaveBeenCalled())
    const savedInputs = mockSaveLatest.mock.calls[0]?.[0] as CareerCompInputs
    expect(savedInputs.horizonYears).toBe(DEFAULT_CAREER_COMP_INPUTS.horizonYears)
    expect(savedInputs.currentJob?.comp.baseSalary).toBe(DEFAULT_CAREER_COMP_INPUTS.currentJob?.comp.baseSalary)
  })

  it('does not autosave for an anonymous visitor of the public tool', async () => {
    render(<CareerCompPage initialData={baseInitialData()} />)

    await waitFor(() => expect(mockCompute).toHaveBeenCalled())
    expect(mockSaveLatest).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('creates and copies a share link from the share dialog', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create & copy link' }))

    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1))
    expect(mockShare.mock.calls[0][1]).toBe(true)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sharedFork.shareUrl)
  })

  it('autosaves edits on a shared fork to that link', async () => {
    render(<CareerCompPage initialData={baseInitialData({ comparison: sharedFork, canEdit: true })} />)

    await waitFor(() => expect(mockSaveShare).toHaveBeenCalled())
    expect(mockSaveShare.mock.calls[0][0]).toBe('share123')
    expect(mockSaveLatest).not.toHaveBeenCalled()
    expect(await screen.findByText('Saved to link')).toBeInTheDocument()
  })

  it('lets the share creator delete the link', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true, comparison: { ...sharedFork, isCreator: true }, canEdit: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage link' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete link' }))

    await waitFor(() => expect(mockDeleteShare).toHaveBeenCalledWith('share123'))
    expect(await screen.findByText(/this link will no longer work/i)).toBeInTheDocument()
  })

  it('imports RSU grants into the current job for authenticated users', async () => {
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Import RSU' }))

    await waitFor(() => expect(mockImportRsu).toHaveBeenCalledWith(DEFAULT_CAREER_COMP_INPUTS.currentJob))
    expect(await screen.findByText('No RSU awards found to import.')).toBeInTheDocument()
  })

  it('keeps focus in a new grant editor after the first field change creates the grant', () => {
    render(<CareerCompPage initialData={baseInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Offers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add RSU grant' }))

    const shareCount = screen.getByLabelText('Share count')
    shareCount.focus()
    expect(shareCount).toHaveFocus()

    fireEvent.change(shareCount, { target: { value: '2500' } })

    expect(shareCount).toHaveFocus()
  })
})
