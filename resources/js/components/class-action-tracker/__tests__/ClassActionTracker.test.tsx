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
const mockPut = fetchWrapper.put as jest.Mock

describe('ClassActionTracker', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  it('loads class action claims through fetchWrapper', async () => {
    mockGet.mockResolvedValue([
      {
        id: 7,
        name: 'Example Settlement',
        claim_id: 'ABC123',
        pin: 'PIN42',
        administrator: 'A.B. Data, Ltd.',
        defendant: 'Google LLC',
        notification_received_on: '2026-05-10',
        notification_email_copy: 'Notice copy',
        class_action_url: 'https://example.test/settlement',
        payment_election_submitted_on: '2026-05-12',
        claim_submitted_on: null,
        claim_deadline: '2026-08-27',
        final_approval_hearing_on: '2026-09-01',
        expected_payment_amount: 42.5,
        expected_payment_on: '2026-10-01',
        actual_payment_amount: 42.5,
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
    expect(screen.getByText('ID: ABC123')).toBeInTheDocument()
    expect(screen.getByText('05/10/2026')).toBeInTheDocument()
    expect(screen.getByText('08/27/2026')).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Claim ID / Unique ID'), { target: { value: 'UNIQUE123' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: 'PIN999' } })
    fireEvent.change(screen.getByLabelText('Administrator'), { target: { value: 'Epiq' } })
    fireEvent.change(screen.getByLabelText('Defendant'), { target: { value: 'Example Corp' } })
    fireEvent.change(screen.getByLabelText('Date Notification Received'), { target: { value: '2026-05-10' } })
    fireEvent.change(screen.getByLabelText('Class Action WWW URL'), { target: { value: 'https://example.test/new' } })
    fireEvent.change(screen.getByLabelText('Copy of Notification Email'), { target: { value: 'Notification copy' } })
    fireEvent.change(screen.getByLabelText('Payment Election Submitted'), { target: { value: '2026-05-11' } })
    fireEvent.change(screen.getByLabelText('Claim Submitted On'), { target: { value: '2026-05-12' } })
    fireEvent.change(screen.getByLabelText('Claim Deadline'), { target: { value: '2026-08-27' } })
    fireEvent.change(screen.getByLabelText('Final Approval Hearing'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Expected Payment On'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Expected Payment Amount'), { target: { value: '125.55' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Payment received' }))
    fireEvent.change(screen.getByLabelText('Payment Received Date'), { target: { value: '2026-05-17' } })
    fireEvent.change(screen.getByLabelText('Actual Payment Amount'), { target: { value: '120.25' } })
    fireEvent.change(screen.getByLabelText('Finance Transaction ID'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Additional Notes'), { target: { value: 'ACH selected' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Claim' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/api/class-action-claims', {
      name: 'New Settlement',
      claim_id: 'UNIQUE123',
      pin: 'PIN999',
      administrator: 'Epiq',
      defendant: 'Example Corp',
      notification_received_on: '2026-05-10',
      notification_email_copy: 'Notification copy',
      class_action_url: 'https://example.test/new',
      payment_election_submitted_on: '2026-05-11',
      claim_submitted_on: '2026-05-12',
      claim_deadline: '2026-08-27',
      final_approval_hearing_on: '2026-09-01',
      expected_payment_amount: 125.55,
      expected_payment_on: '2026-10-01',
      actual_payment_amount: 120.25,
      payment_received: true,
      payment_received_on: '2026-05-17',
      payment_fin_transaction_id: 123,
      notes: 'ACH selected',
    })
  })

  it('imports from email and applies selected fields into the edit form', async () => {
    const claimsResponse = [
      {
        id: 11,
        name: 'Google Assistant Privacy Settlement',
        claim_id: 'OLD123',
        pin: null,
        administrator: 'A.B. Data, Ltd.',
        defendant: null,
        notification_received_on: null,
        notification_email_copy: null,
        class_action_url: null,
        payment_election_submitted_on: null,
        claim_submitted_on: null,
        claim_deadline: null,
        final_approval_hearing_on: null,
        expected_payment_amount: null,
        expected_payment_on: null,
        actual_payment_amount: null,
        payment_received: false,
        payment_received_on: null,
        payment_fin_transaction_id: null,
        payment_transaction: null,
        notes: null,
        created_at: null,
        updated_at: null,
      },
    ]

    mockPost.mockResolvedValueOnce({ job_id: 55, status: 'pending' })
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/class-action-claims') {
        return Promise.resolve(claimsResponse)
      }

      if (url === '/api/genai/import/jobs/55') {
        return Promise.resolve({
          id: 55,
          status: 'parsed',
          error_message: null,
        results: [{
          result_json: JSON.stringify({
            name: 'Google Assistant Privacy Settlement',
            claim_id: '3GHJCKGF',
            pin: 'JRXCXP',
            administrator: 'A.B. Data, Ltd.',
            defendant: 'Google LLC',
              claim_deadline: '2026-08-27',
            }),
          }],
        })
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<ClassActionTracker />)

    fireEvent.click(await screen.findByRole('button', { name: /import from email/i }))
    fireEvent.change(screen.getByLabelText('Notification email text'), { target: { value: 'Unique ID 3GHJCKGF PIN JRXCXP' } })
    fireEvent.click(screen.getByRole('button', { name: /extract claim/i }))

    await screen.findByText('Review extracted claim details')
    fireEvent.click(screen.getByRole('button', { name: /apply to form/i }))

    expect(await screen.findByDisplayValue('3GHJCKGF')).toBeInTheDocument()
    expect(screen.getByDisplayValue('JRXCXP')).toBeInTheDocument()
  })
})
