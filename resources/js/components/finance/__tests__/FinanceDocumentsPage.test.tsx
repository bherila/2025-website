import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import type { FinanceDocument, FinanceDocumentDetail, PaginatedResponse } from '../documents/types'
import FinanceDocumentsPage from '../FinanceDocumentsPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    delete: jest.fn(),
    get: jest.fn(),
  },
}))

jest.mock('../DocumentImportModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div data-testid="document-import-modal" /> : null,
}))

const mockDelete = fetchWrapper.delete as jest.Mock
const mockGet = fetchWrapper.get as jest.Mock

function makeDocument(overrides: Partial<FinanceDocument> = {}): FinanceDocument {
  return {
    id: 42,
    document_kind: 'statement',
    tax_year: null,
    period_start: '2025-01-01',
    period_end: '2025-01-31',
    original_filename: 'brokerage-statement.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1000,
    human_file_size: '1000 bytes',
    genai_status: 'parsed',
    is_reviewed: false,
    download_count: 0,
    created_at: '2025-02-01',
    updated_at: null,
    accounts: [{
      id: 9,
      account_id: 12,
      document_id: 42,
      statement_id: null,
      form_type: null,
      tax_year: null,
      account_section_label: 'Fallback label',
      payload_kind: 'dispositions',
      ai_identifier: null,
      ai_account_name: null,
      is_reviewed: false,
      account: {
        acct_id: 12,
        acct_name: 'Fidelity Taxable',
        acct_number: '1234',
      },
    }],
    tax_document: null,
    capabilities: ['view_original', 'download_original', 'delete'],
    ...overrides,
  }
}

function detail(overrides: Partial<FinanceDocumentDetail> = {}): FinanceDocumentDetail {
  return {
    ...makeDocument(),
    stored_filename: 'stored.pdf',
    genai_job_id: null,
    parsed_data_needs_review: false,
    parsed_data_warnings: null,
    notes: null,
    statements: [],
    lot_summary: { count: 0 },
    ...overrides,
  }
}

function paginated(data: FinanceDocument[]): PaginatedResponse<FinanceDocument> {
  return {
    data,
    links: {
      first: null,
      last: null,
      next: null,
      prev: null,
    },
    meta: {
      current_page: 1,
      from: data.length > 0 ? 1 : null,
      last_page: 1,
      per_page: 50,
      to: data.length,
      total: data.length,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState({}, '', '/finance/documents')
})

describe('FinanceDocumentsPage', () => {
  it('renders document account sections from the unified documents API', async () => {
    mockGet.mockResolvedValueOnce(paginated([makeDocument()]))

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('brokerage-statement.pdf')).toBeInTheDocument()
    })

    expect(screen.getByText('Fidelity Taxable')).toBeInTheDocument()
    expect(screen.getByText('Statement')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/finance/documents?per_page=50')
  })

  it('passes document kind and advanced filters to the API', async () => {
    mockGet.mockResolvedValue(paginated([]))

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/documents?per_page=50')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tax Forms' }))
    fireEvent.change(screen.getByLabelText('Tax Year'), { target: { value: '2025' } })
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'tax_year_desc' } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/api/finance/documents?document_kind=tax_form&tax_year=2025&sort=tax_year_desc&per_page=50',
      )
    })
  })

  it('opens the unified import modal from the import action', async () => {
    mockGet.mockResolvedValueOnce(paginated([]))

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('No documents found')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    expect(screen.getByTestId('document-import-modal')).toBeInTheDocument()
  })

  it('opens a direct document URL without list data', async () => {
    window.history.replaceState({}, '', '/finance/documents?doc=42')
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/finance/documents/42') {
        return Promise.resolve(detail())
      }

      return Promise.resolve(paginated([]))
    })

    render(<FinanceDocumentsPage />)

    expect(screen.getByText('Document 42')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('brokerage-statement.pdf')).toHaveLength(2)
    })
  })

  it('requires impact preview before deleting a document', async () => {
    mockDelete.mockResolvedValueOnce({ message: 'deleted' })
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/finance/documents/42') {
        return Promise.resolve(detail())
      }

      if (url === '/api/finance/documents/42/impact-preview') {
        return Promise.resolve({
          impact_hash: 'hash-123',
          summary: {
            account_links: 1,
            document_id: 42,
            has_tax_document: false,
            lots: 0,
            statement_details: 0,
            statements: 0,
            transactions: 0,
          },
        })
      }

      return Promise.resolve(paginated([makeDocument()]))
    })

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('brokerage-statement.pdf')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('brokerage-statement.pdf'))

    await waitFor(() => {
      expect(screen.getByText('Delete this document...')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete this document...'))

    await waitFor(() => {
      expect(screen.getByText('1 account link')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/api/finance/documents/42', { impact_hash: 'hash-123' })
    })
  })
})
