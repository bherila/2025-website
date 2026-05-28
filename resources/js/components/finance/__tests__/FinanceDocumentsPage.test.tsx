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

jest.mock('@/components/finance/TaxDocumentReviewModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div data-testid="tax-review-modal" /> : null,
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
    statement_facet: null,
    tax_facet: null,
    lot_summary: { count: 0 },
    lot_summary_facet: { count: 0 },
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
            form1116_overrides: 0,
            statement_details: 0,
            statement_cash_reports: 0,
            statement_nav: 0,
            statement_performance: 0,
            statement_positions: 0,
            statement_securities_lent: 0,
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

  it('renders statement lineage links from the drawer detail payload', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/finance/documents/42') {
        return Promise.resolve(detail({
          statement_facet: {
            document_id: 42,
            period: { start: '2025-01-01', end: '2025-01-31' },
            linked_accounts: [{
              account_id: 12,
              account: {
                acct_id: 12,
                acct_name: 'Fidelity Taxable',
                acct_number: '1234',
              },
            }],
            balance_snapshots_count: 1,
            imported_transactions_count: 2,
            imported_lots_count: 1,
            parsed_data_needs_review: false,
            parsed_data_warnings: null,
            source_job: null,
            statements: [{
              id: 90,
              acct_id: 12,
              statement_closing_date: '2025-01-31',
              closing_balance: '1000.00',
              imported_transactions_count: 2,
              imported_lots_count: 1,
              account: {
                acct_id: 12,
                acct_name: 'Fidelity Taxable',
                acct_number: '1234',
              },
              source_job: null,
            }],
          },
        }))
      }

      return Promise.resolve(paginated([makeDocument()]))
    })

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('brokerage-statement.pdf')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('brokerage-statement.pdf'))

    await waitFor(() => {
      expect(screen.getByText('Statement lineage')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /Txns/i })).toHaveAttribute(
      'href',
      '/finance/account/12/transactions?source_document_id=42',
    )
    expect(screen.getByRole('link', { name: /Lots/i })).toHaveAttribute(
      'href',
      '/finance/account/12/lots?source_document_id=42&status=all',
    )
  })

  it('opens the tax review modal from the tax facet', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/finance/documents/42') {
        return Promise.resolve(detail({
          document_kind: 'tax_form',
          tax_year: 2025,
          tax_facet: {
            document_id: 42,
            tax_document_id: 7,
            form_type: '1099_b',
            tax_year: 2025,
            review_status: 'needs_review',
            parsing_status: 'parsed',
            is_reviewed: false,
            parsed_data_summary: {
              has_parsed_data: true,
              is_multi_entry: false,
              entry_count: 1,
              top_level_keys: ['transactions'],
              warnings_count: 1,
              needs_review: true,
            },
            account_links: [],
            downstream_effects: {
              linked_lots_count: 3,
              reconciliation_link_counts_by_state: { needs_review: 2 },
            },
            review_document: {
              id: 7,
              user_id: 1,
              tax_year: 2025,
              form_type: '1099_b',
              employment_entity_id: null,
              account_id: 12,
              original_filename: 'tax.pdf',
              stored_filename: 'stored-tax.pdf',
              s3_path: null,
              mime_type: 'application/pdf',
              file_size_bytes: 100,
              file_hash: 'hash',
              is_reviewed: false,
              notes: null,
              human_file_size: '100 bytes',
              download_count: 0,
              genai_job_id: null,
              genai_status: 'parsed',
              parsed_data: null,
              parsed_data_needs_review: true,
              parsed_data_warnings: [{ path: 'parsed_data.transactions', code: 'unsupported_field', message: 'Review' }],
              uploader: null,
              employment_entity: null,
              account: null,
              account_links: [],
              created_at: '2025-02-01',
              updated_at: '2025-02-01',
            },
          },
        }))
      }

      return Promise.resolve(paginated([makeDocument({ document_kind: 'tax_form', tax_year: 2025 })]))
    })

    render(<FinanceDocumentsPage />)

    await waitFor(() => {
      expect(screen.getByText('brokerage-statement.pdf')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('brokerage-statement.pdf'))

    await waitFor(() => {
      expect(screen.getByText('Tax review')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^Review$/ }))

    expect(screen.getByTestId('tax-review-modal')).toBeInTheDocument()
  })
})
