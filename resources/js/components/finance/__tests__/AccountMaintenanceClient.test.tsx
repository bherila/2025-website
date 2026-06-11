import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import AccountMaintenanceClient from '../AccountMaintenanceClient'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

import { fetchWrapper } from '@/fetchWrapper'

const post = fetchWrapper.post as jest.Mock

describe('AccountMaintenanceClient', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({})
  })

  it('renders the account number field seeded from the prop', () => {
    render(<AccountMaintenanceClient accountId={7} accountName="Brokerage" whenClosed={null} acctNumber="1234" />)

    expect(screen.getByLabelText('Account number (or last 4)')).toHaveValue('1234')
  })

  it('updates the account number via the update-flags endpoint', async () => {
    render(<AccountMaintenanceClient accountId={7} accountName="Brokerage" whenClosed={null} acctNumber={null} />)

    fireEvent.change(screen.getByLabelText('Account number (or last 4)'), { target: { value: '5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Account Number' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/finance/7/update-flags', { acctNumber: '5678' })
    })
    expect(await screen.findByText('Account number saved.')).toBeInTheDocument()
  })

  it('sends null when the account number is cleared', async () => {
    render(<AccountMaintenanceClient accountId={7} accountName="Brokerage" whenClosed={null} acctNumber="1234" />)

    fireEvent.change(screen.getByLabelText('Account number (or last 4)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Account Number' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/finance/7/update-flags', { acctNumber: null })
    })
  })
})
