import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import FinanceDocumentsPage from '../FinanceDocumentsPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

jest.mock('../DocumentImportModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div data-testid="document-import-modal" /> : null,
}))

const mockGet = fetchWrapper.get as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('FinanceDocumentsPage', () => {
  it('renders document account sections from the unified documents API', async () => {
    mockGet.mockResolvedValueOnce([{
      id: 42,
      document_kind: 'statement',
      tax_year: null,
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      original_filename: 'brokerage-statement.pdf',
      mime_type: 'application/pdf',
      genai_status: 'parsed',
      created_at: '2025-02-01',
      accounts: [{
        id: 9,
        account_id: 12,
        form_type: null,
        tax_year: null,
        account_section_label: 'Fallback label',
        payload_kind: 'dispositions',
        account: {
          acct_id: 12,
          acct_name: 'Fidelity Taxable',
          acct_number: '1234',
        },
      }],
      tax_document: null,
    }])

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('brokerage-statement.pdf')).toBeInTheDocument()
    })

    expect(screen.getByText('Fidelity Taxable')).toBeInTheDocument()
    expect(screen.getByText('Statement')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/finance/documents')
  })

  it('passes the active document kind to the API', async () => {
    mockGet
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/documents')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tax Forms' }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/documents?document_kind=tax_form')
    })
  })

  it('opens the unified import modal from the import action', async () => {
    mockGet.mockResolvedValueOnce([])

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('No documents found')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    expect(screen.getByTestId('document-import-modal')).toBeInTheDocument()
  })
})
