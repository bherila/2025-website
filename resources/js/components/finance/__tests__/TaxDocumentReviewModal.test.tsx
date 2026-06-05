import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn(), postRaw: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/k1', () => ({
  isFK1StructuredData: (d: unknown) =>
    !!(d && typeof d === 'object' && 'schemaVersion' in (d as object)),
  K1ReviewPanel: ({
    data,
    onChange,
    focusFieldId,
  }: {
    data: Record<string, unknown>
    onChange: (d: Record<string, unknown>) => void
    focusFieldId?: string
  }) => (
    <div>
      {focusFieldId ? <div data-testid="focused-source-target" data-tax-source-field-id={focusFieldId} /> : null}
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
      <button
        data-testid="toggle-material-participation"
        onClick={() =>
          onChange({
            ...data,
            sourceValueOverrides: {
              ...((data.sourceValueOverrides as Record<string, unknown> | undefined) ?? {}),
              'k1:material-participation': {
                value: 'true',
                originalValue: null,
                label: 'Material participation in securities-trading activity',
              },
            },
          })
        }
      >
        Toggle material participation
      </button>
    </div>
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

const UNREVIEWED_1099_R = {
  id: 5,
  user_id: 1,
  tax_year: 2024,
  form_type: '1099_r',
  employment_entity_id: null,
  account_id: 10,
  original_filename: '1099-r.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: '1099r',
  is_reviewed: false,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: {
    payer_name: 'IRA Custodian',
    box1_gross_distribution: 50000,
    box2a_taxable_amount: 0,
    box4_fed_tax: 0,
    box7_distribution_code: 'G',
    box7_ira_sep_simple: true,
  },
  uploader: null,
  employment_entity: null,
  account: { acct_id: 10, acct_name: 'Rollover IRA' },
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

const LEGACY_FLAT_BROKER_1099 = {
  ...BROKER_1099,
  id: 6,
  is_reviewed: true,
  parsed_data: {
    payer_name: 'National Financial Services LLC',
    account_number: '637-768451',
    b_total_proceeds: 1000,
    b_total_cost: 800,
    b_total_gain_loss: 200,
  },
} as const

const LEGACY_FLAT_BROKER_1099_LINK = {
  ...BROKER_1099_LINK,
  id: 66,
  tax_document_id: 6,
  ai_identifier: '637-768451',
  ai_account_name: 'fidelity sma',
  is_reviewed: true,
} as const

const WEALTHFRONT_1099_DIV = {
  id: 4,
  user_id: 1,
  tax_year: 2024,
  form_type: 'broker_1099',
  employment_entity_id: null,
  account_id: null,
  original_filename: 'wealthfront.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: 'wealthfront',
  is_reviewed: false,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: [{
    account_identifier: '8W14FLFF',
    account_name: 'Wealthfront Brokerage LLC',
    form_type: '1099_div',
    tax_year: 2024,
    parsed_data: {
      payer_tin: '27-1967207',
      recipient_tin: 'XXX-XX-9913',
      box1a_ordinary: 1816.11,
      box1b_qualified: 1732.51,
      box2a_cap_gain: 8.15,
      box7_foreign_tax: 10.45,
      box8_foreign_country: 'See detail',
      detail_totals: {
        total_dividends_and_distributions: 1834.58,
      },
      foreign_income_and_taxes_summary: {
        total_foreign_source_income: 42.56,
      },
    },
  }],
  uploader: null,
  employment_entity: null,
  account: null,
  account_links: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

const WEALTHFRONT_1099_DIV_LINK = {
  id: 44,
  tax_document_id: 4,
  account_id: 10,
  form_type: '1099_div',
  tax_year: 2024,
  ai_identifier: '8W14FLFF',
  ai_account_name: 'Wealthfront Brokerage LLC',
  is_reviewed: false,
  notes: null,
  misc_routing: null,
  account: { acct_id: 10, acct_name: 'Wealthfront S&P500 FLFF' },
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

describe('TaxDocumentReviewModal — source field focus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('scrolls to and highlights the requested K-1 source field', () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    render(
      <TaxDocumentReviewModal
        {...(baseProps({ focusFieldId: 'k1-field-5' }) as unknown as React.ComponentProps<typeof TaxDocumentReviewModal>)}
      />,
    )

    act(() => {
      jest.advanceTimersByTime(200)
    })

    const target = screen.getByTestId('focused-source-target')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(target).toHaveClass('scroll-highlight-flash')

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(target).not.toHaveClass('scroll-highlight-flash')
  })
})

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

    expect(url).toBe('/api/finance/tax-documents/1?include_tax_facts=1')
    expect(payload).not.toHaveProperty('is_reviewed')
    expect(
      (payload.parsed_data as Record<string, unknown> & { k3Elections: { sourcedByPartnerAsUSSource: boolean } })
        ?.k3Elections?.sourcedByPartnerAsUSSource,
    ).toBe(false)
  })
})

