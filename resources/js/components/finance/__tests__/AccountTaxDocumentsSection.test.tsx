import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

// --- Mocks ----------------------------------------------------------------

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/TaxDocumentUploadModal', () => ({
  __esModule: true,
  default: ({ open, formType, accountId, onSuccess, onCancel }: {
    open: boolean
    formType: string
    accountId?: number
    onSuccess: () => void
    onCancel: () => void
  }) =>
    open ? (
      <div data-testid="upload-modal">
        <span data-testid="upload-form-type">{formType}</span>
        <span data-testid="upload-account-id">{accountId}</span>
        <button onClick={onSuccess}>Success</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}))

jest.mock('@/components/finance/TaxDocumentReviewModal', () => ({
  __esModule: true,
  default: ({ open, document: doc, onClose, onDocumentReviewed }: {
    open: boolean
    document?: { id: number; original_filename: string | null }
    onClose: () => void
    onDocumentReviewed?: () => void
  }) =>
    open ? (
      <div data-testid="review-modal">
        <span data-testid="review-doc-id">{doc?.id}</span>
        <button onClick={onClose}>Close</button>
        <button onClick={onDocumentReviewed}>Reviewed</button>
      </div>
    ) : null,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, title, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} title={title} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}))

jest.mock('lucide-react', () => ({
  CheckCircle: () => <svg data-testid="check-circle" />,
  Clock: () => <svg data-testid="clock" />,
  Download: () => <svg data-testid="download" />,
  Eye: () => <svg data-testid="eye" />,
  Loader2: () => <svg data-testid="loader" />,
  Trash2: () => <svg data-testid="trash" />,
  Upload: () => <svg data-testid="upload" />,
}))

// --- Helpers ---------------------------------------------------------------

const mockGet = fetchWrapper.get as jest.Mock

function makeDoc(id: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    form_type: '1099_int',
    original_filename: `doc-${id}.pdf`,
    stored_filename: `stored-${id}.pdf`,
    s3_path: `tax_docs/1/stored-${id}.pdf`,
    tax_year: 2024,
    mime_type: 'application/pdf',
    file_size_bytes: 102400,
    file_hash: 'abc',
    is_reviewed: false,
    genai_status: null,
    human_file_size: '100 KB',
    download_count: 0,
    genai_job_id: null,
    parsed_data: null,
    notes: null,
    uploader: null,
    employment_entity: null,
    account: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

let AccountTaxDocumentsSection: React.ComponentType<{ accountId: number; selectedYear?: number }>

beforeAll(async () => {
  const mod = await import('../AccountTaxDocumentsSection')
  AccountTaxDocumentsSection = mod.default as typeof AccountTaxDocumentsSection
})

beforeEach(() => {
  jest.clearAllMocks()
})

// --- Tests -----------------------------------------------------------------

describe('AccountTaxDocumentsSection', () => {
  it('renders upload buttons for each form type', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    // Upload buttons appear for account form types
    expect(screen.getByText('1099-INT')).toBeTruthy()
    expect(screen.getByText('1099-DIV')).toBeTruthy()
    expect(screen.getByText('K-1 / K-3')).toBeTruthy()
  })

  it('fetches documents on mount with correct params', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={42} selectedYear={2024} />)
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('account_id=42'),
      )
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('year=2024'),
      )
    })
  })

  it('renders documents in table after fetch', async () => {
    const doc = makeDoc(1)
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText('doc-1.pdf')).toBeTruthy())
  })

  it('clicking an upload button opens TaxDocumentUploadModal with correct formType and accountId', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={7} selectedYear={2024} />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    // Find an upload button by its label text
    const uploadBtn = screen.getByText('1099-INT')
    fireEvent.click(uploadBtn)

    expect(screen.getByTestId('upload-modal')).toBeTruthy()
    expect(screen.getByTestId('upload-form-type').textContent).toBe('1099_int')
    expect(screen.getByTestId('upload-account-id').textContent).toBe('7')
  })

  it('onSuccess callback closes modal and refreshes document list', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('1099-INT'))
    expect(screen.getByTestId('upload-modal')).toBeTruthy()

    fireEvent.click(screen.getByText('Success'))

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('upload-modal')).toBeNull()
  })

  it('onCancel closes modal without refreshing', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('1099-INT'))
    expect(screen.getByTestId('upload-modal')).toBeTruthy()

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByTestId('upload-modal')).toBeNull()
    // No extra fetch
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('review button opens TaxDocumentReviewModal for the correct document', async () => {
    const doc = makeDoc(99)
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText('doc-99.pdf')).toBeTruthy())

    fireEvent.click(screen.getByTitle('Review document'))

    expect(screen.getByTestId('review-modal')).toBeTruthy()
    expect(screen.getByTestId('review-doc-id').textContent).toBe('99')
  })

  it('onDocumentReviewed closes modal and refreshes document list', async () => {
    const doc = makeDoc(5)
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText('doc-5.pdf')).toBeTruthy())

    fireEvent.click(screen.getByTitle('Review document'))
    expect(screen.getByTestId('review-modal')).toBeTruthy()

    fireEvent.click(screen.getByText('Reviewed'))

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('review-modal')).toBeNull()
  })

  it('shows Processing badge for pending genai_status', async () => {
    const doc = makeDoc(1, { genai_status: 'pending' })
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText('Processing')).toBeTruthy())
  })

  it('shows Reviewed button for reviewed document', async () => {
    const doc = makeDoc(1, { is_reviewed: true, genai_status: null })
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByTitle('Reviewed')).toBeTruthy())
  })

  it('hides download button when s3_path is null', async () => {
    const doc = makeDoc(1, { s3_path: null })
    mockGet.mockResolvedValue([doc])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText('doc-1.pdf')).toBeTruthy())
    expect(screen.queryByTitle('Download')).toBeNull()
  })

  it('shows empty state when no documents', async () => {
    mockGet.mockResolvedValue([])
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)
    await waitFor(() => expect(screen.getByText(/No 1099 documents for 2024/)).toBeTruthy())
  })

  it('registers a 5 s setInterval when a document is in-flight after upload', async () => {
    const doc = makeDoc(1, { genai_status: 'pending' })
    mockGet.mockResolvedValue([doc])

    const spy = jest.spyOn(globalThis, 'setInterval')
    render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000))
    spy.mockRestore()
  })

  it('stops polling once all documents leave in-flight state', async () => {
    const pending = makeDoc(1, { genai_status: 'pending' })
    const parsed = makeDoc(1, { genai_status: null })
    mockGet
      .mockResolvedValueOnce([pending])
      .mockResolvedValue([parsed])

    const clearSpy = jest.spyOn(globalThis, 'clearInterval')
    const { rerender } = render(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)

    // Wait for initial load with pending doc
    await waitFor(() => expect(screen.getByText('Processing')).toBeTruthy())

    // Simulate the poll completing — re-render with parsed doc
    mockGet.mockResolvedValue([parsed])
    rerender(<AccountTaxDocumentsSection accountId={1} selectedYear={2024} />)

    await waitFor(() => expect(clearSpy).toHaveBeenCalled())
    clearSpy.mockRestore()
  })
})
