import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import type { AccountSuggestionResponse } from '@/types/finance/account-suggestion'

import MissingAccountResolver from '../MissingAccountResolver'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPatch = fetchWrapper.patch as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

const link = {
  id: 10,
  document_id: 20,
  tax_document_id: 30,
  account_id: null,
  form_type: '1099_b',
  tax_year: 2024,
  ai_identifier: '1234',
  ai_account_name: 'Vanguard Taxable',
}

function suggestionResponse(overrides: Partial<AccountSuggestionResponse> = {}): AccountSuggestionResponse {
  return {
    hints: {
      document_id: 20,
      link_id: 10,
      tax_document_id: 30,
      form_type: '1099_b',
      tax_year: 2024,
      account_section_label: null,
      ai_identifier: '1234',
      ai_account_name: 'Vanguard Taxable',
      source_filename: 'brokerage.pdf',
      broker: 'Vanguard',
    },
    suggestions: [{
      account: {
        acct_id: 7,
        acct_name: 'Vanguard Brokerage',
        acct_number: '1234',
        when_closed: null,
      },
      score: 100,
      reasons: ['Account number matches'],
      is_closed: false,
    }],
    similar_links: [{
      id: 10,
      document_id: 20,
      tax_document_id: 30,
      account_id: null,
      form_type: '1099_b',
      tax_year: 2024,
      ai_identifier: '1234',
      ai_account_name: 'Vanguard Taxable',
    }],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue(suggestionResponse())
  mockPatch.mockResolvedValue({})
  mockPost.mockResolvedValue({ affected_link_ids: [10], links: [] })
})

describe('MissingAccountResolver', () => {
  it('loads suggestions and assigns the selected account as reviewed', async () => {
    const onResolved = jest.fn()

    render(<MissingAccountResolver link={link} taxDocumentId={30} onResolved={onResolved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/accounts/suggest?document_id=20&link_id=10')
    })
    await waitFor(() => {
      expect(screen.getAllByText('Vanguard Brokerage').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /assign \+ review/i }))

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/api/finance/tax-documents/30/accounts/10', {
        account_id: 7,
        is_reviewed: true,
      })
    })
    expect(onResolved).toHaveBeenCalled()
  })

  it('bulk assigns similar links with explicit confirmation', async () => {
    mockGet.mockResolvedValue(suggestionResponse({
      similar_links: [
        { ...link, id: 10 },
        { ...link, id: 11 },
      ],
    }))

    render(<MissingAccountResolver link={link} taxDocumentId={30} />)

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => {
      expect(screen.getAllByText('Vanguard Brokerage').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /apply to similar/i }))
    expect(await screen.findByText('Apply to similar links?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/finance/tax-documents/30/accounts/bulk-update', {
        links: [
          { link_id: 10, account_id: 7, is_reviewed: true },
          { link_id: 11, account_id: 7, is_reviewed: true },
        ],
      })
    })
  })

  it('shows suggestion load errors in the resolver', async () => {
    mockGet.mockRejectedValue(new Error('Forbidden'))

    render(<MissingAccountResolver link={link} taxDocumentId={30} />)

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /assign \+ review/i })).toBeDisabled()
  })
})
