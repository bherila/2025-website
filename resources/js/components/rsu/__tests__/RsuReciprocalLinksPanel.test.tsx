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

  it('renders local payslip rows and fetched settlement links', async () => {
    jest.mocked(fetchWrapper.get).mockResolvedValue([{
      id: 1,
      link_type: 'payslip_rsu_income',
      payslip_id: 42,
      status: 'confirmed',
      settlement: {
        id: 9,
        status: 'confirmed',
        gross_income: '1000.0000',
        withheld_value: '300.0000',
        actual_tax_remitted: '275.0000',
        excess_refund: '25.0000',
      },
    }])

    render(
      <RsuReciprocalLinksPanel
        endpoint="/api/payslips/42/rsu-links"
        localRsuIncome={1000}
        localTaxOffset={300}
        localExcessRefund={25}
      />,
    )

    expect(await screen.findByText('Payslip Rsu Income')).toBeInTheDocument()
    expect(screen.getByText('Confirmed #9')).toBeInTheDocument()
    expect(screen.getByText('Payslip RSU income')).toBeInTheDocument()
    expect(screen.getByText('Payslip RSU tax offset')).toBeInTheDocument()
    expect(screen.getByText('Payslip excess refund')).toBeInTheDocument()
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$300.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$25.00').length).toBeGreaterThan(0)
  })

  it('shows expected-vs-actual deltas for local payslip RSU values', async () => {
    jest.mocked(fetchWrapper.get).mockResolvedValue([
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
