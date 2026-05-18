import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ClassActionTracker from '@/components/class-action-tracker/ClassActionTracker'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    delete: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

describe('ClassActionTracker', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('loads class action claims through fetchWrapper', async () => {
    mockGet.mockResolvedValue([
      {
        id: 7,
        name: 'Example Settlement',
        notification_received_on: '2026-05-10',
        notification_email_copy: 'Notice copy',
        class_action_url: 'https://example.test/settlement',
        payment_election_submitted_on: '2026-05-12',
        payment_received: true,
        payment_received_on: '2026-05-17',
        payment_fin_transaction_id: 99,
        payment_transaction: {
          t_id: 99,
          account_id: 3,
          account_name: 'Checking',
          date: '2026-05-17',
          amount: 42.5,
          description: 'Class action payment',
          url: '/finance/account/3/transactions',
        },
        notes: 'Selected ACH payment.',
        created_at: '2026-05-17',
        updated_at: '2026-05-17',
      },
    ])

    render(<ClassActionTracker />)

    expect(await screen.findByText('Example Settlement')).toBeInTheDocument()
    expect(screen.getByText('05/10/2026')).toBeInTheDocument()
    expect(screen.getByText('Checking · 05/17/2026 · $42.50')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/class-action-claims')
  })

  it('posts a new class action claim payload', async () => {
    mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mockPost.mockResolvedValue({
      id: 9,
      name: 'New Settlement',
    })

    render(<ClassActionTracker />)

    fireEvent.click(await screen.findByRole('button', { name: /add claim/i }))
    fireEvent.change(screen.getByLabelText('Class Action'), { target: { value: 'New Settlement' } })
    fireEvent.change(screen.getByLabelText('Date Notification Received'), { target: { value: '2026-05-10' } })
    fireEvent.change(screen.getByLabelText('Class Action WWW URL'), { target: { value: 'https://example.test/new' } })
    fireEvent.change(screen.getByLabelText('Copy of Notification Email'), { target: { value: 'Notification copy' } })
    fireEvent.change(screen.getByLabelText('Payment Election Submitted'), { target: { value: '2026-05-11' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Payment received' }))
    fireEvent.change(screen.getByLabelText('Payment Received Date'), { target: { value: '2026-05-17' } })
    fireEvent.change(screen.getByLabelText('Finance Transaction ID'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Additional Notes'), { target: { value: 'ACH selected' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Claim' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/api/class-action-claims', {
      name: 'New Settlement',
      notification_received_on: '2026-05-10',
      notification_email_copy: 'Notification copy',
      class_action_url: 'https://example.test/new',
      payment_election_submitted_on: '2026-05-11',
      payment_received: true,
      payment_received_on: '2026-05-17',
      payment_fin_transaction_id: 123,
      notes: 'ACH selected',
    })
  })
})
