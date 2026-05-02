import { render, screen } from '@testing-library/react'
import type React from 'react'

import type { TaxDocument } from '@/types/finance/tax-document'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
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
  })
})