describe('TaxDocumentReviewModal — material participation save-while-reviewed', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows Save Election after toggling material participation on a confirmed K-1', () => {
    render(<TaxDocumentReviewModal {...(baseProps() as any)} />)

    expect(screen.queryByText('Material participation has unsaved changes')).toBeNull()
    expect(screen.queryByText('Save Election')).toBeNull()

    fireEvent.click(screen.getByTestId('toggle-material-participation'))

    expect(screen.getByText('Material participation has unsaved changes')).toBeTruthy()
    expect(screen.getByText('Save Election')).toBeTruthy()
  })

  it('PUTs the material-participation override without is_reviewed for a confirmed K-1', async () => {
    ;(fetchWrapper.put as jest.Mock).mockResolvedValue({})

    render(<TaxDocumentReviewModal {...(baseProps() as any)} />)

    fireEvent.click(screen.getByTestId('toggle-material-participation'))
    fireEvent.click(screen.getByText('Save Election'))

    await waitFor(() => expect(fetchWrapper.put).toHaveBeenCalledTimes(1))

    const [url, payload] = (fetchWrapper.put as jest.Mock).mock.calls[0] as [string, Record<string, unknown>]
    const parsedData = payload.parsed_data as Record<string, unknown> & {
      sourceValueOverrides?: Record<string, { value: string }>
    }

    expect(url).toBe('/api/finance/tax-documents/1?include_tax_facts=1')
    expect(payload).not.toHaveProperty('is_reviewed')
    expect(parsedData.sourceValueOverrides?.['k1:material-participation']?.value).toBe('true')
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
    expect(url).toBe('/api/finance/tax-documents/2?include_tax_facts=1')
    expect(payload.misc_routing).toBe('sch_c')
  })
})

describe('TaxDocumentReviewModal — 1099-R review data', () => {
  it('renders 1099-R distribution boxes in the review panel', async () => {
    render(<TaxDocumentReviewModal {...(baseProps({ document: UNREVIEWED_1099_R }) as any)} />)

    expect(await screen.findByText('IRA Custodian — 1099-R Review')).toBeInTheDocument()
    expect(screen.getByText('Gross distribution')).toBeInTheDocument()
    expect(screen.getByText('$50,000')).toBeInTheDocument()
    expect(screen.getByText('Taxable amount')).toBeInTheDocument()
    expect(screen.getByText('Distribution code(s)')).toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
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

describe('TaxDocumentReviewModal — broker 1099 review data', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders canonical 1099-DIV boxes and supporting totals in the review panel', async () => {
    render(<TaxDocumentReviewModal {...(baseProps({
      document: WEALTHFRONT_1099_DIV,
      accountLink: WEALTHFRONT_1099_DIV_LINK,
    }) as any)} />)

    expect(await screen.findByText('Total ordinary dividends')).toBeInTheDocument()
    expect(screen.getByText('$1,816')).toBeInTheDocument()
    expect(screen.getByText('Qualified dividends')).toBeInTheDocument()
    expect(screen.getByText('See detail')).toBeInTheDocument()
    expect(screen.getByText('Detail Totals')).toBeInTheDocument()
    expect(screen.getByText('Foreign Income and Taxes')).toBeInTheDocument()
  })

  it('warns for legacy flat broker data and offers conversion actions', async () => {
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({
      document: {
        ...LEGACY_FLAT_BROKER_1099,
        parsed_data: [{
          account_identifier: '637-768451',
          account_name: 'fidelity sma',
          form_type: '1099_b',
          tax_year: 2024,
          parsed_data: {
            total_proceeds: 1000,
            total_cost_basis: 800,
            total_realized_gain_loss: 200,
            transactions: [],
          },
        }],
      },
    })

    render(<TaxDocumentReviewModal {...(baseProps({
      document: LEGACY_FLAT_BROKER_1099,
      accountLink: LEGACY_FLAT_BROKER_1099_LINK,
    }) as any)} />)

    expect(await screen.findByText('This consolidated 1099 is stored in a legacy flat format.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /repair with ai/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue pdf re-extraction/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /convert stored data/i }))

    await waitFor(() => expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/tax-documents/6/convert-broker-format?include_tax_facts=1', {}))
  })

  it('queues AI repair from stored legacy broker data', async () => {
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({
      ...LEGACY_FLAT_BROKER_1099,
      genai_status: 'pending',
      is_reviewed: false,
    })

    render(<TaxDocumentReviewModal {...(baseProps({
      document: LEGACY_FLAT_BROKER_1099,
      accountLink: LEGACY_FLAT_BROKER_1099_LINK,
    }) as any)} />)

    fireEvent.click(await screen.findByRole('button', { name: /repair with ai/i }))

    await waitFor(() => expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/tax-documents/6/repair-format', {}))
  })
})
