import { render, screen } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import { sampleOpportunityCostProjection } from '../__fixtures__/sampleProjection'
import { DEFAULT_OPPORTUNITY_COST_INPUTS } from '../defaults'
import { OpportunityCostPage } from '../OpportunityCostPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
    patch: jest.fn(),
  },
}))

const mockPost = fetchWrapper.post as jest.Mock

describe('OpportunityCostPage', () => {
  beforeEach(() => {
    mockPost.mockResolvedValue(sampleOpportunityCostProjection)
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
    window.history.replaceState(null, '', '/financial-planning/opportunity-cost')
  })

  it('renders the show-route calculator shell and four result launchers', () => {
    render(<OpportunityCostPage initialData={{ inputs: DEFAULT_OPPORTUNITY_COST_INPUTS, projection: sampleOpportunityCostProjection, authenticated: false }} />)

    expect(screen.getByRole('heading', { name: 'Opportunity Cost Planner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Liquidity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Annual FCF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open LTV Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Vesting' })).toBeInTheDocument()
  })
})
