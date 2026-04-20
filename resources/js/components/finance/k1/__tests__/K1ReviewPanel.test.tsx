import { render } from '@testing-library/react'
import React from 'react'

import type { FK1StructuredData } from '@/types/finance/k1-data'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...p }: React.ComponentProps<'span'>) => <span {...p}>{children}</span>,
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: (p: Record<string, unknown>) => <input type="checkbox" data-testid={p['data-testid'] as string} />,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (p: React.ComponentProps<'input'>) => <input {...p} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...p }: React.ComponentProps<'label'>) => <label {...p}>{children}</label>,
}))

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (p: React.ComponentProps<'textarea'>) => <textarea {...p} />,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...p }: React.ComponentProps<'td'>) => <td {...p}>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children, ...p }: React.ComponentProps<'tr'>) => <tr {...p}>{children}</tr>,
}))

import K1ReviewPanel from '../K1ReviewPanel'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeData(overrides: Partial<FK1StructuredData> = {}): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: {},
    codes: {},
    ...overrides,
  }
}

// ── Issue 3: Box 6b not double-counted in subtotal ────────────────────────────

describe('K1ReviewPanel — Box 6b not double-counted (Issue 3)', () => {
  it('subtotal excludes 6b (qualified dividends are a subset of 6a)', () => {
    const data = makeData({
      fields: {
        'B': { value: 'Test Fund' },
        '6a': { value: '20000' },
        '6b': { value: '16000' },
      },
    })
    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )
    const text = container.textContent ?? ''
    // The subtotal should be $20,000 (just 6a), NOT $36,000 (6a + 6b)
    expect(text).toContain('20,000')
    expect(text).not.toContain('36,000')
  })

  it('still displays Box 6b as informational sub-line under 6a', () => {
    const data = makeData({
      fields: {
        'B': { value: 'Test Fund' },
        '6a': { value: '20000' },
        '6b': { value: '16000' },
      },
    })
    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )
    const text = container.textContent ?? ''
    // 6b should still be visible somewhere as informational
    expect(text).toContain('6b')
    expect(text).toContain('qualified')
  })
})
