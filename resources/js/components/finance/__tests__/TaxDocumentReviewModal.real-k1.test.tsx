import { act, render } from '@testing-library/react'
import React from 'react'

import { k1FieldSourceFieldId, taxSourceFieldSelector } from '@/lib/finance/taxSourceFieldIds'

import TaxDocumentReviewModal from '../TaxDocumentReviewModal'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn(), postRaw: jest.fn() },
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

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

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.ComponentProps<'span'>) => <span {...props}>{children}</span>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, type = 'button', variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type={type} {...props}>{children}</button>
  ),
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked = false, onCheckedChange, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { checked?: boolean | 'indeterminate'; onCheckedChange?: (checked: boolean) => void }) => (
    <input
      {...props}
      type="checkbox"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: React.ComponentProps<'td'>) => <td {...props}>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children, ...props }: React.ComponentProps<'tr'>) => <tr {...props}>{children}</tr>,
}))

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const REVIEWED_K1 = {
  id: 10,
  user_id: 1,
  tax_year: 2025,
  form_type: 'k1',
  employment_entity_id: null,
  account_id: null,
  original_filename: 'k1.pdf',
  stored_filename: null,
  s3_path: null,
  mime_type: 'application/pdf',
  file_size_bytes: 1000,
  file_hash: 'k1',
  is_reviewed: true,
  notes: null,
  human_file_size: '1 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  parsed_data: {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {
      B: { value: 'Source Partnership' },
      '5': { value: '1000' },
    },
    codes: {},
  },
  uploader: null,
  employment_entity: null,
  account: null,
  account_links: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const

describe('TaxDocumentReviewModal real K-1 source focus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('scrolls to and highlights a real rendered K-1 review row', () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const focusFieldId = k1FieldSourceFieldId('5')
    const document = REVIEWED_K1 as unknown as NonNullable<React.ComponentProps<typeof TaxDocumentReviewModal>['document']>
    const { container } = render(
      <TaxDocumentReviewModal
        open
        taxYear={2025}
        document={document}
        onClose={jest.fn()}
        onDocumentReviewed={jest.fn()}
        focusFieldId={focusFieldId}
      />,
    )

    act(() => {
      jest.advanceTimersByTime(200)
    })

    const target = container.querySelector(taxSourceFieldSelector(focusFieldId))
    expect(target).not.toBeNull()
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(target).toHaveClass('scroll-highlight-flash')
  })
})
