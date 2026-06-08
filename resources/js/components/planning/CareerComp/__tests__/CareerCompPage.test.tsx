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
import { ltvDetailRouteInstance } from '../careerCompRoute'
import { serializeCareerCompUrlState } from '../careerCompUrlState'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import type { CareerComparisonMeta, CareerCompInitialData, CareerCompInputs, CareerCompProjection } from '../types'

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
const currentJobFixture = { ...DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs[0]!, id: 'current', name: 'Current job' }

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

function projectionWithAfterTax(projection: CareerCompProjection): CareerCompProjection {
  return {
    ...projection,
    jobs: projection.jobs.map((job) => ({
      ...job,
      afterTax: {
        annual: job.annual.map((annual) => ({
          year: annual.year,
          taxableCompIncome: 0,
          totalTaxableIncome: 0,
          nsoOrdinaryIncome: 0,
          isoAmtPreference: 0,
          equitySaleProceeds: 0,
          equityCapitalGain: 0,
          estimatedRegularTax: 0,
          estimatedAmt: 0,
          totalEstimatedTax: 0,
          freeCashFlow: annual.freeCashFlow,
          sourceIds: [],
        })),
        lifetime: {
          taxableCompIncome: 0,
          totalTaxableIncome: 0,
          nsoOrdinaryIncome: 0,
          isoAmtPreference: 0,
          equitySaleProceeds: 0,
          equityCapitalGain: 0,
          estimatedRegularTax: 0,
          estimatedAmt: 0,
          totalEstimatedTax: 0,
          freeCashFlow: 0,
          totalValue: job.lifetime.totalValue,
        },
        sources: [],
        form6251: [],
      },
    })),
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
    mockImportRsu.mockResolvedValue({ currentJob: { ...currentJobFixture, rsuGrants: [] }, importedGrants: [] })
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
    window.history.replaceState(null, '', '/financial-planning/career-comparison')
  })

  it('renders the calculator shell and result launchers', () => {
    render(<CareerCompPage initialData={baseInitialData()} />)

    expect(screen.getByRole('heading', { name: 'Career Comparison' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Liquidity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open After-Tax Liquidity' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open After-Tax FCF' })).toBeInTheDocument()
  })

  it('opens the unified liquidity result column from the canonical hash', () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison#/liquidity-over-time')

    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    expect(container.querySelector('section[data-column-id="liquidity-over-time"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Before tax' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('maps the legacy after-tax liquidity hash to the unified liquidity result column', async () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison#/after-tax-liquidity')

    const { container } = render(<CareerCompPage initialData={baseInitialData({ projection: projectionWithAfterTax(sampleCareerCompProjection) })} />)

    expect(container.querySelector('section[data-column-id="liquidity-over-time"]')).toBeInTheDocument()
    expect(container.querySelector('section[data-column-id="after-tax-liquidity"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'After tax' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(window.location.hash).toBe('#/liquidity-over-time'))
  })

  it('opens a Miller result column from the initial hash', () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison#/ltv-table')

    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    expect(container.querySelector('section[data-column-id="ltv-table"]')).toBeInTheDocument()
    expect(screen.getAllByText('Lifetime Value Comparison').length).toBeGreaterThan(0)
  })

  it('writes launcher navigation into the hash and clears it when the column closes', () => {
    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open LTV Table' }))

    expect(window.location.hash).toBe('#/ltv-table')
    expect(container.querySelector('section[data-column-id="ltv-table"]')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close columns after LTV Table' }))

    expect(window.location.hash).toBe('')
    expect(container.querySelector('section[data-column-id="ltv-table"]')).not.toBeInTheDocument()
  })

  it('pushes LTV detail Miller columns from clicked lifetime cells', () => {
    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open LTV Table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Drill into Offer 1 cash comp' }))

    const detailInstance = ltvDetailRouteInstance({ jobId: 'hyp-1', metric: 'cash-comp', band: 'medium' })
    expect(window.location.hash).toBe(`#/ltv-table/ltv-detail:${encodeURIComponent(detailInstance)}`)
    expect(container.querySelector('section[data-column-id="ltv-detail"]')).toBeInTheDocument()
    expect(screen.getByText('Offer 1 Cash comp')).toBeInTheDocument()
  })

  it('opens LTV detail columns from deep links', () => {
    const detailInstance = ltvDetailRouteInstance({ jobId: 'hyp-1', metric: 'paper-equity', band: 'medium' })
    window.history.replaceState(null, '', `/financial-planning/career-comparison#/ltv-table/ltv-detail:${encodeURIComponent(detailInstance)}`)

    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    expect(container.querySelector('section[data-column-id="ltv-detail"]')).toBeInTheDocument()
    expect(screen.getByText('Offer 1 Paper equity med')).toBeInTheDocument()
  })

  it('preserves hash navigation when anonymous URL input state is rewritten', async () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison#/offers')
    const inputs = { ...DEFAULT_CAREER_COMP_INPUTS, horizonYears: DEFAULT_CAREER_COMP_INPUTS.horizonYears + 1 }

    const { container } = render(<CareerCompPage initialData={baseInitialData({ inputs })} />)

    await waitFor(() => expect(window.location.search).toContain('cc='))
    expect(window.location.hash).toBe('#/offers')
    expect(container.querySelector('section[data-column-id="offers"]')).toBeInTheDocument()
  })

  it('opens grant editor columns from deep links', () => {
    window.history.replaceState(null, '', '/financial-planning/career-comparison#/offers/grant-rsu:hyp-1%3Ahyp-1-rsu-1')

    const { container } = render(<CareerCompPage initialData={baseInitialData()} />)

    expect(container.querySelector('section[data-column-id="grant-rsu"]')).toBeInTheDocument()
    expect(screen.getByText('Edit RSU grant')).toBeInTheDocument()
    expect(screen.getByLabelText('Share count')).toHaveValue(1000)
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
      currentJobs: [{
        ...currentJobFixture,
        comp: {
          ...currentJobFixture.comp,
          baseSalary: 999999,
        },
      }],
    }
    window.history.replaceState(null, '', `/financial-planning/career-comparison?${serializeCareerCompUrlState(urlInputs)}`)

    render(<CareerCompPage initialData={baseInitialData({ authenticated: true })} />)

    await waitFor(() => expect(mockSaveLatest).toHaveBeenCalled())
    const savedInputs = mockSaveLatest.mock.calls[0]?.[0] as CareerCompInputs
    expect(savedInputs.horizonYears).toBe(DEFAULT_CAREER_COMP_INPUTS.horizonYears)
    expect(savedInputs.currentJobs).toHaveLength(0)
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
    render(<CareerCompPage initialData={baseInitialData({ authenticated: true, inputs: { ...DEFAULT_CAREER_COMP_INPUTS, currentJobs: [currentJobFixture] } })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Import RSU' }))

    await waitFor(() => expect(mockImportRsu).toHaveBeenCalledWith(currentJobFixture))
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
