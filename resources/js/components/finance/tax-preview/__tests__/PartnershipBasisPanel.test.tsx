import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type {
  PartnershipBasisFacts,
  PartnershipBasisInterestFacts,
  PartnershipBasisReconciliationFacts,
  PartnershipBasisWorksheetFacts,
  PartnershipBasisYearSummaryFact,
} from '@/types/generated/tax-preview-facts'

import { PartnershipBasisPanel } from '../PartnershipBasisPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { post: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeWorksheet(overrides: Partial<PartnershipBasisWorksheetFacts> = {}): PartnershipBasisWorksheetFacts {
  return {
    beginningOutsideBasis: 0,
    capitalContributions: 0,
    taxableIncomeIncrease: 0,
    taxExemptIncomeIncrease: 0,
    liabilityIncrease: 0,
    cashDistributions: 0,
    propertyDistributionsBasis: 0,
    liabilityDecrease: 0,
    deductionsLossesDecrease: 0,
    nondeductibleExpensesDecrease: 0,
    foreignTaxesDecrease: 0,
    distributionGain: 0,
    suspendedLossCarryforward: 0,
    endingOutsideBasis: 0,
    liquidationGainLoss: null,
    ...overrides,
  }
}

function makeYearSummary(
  taxYear: number,
  wksOverrides: Partial<PartnershipBasisWorksheetFacts> = {},
  extra: Partial<PartnershipBasisYearSummaryFact> = {},
): PartnershipBasisYearSummaryFact {
  return {
    taxYear,
    reviewStatus: 'needs_review',
    isStale: false,
    isLocked: false,
    carryoverMismatch: null,
    worksheet: makeWorksheet(wksOverrides),
    ...extra,
  }
}

function makeInterest(overrides: Partial<PartnershipBasisInterestFacts> = {}): PartnershipBasisInterestFacts {
  return {
    interestId: 1,
    partnershipName: 'Test Fund LP',
    partnershipEin: null,
    accountId: 10,
    taxYear: 2024,
    beginningTaxBasisCapital: 0,
    endingTaxBasisCapital: 0,
    beginningBookCapital: 0,
    endingBookCapital: 0,
    insideBasisConfidence: 'low',
    reviewStatus: 'needs_review',
    isStale: false,
    carryoverMismatch: null,
    hasActionNeeded: false,
    worksheet: makeWorksheet(),
    basisHistory: [],
    events: [],
    ...overrides,
  }
}

