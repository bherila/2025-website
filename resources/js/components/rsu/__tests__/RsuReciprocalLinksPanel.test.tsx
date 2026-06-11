import { render, screen } from '@testing-library/react'

import RsuReciprocalLinksPanel from '@/components/rsu/RsuReciprocalLinksPanel'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/lib/permissions', () => ({
  hasPermission: jest.fn(() => true),
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
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
})
