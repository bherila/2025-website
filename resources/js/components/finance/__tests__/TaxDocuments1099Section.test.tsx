import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/MultiAccountImportModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/finance/TaxDocumentReviewModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/finance/TaxDocumentUploadModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    disabled,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    disabled?: boolean
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select aria-label="Reporting mode" disabled={disabled} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, disabled, value }: { children: React.ReactNode; disabled?: boolean; value: string }) => (
    <option value={value} disabled={disabled}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: React.ComponentProps<'td'>) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: React.ComponentProps<'th'>) => <th {...props}>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="alert-triangle" />,
  CheckCircle: () => <svg data-testid="check-circle" />,
  ChevronDown: () => <svg data-testid="chevron-down" />,
  Clock: () => <svg data-testid="clock" />,
  Eye: () => <svg data-testid="eye" />,
  FileText: () => <svg data-testid="file-text" />,
  Loader2: () => <svg data-testid="loader" />,
  Plus: () => <svg data-testid="plus" />,
  Sigma: () => <svg data-testid="sigma" />,
  Upload: () => <svg data-testid="upload" />,
}))

import TaxDocuments1099Section from '../TaxDocuments1099Section'

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

function makeDoc(overrides: Partial<TaxDocument> = {}): TaxDocument {
  return {
    id: 1,
    user_id: 1,
    tax_year: 2025,
    form_type: 'broker_1099',
    employment_entity_id: null,
    account_id: null,
    original_filename: 'statement.pdf',
    stored_filename: 'stored-statement.pdf',
    s3_path: 'tax_docs/1/stored-statement.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1024,
    file_hash: 'hash',
    is_reviewed: false,
    notes: null,
    human_file_size: '1 KB',
    download_count: 0,
    genai_job_id: 12,
    genai_status: 'pending',
    misc_routing: null,
    parsed_data: null,
    uploader: null,
    employment_entity: null,
    account: null,
    account_links: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('TaxDocuments1099Section', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFetchWrapper.patch.mockResolvedValue({})
  })

  it('shows a pending account document in the account row', () => {
    render(
      <TaxDocuments1099Section
        selectedYear={2025}
        documents={[makeDoc({ account_id: 9 })]}
        accounts={[{ acct_id: 9, acct_name: 'fidelity taxable' }]}
        activeAccountIds={[]}
        isLoading={false}
      />,
    )

    expect(screen.getByText('fidelity taxable')).toBeTruthy()
    expect(screen.getByText(/Broker 1099.*Processing/)).toBeTruthy()
    expect(screen.queryByText('Pending imports — awaiting account assignment')).toBeNull()
    expect(screen.getByText('fidelity taxable').closest('table')?.parentElement).toHaveClass('border-muted')
  })

  it('shows and persists the 1099-B reporting mode for account links', async () => {
    const onDocumentsReload = jest.fn().mockResolvedValue(undefined)
    const doc = makeDoc({
      id: 22,
      tax_year: 2025,
      form_type: 'broker_1099',
      is_reviewed: true,
      genai_status: 'parsed',
      parsed_data: [{
        account_identifier: 'acct-7209',
        account_name: 'E*TRADE',
        form_type: '1099_b',
        tax_year: 2025,
        parsed_data: {
          transactions: [
            {
              symbol: 'NVDA',
              proceeds: 1000,
              cost_basis: 1500,
              realized_gain_loss: -500,
              wash_sale_disallowed: 200,
              is_short_term: true,
              is_covered: true,
              form_8949_box: 'A',
            },
          ],
        },
      }],
      account_links: [{
        id: 77,
        tax_document_id: 22,
        account_id: 9,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: 'acct-7209',
        ai_account_name: 'E*TRADE',
        is_reviewed: true,
        notes: null,
        reporting_mode: null,
        account: { acct_id: 9, acct_name: 'fidelity taxable' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }],
    })

    render(
      <TaxDocuments1099Section
        selectedYear={2025}
        documents={[doc]}
        accounts={[{ acct_id: 9, acct_name: 'fidelity taxable' }]}
        activeAccountIds={[]}
        isLoading={false}
        onDocumentsReload={onDocumentsReload}
      />,
    )

    const select = screen.getByLabelText('Reporting mode') as HTMLSelectElement
    expect(select.value).toBe('form_8949_transactions')
    expect(screen.getByText('Schedule D summary unavailable')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'form_8949_summary' } })

    await waitFor(() => {
      expect(mockedFetchWrapper.patch).toHaveBeenCalledWith('/api/finance/tax-documents/22/accounts/77', {
        reporting_mode: 'form_8949_summary',
      })
    })
    expect(onDocumentsReload).toHaveBeenCalled()
  })

  it('shows the effective reporting mode when the persisted mode is no longer eligible', () => {
    const doc = makeDoc({
      id: 23,
      tax_year: 2025,
      form_type: 'broker_1099',
      is_reviewed: true,
      genai_status: 'parsed',
      parsed_data: [{
        account_identifier: 'acct-7209',
        account_name: 'E*TRADE',
        form_type: '1099_b',
        tax_year: 2025,
        parsed_data: {
          transactions: [
            {
              symbol: 'NVDA',
              proceeds: 1000,
              cost_basis: 1500,
              realized_gain_loss: -500,
              wash_sale_disallowed: 200,
              is_short_term: true,
              is_covered: true,
              form_8949_box: 'A',
            },
          ],
        },
      }],
      account_links: [{
        id: 78,
        tax_document_id: 23,
        account_id: 9,
        form_type: '1099_b',
        tax_year: 2025,
        ai_identifier: 'acct-7209',
        ai_account_name: 'E*TRADE',
        is_reviewed: true,
        notes: null,
        reporting_mode: 'schedule_d_summary',
        account: { acct_id: 9, acct_name: 'fidelity taxable' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }],
    })

    render(
      <TaxDocuments1099Section
        selectedYear={2025}
        documents={[doc]}
        accounts={[{ acct_id: 9, acct_name: 'fidelity taxable' }]}
        activeAccountIds={[]}
        isLoading={false}
      />,
    )

    const select = screen.getByLabelText('Reporting mode') as HTMLSelectElement
    expect(select.value).toBe('form_8949_transactions')
  })
})
