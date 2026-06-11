import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { CareerCompInputs } from '@/components/planning/CareerComp/types'
import RsuPage from '@/components/rsu/RsuPage'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

jest.mock('@/components/container', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/rsu/RsuSubNav', () => ({
  __esModule: true,
  default: () => <nav>RSU nav</nav>,
}))

jest.mock('@/components/rsu/RsuChart', () => ({
  __esModule: true,
  default: () => <div>RSU chart</div>,
}))

jest.mock('@/lib/permissions', () => ({
  hasPermission: jest.fn(() => true),
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const focusedAward: IAward = {
  id: 1,
  award_id: 'RSU-FOCUS',
  grant_date: '2026-01-01',
  vest_date: '2026-06-01',
  share_count: 10,
  symbol: 'META',
  vest_price: 100,
  vest_price_source: 'manual',
  grant_price: null,
  settlement_allocations: [{
    id: 11,
    equity_award_id: 1,
    settlement: {
      id: 9,
      status: 'confirmed',
      gross_income: '1000.0000',
      withheld_value: '300.0000',
      actual_tax_remitted: '275.0000',
      excess_refund: '25.0000',
    },
  }],
  rsu_links: [],
}

const careerInputs: CareerCompInputs = {
  horizonYears: 4,
  startYear: 2026,
  modelAssumptions: {
    commonFmvPctOfPreferred: {
      stageA: 15,
      stageB: 25,
      stageC: 40,
      bridge: 50,
      stageD: 65,
      stageE: 80,
      liquidityEvent: 100,
    },
    tax: { filingStatus: 'single' },
    careerTransition: { currentJobNoticeWeeks: 2, timeOffBetweenJobsWeeks: 0 },
  },
  currentJobs: [{
    id: 'current',
    name: 'CurrentCo',
    notesMarkdown: null,
    archived: false,
    startDate: '2026-01-01',
    priorJobResignationDate: null,
    transitionOverride: { currentJobNoticeWeeks: null, timeOffBetweenJobsWeeks: null },
    retainedCurrentJobIds: [],
    company: {
      type: 'public',
      currentSharePrice: 100,
      fourNineA: 0,
      fullyDilutedShares: 0,
      annualDilutionPct: 0,
      liquidityDate: null,
      valuationScenarios: [],
    },
    comp: { baseSalary: 200000, cashBonus: 0, annualRaisePct: 5 },
    grantTypes: { rsu: true, options: false },
    refresher: {
      pctOfBase: 25,
      optionPctOfFullyDilutedShares: 0,
      optionType: 'iso',
      cadenceYears: 1,
      firstYearOffset: 1,
      vestingYears: 4,
      cliffMonths: 0,
      vestingFrequency: 'quarterly',
    },
    rsuGrants: [{
      id: 'grant',
      kind: 'hire',
      grantDate: '2026-01-01',
      vestingStartDate: null,
      shareCount: 10,
      sourceAwardId: null,
      sourceAwardRowIds: [],
      symbol: 'ABC',
      rsuSource: null,
      grantValue: null,
      grantPrice: null,
      cliffMonths: 0,
      vestingYears: 4,
      vestingFrequency: 'quarterly',
      vestingSchedule: null,
      vestingEvents: [],
    }],
    optionGrants: [],
    growthBands: { lowPct: 0, mediumPct: 0, highPct: 0 },
  }],
  hypotheticalJobs: [],
}

describe('RsuPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/finance/rsu')
    jest.mocked(fetchWrapper.post).mockResolvedValue({})
  })

  it('renders the focused settlement panel and transaction candidates', async () => {
    window.history.pushState({}, '', '/finance/rsu?settlement_id=9&link=transaction')
    jest.mocked(fetchWrapper.get).mockImplementation((url: string) => {
      if (url === '/api/rsu') return Promise.resolve([focusedAward])
      if (url === '/api/financial-planning/career-comparison/latest') return Promise.resolve({ workflow: null })
      if (url === '/api/rsu/settlements/9/candidates') {
        return Promise.resolve({
          transactions: [{
            id: 42,
            date: '2026-06-01',
            symbol: 'META',
            quantity: -3,
            price: 100,
            amount: 300,
            description: 'Sell-to-cover META',
            confidence: 0.85,
          }],
          payslips: [],
        })
      }

      return Promise.resolve({})
    })

    render(<RsuPage />)

    expect((await screen.findAllByText('Confirmed #9')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Link target: transaction/)).toBeInTheDocument()
    expect(await screen.findByText(/Sell-to-cover META/)).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('Qty -3') && content.includes('Confidence 0.85'))).toBeInTheDocument()
  })

  it('renders virtual refreshers as visually separate projected rows', async () => {
    jest.mocked(fetchWrapper.get).mockImplementation((url: string) => {
      if (url === '/api/rsu') return Promise.resolve([focusedAward])
      if (url === '/api/financial-planning/career-comparison/latest') return Promise.resolve({ workflow: { inputs: careerInputs } })

      return Promise.resolve({})
    })

    render(<RsuPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Actual + virtual current-job refreshers' }))

    await waitFor(() => expect(screen.getAllByText('Virtual refresher projection').length).toBeGreaterThan(0))
    const projectedBadge = screen.getAllByText('Projected')[0]
    const projectedRow = projectedBadge?.closest('tr')
    expect(projectedRow).toHaveClass('bg-muted/30')
    expect(projectedRow).toHaveTextContent('Projected refresher 2027')
  })
})
