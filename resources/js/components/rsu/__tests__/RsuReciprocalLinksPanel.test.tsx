import { render, screen, waitFor } from '@testing-library/react'

import RsuReciprocalLinksPanel from '@/components/rsu/RsuReciprocalLinksPanel'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

jest.mock('@/lib/permissions', () => ({
  hasPermission: jest.fn(() => true),
}))

describe('RsuReciprocalLinksPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows expected-vs-actual deltas for local payslip RSU values', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([
      {
        id: 1,
        link_type: 'payslip_rsu_income',
        payslip_id: 10,
        settlement: { id: 7, status: 'confirmed', gross_income: '1000.00' },
      },
      {
        id: 2,
        link_type: 'payslip_rsu_excess_refund',
        payslip_id: 10,
        settlement: { id: 7, status: 'confirmed', excess_refund: '25.00' },
      },
    ])

    render(
      <RsuReciprocalLinksPanel
        endpoint="/api/payslips/10/rsu-links"
        localRsuIncome={1200}
        localExcessRefund={20}
      />,
    )

    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/payslips/10/rsu-links'))
    expect(screen.getByText('Actual $1,200.00')).toBeInTheDocument()
    expect(screen.getByText('Expected $1,000.00')).toBeInTheDocument()
    expect(screen.getByText('Delta +$200.00')).toBeInTheDocument()
    expect(screen.getByText('Delta -$5.00')).toBeInTheDocument()
  })
})
