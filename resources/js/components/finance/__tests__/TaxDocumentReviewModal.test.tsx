import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), postRaw: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/k1', () => ({
  isFK1StructuredData: (d: unknown) =>
    !!(d && typeof d === 'object' && 'schemaVersion' in (d as object)),
  K1ReviewPanel: ({
    data,
    onChange,
  }: {
    data: Record<string, unknown>
    onChange: (d: Record<string, unknown>) => void
  }) => (
    <button
      data-testid="toggle-sbp"
      onClick={() =>
        onChange({
          ...data,
          k3Elections: {
            ...(data.k3Elections as Record<string, unknown>),
            sourcedByPartnerAsUSSource: !(
              (data.k3Elections as Record<string, unknown> | undefined)
                ?.sourcedByPartnerAsUSSource ?? false
            ),
          },
        })
      }
    >
      Toggle SBP
    </button>
  ),
}))

jest.mock('@/finance/1116', () => ({
  isF1116Data: () => false,
  F1116ReviewPanel: () => null,
}))

jest.mock('@/components/finance/ManualJsonAttachModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/finance/PayslipDataSourceModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
  }) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder ?? ''}</option>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}))

import { fetchWrapper } from '@/fetchWrapper'

import TaxDocumentReviewModal from '../TaxDocumentReviewModal'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REVIEWED_K1 = {
  id: 1,
  user_id: 1,
  tax_year: 2024,
  form_type: 'k1',
  employment_entity_id: null,
  account_id: null,
  original_filename: 'K-1.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: 'abc',
  is_reviewed: true,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    k3Elections: { sourcedByPartnerAsUSSource: true },
  },
  uploader: null,
  employment_entity: null,
  account: null,
  account_links: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

const UNREVIEWED_MISC = {
  id: 2,
  user_id: 1,
  tax_year: 2024,
  form_type: '1099_misc',
  employment_entity_id: null,
  account_id: 10,
  original_filename: '1099-misc.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: 'misc',
  is_reviewed: false,
  misc_routing: null,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: {
    payer_name: 'Client LLC',
    box3_other_income: 1200,
  },
  uploader: null,
  employment_entity: null,
  account: null,
  account_links: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

const BROKER_1099 = {
  id: 3,
  user_id: 1,
  tax_year: 2024,
  form_type: 'broker_1099',
  employment_entity_id: null,
  account_id: null,
  original_filename: 'broker.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: 'broker',
  is_reviewed: false,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: [{
    account_identifier: '1234',
    account_name: 'Fidelity',
    form_type: '1099_b',
    tax_year: 2024,
    parsed_data: {
      payer_name: 'Fidelity',
      transactions: [],
    },
  }],
  uploader: null,
  employment_entity: null,
  account: null,
  account_links: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

const BROKER_1099_LINK = {
  id: 33,
  tax_document_id: 3,
  account_id: 10,
  form_type: '1099_b',
  tax_year: 2024,
  ai_identifier: '1234',
  ai_account_name: 'Fidelity',
  is_reviewed: false,
  notes: null,
  misc_routing: null,
  account: { acct_id: 10, acct_name: 'Fidelity Taxable' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    taxYear: 2024,
    document: REVIEWED_K1,
    onClose: jest.fn(),
    onDocumentReviewed: jest.fn(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TaxDocumentReviewModal — SBP election save-while-reviewed', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows amber hint and Save Election button after toggling the SBP checkbox on a confirmed K-1', async () => {
    ;(fetchWrapper.put as jest.Mock).mockResolvedValue({})

    render(<TaxDocumentReviewModal {...(baseProps() as any)} />)

    expect(screen.queryByText('SBP election has unsaved changes')).toBeNull()
    expect(screen.queryByText('Save Election')).toBeNull()

    fireEvent.click(screen.getByTestId('toggle-sbp'))

    expect(screen.getByText('SBP election has unsaved changes')).toBeTruthy()
    expect(screen.getByText('Save Election')).toBeTruthy()
  })

  it('PUTs parsed_data without is_reviewed when Save Election is clicked on a confirmed K-1', async () => {
    ;(fetchWrapper.put as jest.Mock).mockResolvedValue({})

    render(<TaxDocumentReviewModal {...(baseProps() as any)} />)

    fireEvent.click(screen.getByTestId('toggle-sbp'))
    fireEvent.click(screen.getByText('Save Election'))

    await waitFor(() => expect(fetchWrapper.put).toHaveBeenCalledTimes(1))

    const [url, payload] = (fetchWrapper.put as jest.Mock).mock.calls[0] as [string, Record<string, unknown>]

    expect(url).toBe('/api/finance/tax-documents/1')
    expect(payload).not.toHaveProperty('is_reviewed')
    expect(
      (payload.parsed_data as Record<string, unknown> & { k3Elections: { sourcedByPartnerAsUSSource: boolean } })
        ?.k3Elections?.sourcedByPartnerAsUSSource,
    ).toBe(false)
  })
})

describe('TaxDocumentReviewModal — 1099-MISC routing', () => {
  beforeEach(() => jest.clearAllMocks())

  it('includes misc_routing in the save payload for 1099-MISC documents', async () => {
    ;(fetchWrapper.put as jest.Mock).mockResolvedValue({})

    render(<TaxDocumentReviewModal {...(baseProps({ document: UNREVIEWED_MISC }) as any)} />)

    fireEvent.change(screen.getByTestId('mock-select'), { target: { value: 'sch_c' } })
    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => expect(fetchWrapper.put).toHaveBeenCalledTimes(1))

    const [url, payload] = (fetchWrapper.put as jest.Mock).mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/api/finance/tax-documents/2')
    expect(payload.misc_routing).toBe('sch_c')
  })
})

describe('TaxDocumentReviewModal — 1099-B exports', () => {
  it('shows TXF and OLT export actions for 1099-B account-link review', async () => {
    render(<TaxDocumentReviewModal {...(baseProps({
      document: BROKER_1099,
      accountLink: BROKER_1099_LINK,
    }) as any)} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /txf/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /olt xlsx/i })).toBeInTheDocument()
  })
})
