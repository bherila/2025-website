import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import CadenceTransitionModal from '@/client-management/components/admin/CadenceTransitionModal'
import type { Agreement } from '@/client-management/types/common'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
  },
}))

const mockPost = fetchWrapper.post as jest.Mock

const agreement: Agreement = {
  id: 10,
  client_company_id: 1,
  active_date: '2026-01-01 00:00:00',
  termination_date: null,
  client_company_signed_date: null,
  is_visible_to_client: true,
  monthly_retainer_hours: '10.00',
  catch_up_threshold_hours: '1.00',
  rollover_months: 3,
  hourly_rate: '150.00',
  monthly_retainer_fee: '1000.00',
  billing_cadence: 'quarterly',
  bill_overage_interim: true,
  first_cycle_proration: 'prorate_hours',
}

describe('CadenceTransitionModal', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({
      preview: {
        effective_date: '2026-04-01',
        outgoing_termination_date: '2026-03-31',
        carried_rollover_hours: 4,
        recurring_items_affected: 1,
        successor_terms: {
          billing_cadence: 'monthly',
          monthly_retainer_hours: '10.00',
          monthly_retainer_fee: '1000.00',
          hourly_rate: '150.00',
          rollover_months: 3,
          catch_up_threshold_hours: '1.00',
          bill_overage_interim: false,
          first_cycle_proration: 'prorate_hours',
        },
      },
      successor_agreement: { id: 99 },
    })
  })

  it('loads dry-run preview and posts confirm payload', async () => {
    const onSuccess = jest.fn()

    render(
      <CadenceTransitionModal
        companyId={1}
        agreement={agreement}
        open
        onOpenChange={jest.fn()}
        onSuccess={onSuccess}
      />,
    )

    expect(await screen.findByText('Change cadence')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '3' }))

    expect(await screen.findByText(/Outgoing closes 2026-03-31/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: /confirm transition/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/client/mgmt/companies/1/agreements/10/transition',
        expect.objectContaining({ recurring_item_handling: 'clone' }),
      )
      expect(onSuccess).toHaveBeenCalledWith(99)
    })
  })
})