function makeFacts(
  interests: PartnershipBasisInterestFacts[],
  reconciliations: PartnershipBasisReconciliationFacts[] = [],
): PartnershipBasisFacts {
  return {
    interests,
    reconciliations,
    distributionGainSources: [],
    liquidationGainLossSources: [],
    propertyDistributionSources: [],
    form7217RequiredSources: [],
    section754StepUpSources: [],
    form8949Rows: [],
    year: 2024,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PartnershipBasisPanel', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('multi-year basis walk table', () => {
    it('renders one column per basisHistory year, ascending', () => {
      const interest = makeInterest({
        basisHistory: [
          makeYearSummary(2023, { endingOutsideBasis: 10_000 }),
          makeYearSummary(2024, { endingOutsideBasis: 20_000 }),
          makeYearSummary(2022, { endingOutsideBasis: 5_000 }),
        ],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      // Columns appear in ascending order
      const headerCells = screen.getAllByRole('columnheader').map((el) => el.textContent?.replace(/\s/g, '') ?? '')
      const yearHeaders = headerCells.filter((h) => /^20\d\d/.test(h))
      expect(yearHeaders[0]).toContain('2022')
      expect(yearHeaders[1]).toContain('2023')
      expect(yearHeaders[2]).toContain('2024')
    })

    it('renders currency-formatted ending basis totals', () => {
      const interest = makeInterest({
        basisHistory: [
          makeYearSummary(2023, { beginningOutsideBasis: 50_000, endingOutsideBasis: 55_000 }),
        ],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2023} />)

      // The panel-level summary total for ending basis
      expect(screen.getByText('$55,000.00')).toBeInTheDocument()
    })

    it('falls back to a single column from interest.worksheet when basisHistory is empty', () => {
      const interest = makeInterest({
        basisHistory: [],
        worksheet: makeWorksheet({ beginningOutsideBasis: 12_345, endingOutsideBasis: 13_000 }),
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      // Year column header from interest.taxYear
      expect(screen.getByRole('columnheader', { name: /2024/ })).toBeInTheDocument()
      // Beginning basis value rendered in the walk table (also appears in the summary grid)
      const beginningRow = screen.getByRole('row', { name: /Beginning basis/ })
      expect(within(beginningRow).getByText('$12,345.00')).toBeInTheDocument()
    })

    it('renders the "Row" column header for the basis walk table', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, { endingOutsideBasis: 1_000 })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.getByRole('columnheader', { name: 'Row' })).toBeInTheDocument()
    })

    it('shows Total increases and Total decreases subtotal rows', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, { capitalContributions: 5_000, cashDistributions: 2_000 })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.getByText('Total increases')).toBeInTheDocument()
      expect(screen.getByText('Total decreases')).toBeInTheDocument()
      expect(screen.getByText('Ending basis')).toBeInTheDocument()
    })
  })

  describe('carryover mismatch warnings', () => {
    it('highlights the beginning-basis cell and shows warning when carryoverMismatch is set', () => {
      const interest = makeInterest({
        basisHistory: [
          makeYearSummary(
            2024,
            { beginningOutsideBasis: 10_000 },
            { carryoverMismatch: 500 },
          ),
        ],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      // Warning banner is rendered with testid
      expect(screen.getByTestId('carryover-mismatch-warning-2024')).toBeInTheDocument()
      expect(screen.getByTestId('carryover-mismatch-warning-2024')).toHaveTextContent(
        /Prior-year ending basis does not equal this year/i,
      )
      // Delta shown
      expect(screen.getByTestId('carryover-mismatch-warning-2024')).toHaveTextContent('$500.00')
    })

    it('does NOT render a mismatch warning when carryoverMismatch is null', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, {}, { carryoverMismatch: null })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.queryByTestId('carryover-mismatch-warning-2024')).not.toBeInTheDocument()
    })
  })

  describe('locked / stale badges', () => {
    it('renders a Locked badge for a locked year column', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, {}, { isLocked: true, reviewStatus: 'locked' })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.getByText('Locked')).toBeInTheDocument()
    })

    it('renders a Stale badge for a stale year column', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, {}, { isStale: true })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.getByText('Stale')).toBeInTheDocument()
    })

    it('renders a Review badge when status is needs_review and not stale/locked', () => {
      const interest = makeInterest({
        basisHistory: [makeYearSummary(2024, {}, { reviewStatus: 'needs_review', isLocked: false, isStale: false })],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      // There may be multiple "Review" elements from the interest header too — just confirm at least one
      expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0)
    })
  })

  describe('action-needed badge', () => {
    it('renders an "Action needed" badge when hasActionNeeded is true', () => {
      const interest = makeInterest({ hasActionNeeded: true })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.getByTestId('action-needed-badge')).toBeInTheDocument()
      expect(screen.getByTestId('action-needed-badge')).toHaveTextContent('Action needed')
    })

    it('does NOT render an action-needed badge when hasActionNeeded is false', () => {
      const interest = makeInterest({ hasActionNeeded: false })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      expect(screen.queryByTestId('action-needed-badge')).not.toBeInTheDocument()
    })
  })

  describe('reconciliation action cards', () => {
    it('renders nothing when reconciliations is empty', () => {
      const interest = makeInterest()

      const { container } = render(
        <PartnershipBasisPanel facts={makeFacts([interest], [])} year={2024} />,
      )

      expect(screen.queryByText('Reconciliation')).not.toBeInTheDocument()
      expect(container.querySelector('[data-testid^="reconciliation-card-"]')).toBeNull()
    })

    it('renders nothing when all reconciliations have hasReconcilableData=false', () => {
      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 10,
        year: 2024,
        hasReconcilableData: false,
        contributionCandidates: [],
        distributionCandidates: [],
        flags: [],
      }
      const interest = makeInterest()

      render(<PartnershipBasisPanel facts={makeFacts([interest], [recon])} year={2024} />)

      expect(screen.queryByText('Reconciliation')).not.toBeInTheDocument()
    })

    it('renders candidate cards with deep link to basis tab', () => {
      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 42,
        year: 2024,
        hasReconcilableData: true,
        contributionCandidates: [
          {
            id: 'c1',
            kind: 'capital_contribution',
            date: '2024-03-15',
            description: 'Q1 call',
            amount: 10_000,
            suggestedEventType: 'capital_contribution_cash',
            lineItemId: 7,
            statementId: null,
            statementInvestmentId: null,
            reviewStatus: 'needs_review',
          },
        ],
        distributionCandidates: [],
        flags: [],
      }
      const interest = makeInterest()

      render(<PartnershipBasisPanel facts={makeFacts([interest], [recon])} year={2024} />)

      // Deep link to basis tab
      const link = screen.getByTestId('basis-tab-link-42')
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', expect.stringContaining('/finance/account/42/basis'))

      // Candidate card
      expect(screen.getByTestId('candidate-card-c1')).toBeInTheDocument()
      expect(screen.getByTestId('candidate-card-c1')).toHaveTextContent('$10,000.00')
      expect(screen.getByTestId('candidate-card-c1')).toHaveTextContent('Q1 call')
    })

    it('renders reconciliation flags with match/mismatch badges', () => {
      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 20,
        year: 2024,
        hasReconcilableData: true,
        contributionCandidates: [],
        distributionCandidates: [],
        flags: [
          {
            key: 'contrib_match',
            label: 'Contributions',
            status: 'match',
            expected: 5_000,
            observed: 5_000,
            difference: 0,
            detail: 'Contributions match.',
          },
          {
            key: 'dist_mismatch',
            label: 'Distributions',
            status: 'mismatch',
            expected: 2_000,
            observed: 1_500,
            difference: -500,
            detail: 'Distribution amount differs.',
          },
        ],
      }
      const interest = makeInterest()

      render(<PartnershipBasisPanel facts={makeFacts([interest], [recon])} year={2024} />)

      expect(screen.getByText('Match')).toBeInTheDocument()
      expect(screen.getByText('Mismatch')).toBeInTheDocument()
      expect(screen.getByText('Contributions match.')).toBeInTheDocument()
    })

    it('does not seed reconciliation events while rendering', () => {
      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 55,
        year: 2024,
        hasReconcilableData: true,
        contributionCandidates: [
          {
            id: 'x1',
            kind: 'capital_contribution',
            date: null,
            description: null,
            amount: 1_000,
            suggestedEventType: 'capital_contribution_cash',
            lineItemId: 3,
            statementId: null,
            statementInvestmentId: null,
            reviewStatus: 'needs_review',
          },
        ],
        distributionCandidates: [],
        flags: [],
      }
      const interest = makeInterest()

      render(
        <PartnershipBasisPanel
          facts={makeFacts([interest], [recon])}
          year={2024}
          onRefresh={jest.fn()}
        />,
      )

      expect(fetchWrapper.post).not.toHaveBeenCalled()
    })

    it('seed button posts to the reconciliation/seed endpoint and calls onRefresh', async () => {
      const onRefresh = jest.fn().mockResolvedValue(undefined)
      ;(fetchWrapper.post as jest.Mock).mockResolvedValue({})
      jest.spyOn(window, 'confirm').mockReturnValue(true)

      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 55,
        year: 2024,
        hasReconcilableData: true,
        contributionCandidates: [
          {
            id: 'x1',
            kind: 'capital_contribution',
            date: null,
            description: null,
            amount: 1_000,
            suggestedEventType: 'capital_contribution_cash',
            lineItemId: 3,
            statementId: null,
            statementInvestmentId: null,
            reviewStatus: 'needs_review',
          },
        ],
        distributionCandidates: [],
        flags: [],
      }
      const interest = makeInterest()

      render(
        <PartnershipBasisPanel
          facts={makeFacts([interest], [recon])}
          year={2024}
          onRefresh={onRefresh}
        />,
      )

      const seedBtn = screen.getByTestId('seed-button-55')
      fireEvent.click(seedBtn)

      await waitFor(() => {
        expect(fetchWrapper.post).toHaveBeenCalledWith(
          '/api/finance/accounts/55/basis/reconciliation/seed?year=2024',
          {},
        )
        expect(onRefresh).toHaveBeenCalledTimes(1)
      })
    })

    it('does NOT render seed button when onRefresh is not provided', () => {
      const recon: PartnershipBasisReconciliationFacts = {
        accountId: 77,
        year: 2024,
        hasReconcilableData: true,
        contributionCandidates: [
          {
            id: 'y1',
            kind: 'capital_contribution',
            date: null,
            description: null,
            amount: 500,
            suggestedEventType: 'capital_contribution_cash',
            lineItemId: 1,
            statementId: null,
            statementInvestmentId: null,
            reviewStatus: 'needs_review',
          },
        ],
        distributionCandidates: [],
        flags: [],
      }
      const interest = makeInterest()

      render(
        <PartnershipBasisPanel facts={makeFacts([interest], [recon])} year={2024} />,
      )

      expect(screen.queryByTestId('seed-button-77')).not.toBeInTheDocument()
    })
  })

  describe('currency arithmetic via currency.js', () => {
    it('computes Total increases correctly using all increase fields', () => {
      const interest = makeInterest({
        basisHistory: [
          makeYearSummary(2024, {
            capitalContributions: 10_000,
            taxableIncomeIncrease: 5_000,
            taxExemptIncomeIncrease: 2_000,
            liabilityIncrease: 1_000,
          }),
        ],
      })

      render(<PartnershipBasisPanel facts={makeFacts([interest])} year={2024} />)

      // Total increases = 10k + 5k + 2k + 1k = 18k
      expect(screen.getByText('$18,000.00')).toBeInTheDocument()
    })
  })
})
