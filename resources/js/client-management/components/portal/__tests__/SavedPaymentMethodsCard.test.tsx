import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import SavedPaymentMethodsCard from '@/client-management/components/portal/SavedPaymentMethodsCard'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    delete: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockDelete = fetchWrapper.delete as jest.Mock
const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

const savedCard = {
  id: 7,
  type: 'card',
  brand: 'visa',
  last4: '4242',
  exp_month: 12,
  exp_year: 2031,
  bank_name: null,
  is_default: false,
  created_at: '2026-05-01T00:00:00Z',
}

describe('SavedPaymentMethodsCard', () => {
  beforeEach(() => {
    mockDelete.mockReset()
    mockGet.mockReset()
    mockPost.mockReset()
    jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sets a saved method as default', async () => {
    mockGet
      .mockResolvedValueOnce({ payment_methods: [savedCard] })
      .mockResolvedValueOnce({ payment_methods: [{ ...savedCard, is_default: true }] })
    mockPost.mockResolvedValue({})

    render(<SavedPaymentMethodsCard companyId={20} publishableKey="pk_test_local" />)

    fireEvent.click(await screen.findByRole('button', { name: /set as default/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/client/portal/companies/20/payment-methods/7/default', {})
    })
  })

  it('confirms before removing a saved method', async () => {
    mockGet
      .mockResolvedValueOnce({ payment_methods: [savedCard] })
      .mockResolvedValueOnce({ payment_methods: [] })
    mockDelete.mockResolvedValue({})

    render(<SavedPaymentMethodsCard companyId={20} publishableKey="pk_test_local" />)

    fireEvent.click(await screen.findByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('Remove this saved payment method?')
      expect(mockDelete).toHaveBeenCalledWith('/api/client/portal/companies/20/payment-methods/7', {})
    })
  })
})
