import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import {
  k1CodeSourceFieldId,
  k1FieldSourceFieldId,
  k3ForeignTaxTotalSourceFieldId,
  k3Part2Section1SourceFieldId,
  k3Part2Section2SourceFieldId,
  k3Part3CountrySourceFieldId,
  k3Part3Section2SourceFieldId,
  taxSourceFieldSelector,
} from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData, K1CodeItem } from '@/types/finance/k1-data'

import K1CodesModal from '../K1CodesModal'
import K1ReviewPanel from '../K1ReviewPanel'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...p }: React.ComponentProps<'span'>) => <span {...p}>{children}</span>,
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked = false, onCheckedChange, ...props }: MockCheckboxProps) => (
    <input
      {...props}
      type="checkbox"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, type = 'button', variant: _variant, size: _size, ...props }: MockButtonProps) => (
    <button type={type} {...props}>{children}</button>
  ),
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
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

interface MockButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: string
  variant?: string
}

interface MockCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange'> {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
}

function ControlledK1ReviewPanel({ initialData }: { initialData: FK1StructuredData }): React.ReactElement {
  const [currentData, setCurrentData] = React.useState(initialData)

  return (
    <>
      <K1ReviewPanel data={currentData} onChange={setCurrentData} />
      <output data-testid="k1-data">{JSON.stringify(currentData)}</output>
    </>
  )
}

function readPanelData(): FK1StructuredData {
  return JSON.parse(screen.getByTestId('k1-data').textContent ?? '{}') as FK1StructuredData
}

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

describe('K1ReviewPanel — sourced-by-partner default', () => {
  it('normalizes unset SBP election state for K-3 sub-table labels', () => {
    const data = makeData({
      fields: { B: { value: 'Test Fund' } },
      k3: {
        sections: [
          {
            sectionId: 'part2_section2',
            title: 'K-3 Part II Section 2',
            data: {
              rows: [
                {
                  line: '55',
                  col_c_passive: 100,
                  col_f_sourced_by_partner: 25,
                  col_g_total: 125,
                },
              ],
            },
          },
        ],
      },
    })

    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )

    expect(container.textContent).toContain('Sourced by Partner → US (f)')
  })

  it('keeps K-3 sub-table labels inactive only when SBP is explicitly false', () => {
    const data = makeData({
      fields: { B: { value: 'Test Fund' } },
      k3Elections: { sourcedByPartnerAsUSSource: false },
      k3: {
        sections: [
          {
            sectionId: 'part2_section2',
            title: 'K-3 Part II Section 2',
            data: {
              rows: [
                {
                  line: '55',
                  col_c_passive: 100,
                  col_f_sourced_by_partner: 25,
                  col_g_total: 125,
                },
              ],
            },
          },
        ],
      },
    })

    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )

    expect(container.textContent).not.toContain('Sourced by Partner → US (f)')
    expect(container.textContent).toContain('Sourced by Partner (f)')
  })
})

describe('K1ReviewPanel — source field targets', () => {
  it('opens a focused entity section and marks K-1/K-3 source rows', () => {
    const data = makeData({
      fields: {
        B: { value: 'Source Partnership' },
        '5': { value: '1000' },
      },
      k3: {
        sections: [
          {
            sectionId: 'part2_section2',
            title: 'K-3 Part II Section 2',
            data: {
              rows: [
                {
                  line: '55',
                  col_c_passive: 100,
                  col_f_sourced_by_partner: 25,
                  col_g_total: 125,
                },
              ],
            },
          },
          {
            sectionId: 'part3_section4',
            title: 'K-3 Part III Section 4',
            data: {
              countries: [{ country: 'Ireland', amount_usd: 42 }],
            },
          },
        ],
      },
    })

    const { container } = render(
      <K1ReviewPanel
        data={data}
        onChange={() => {}}
        readOnly
        focusFieldId={k1FieldSourceFieldId('B')}
      />,
    )

    expect(container.querySelector(taxSourceFieldSelector(k1FieldSourceFieldId('B')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k1FieldSourceFieldId('5')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k3Part2Section2SourceFieldId('55')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k3Part3CountrySourceFieldId('Ireland')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k3ForeignTaxTotalSourceFieldId()))).not.toBeNull()
  })

  it('marks per-code K-1 rows when coded boxes contain multiple codes', () => {
    const data = makeData({
      fields: {
        B: { value: 'Source Partnership' },
      },
      codes: {
        '11': [{ code: 'A', value: '100' }, { code: 'B', value: '200' }],
        '13': [{ code: 'H', value: '300' }, { code: 'L', value: '400' }],
        '14': [{ code: 'A', value: '500' }, { code: 'B', value: '600' }],
        '17': [{ code: 'A', value: '700' }, { code: 'B', value: '800' }],
        '20': [{ code: 'A', value: '900' }, { code: 'Z', value: 'STMT' }],
      },
    })

    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )

    expect(container.querySelector(taxSourceFieldSelector(k1CodeSourceFieldId('11', 'A')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k1CodeSourceFieldId('13', 'H')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k1CodeSourceFieldId('14', 'A')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k1CodeSourceFieldId('17', 'B')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k1CodeSourceFieldId('20', 'Z')))).not.toBeNull()
  })

  it('uses distinct K-3 source targets for rows sharing a line number across sections', () => {
    const data = makeData({
      fields: { B: { value: 'Source Partnership' } },
      k3: {
        sections: [
          {
            sectionId: 'part2_section1',
            title: 'K-3 Part II Section 1',
            data: {
              line24_totalGrossIncome: {
                totals: { c: 100, f: 25, g: 125 },
              },
            },
          },
          {
            sectionId: 'part2_section2',
            title: 'K-3 Part II Section 2',
            data: {
              rows: [
                {
                  line: '24',
                  col_c_passive: 200,
                  col_f_sourced_by_partner: 50,
                  col_g_total: 250,
                },
              ],
            },
          },
          {
            sectionId: 'part3_section2',
            title: 'K-3 Part III Section 2',
            data: {
              rows: [
                {
                  line: '24',
                  col_c_passive: 300,
                  col_f_sourced_by_partner: 75,
                  col_g_total: 375,
                },
              ],
            },
          },
        ],
      },
    })

    const { container } = render(
      <K1ReviewPanel data={data} onChange={() => {}} readOnly />,
    )

    expect(container.querySelector(taxSourceFieldSelector(k3Part2Section1SourceFieldId('24')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k3Part2Section2SourceFieldId('24')))).not.toBeNull()
    expect(container.querySelector(taxSourceFieldSelector(k3Part3Section2SourceFieldId('24')))).not.toBeNull()
  })
})

describe('K1ReviewPanel — clearable source overrides', () => {
  it('gates field edits behind an override checkbox and clears back to the source value', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Source Partnership' },
          },
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Entity \/ Partner Info/ }))

    expect(screen.getByText('Source Partnership')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Source Partnership')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Override B' }))
    expect(screen.getByDisplayValue('Source Partnership')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('Source Partnership'), {
      target: { value: 'Manual Partnership' },
    })

    expect(readPanelData().fields.B).toMatchObject({
      value: 'Manual Partnership',
      originalValue: 'Source Partnership',
      manualOverride: true,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Override B' }))

    expect(readPanelData().fields.B).toEqual({ value: 'Source Partnership' })
    expect(screen.queryByDisplayValue('Manual Partnership')).not.toBeInTheDocument()
    expect(screen.getByText('Source Partnership')).toBeInTheDocument()
  })

  it('restores null source values when clearing field overrides', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: null },
          },
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Entity \/ Partner Info/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Override B' }))

    const overrideInput = screen.getByRole('textbox')
    fireEvent.change(overrideInput, {
      target: { value: 'Manual Partnership' },
    })

    expect(readPanelData().fields.B).toMatchObject({
      value: 'Manual Partnership',
      originalValue: null,
      manualOverride: true,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Override B' }))

    expect(readPanelData().fields.B).toEqual({ value: null })
    expect(screen.queryByDisplayValue('Manual Partnership')).not.toBeInTheDocument()
  })

  it('saves code row overrides with a source snapshot and clears them after reload', () => {
    const sourceItems: K1CodeItem[] = [{
      code: 'S',
      value: '100',
      notes: 'source notes',
      character: 'short',
    }]
    const handleChange = jest.fn()
    const onClose = jest.fn()
    const codeDefinitions = { S: 'Non-portfolio capital gain' }
    const { rerender } = render(
      <K1CodesModal
        open
        box="11"
        boxLabel="Box 11"
        codeDefinitions={codeDefinitions}
        items={sourceItems}
        onChange={handleChange}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('100')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Override code row 1' }))
    fireEvent.change(screen.getByDisplayValue('100'), {
      target: { value: '250' },
    })
    fireEvent.change(screen.getByDisplayValue('source notes'), {
      target: { value: 'manual notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const savedItems = handleChange.mock.calls[0]?.[0] as K1CodeItem[]
    expect(savedItems[0]).toMatchObject({
      code: 'S',
      value: '250',
      notes: 'manual notes',
      character: 'short',
      manualOverride: true,
      sourceItem: {
        code: 'S',
        value: '100',
        notes: 'source notes',
        character: 'short',
      },
    })

    handleChange.mockClear()
    rerender(
      <K1CodesModal
        key="reloaded"
        open
        box="11"
        boxLabel="Box 11"
        codeDefinitions={codeDefinitions}
        items={savedItems}
        onChange={handleChange}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Override code row 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(handleChange).toHaveBeenCalledWith([{
      code: 'S',
      value: '100',
      notes: 'source notes',
      character: 'short',
    }])
  })
})

describe('K1ReviewPanel — trader material participation override', () => {
  it('shows the default non-material participation regime for trader K-1s', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
        })}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Materially participated in the securities-trading activity/i })).not.toBeChecked()
    expect(screen.getByText(/Default: Form 4952 §163\(d\) limit/i)).toBeInTheDocument()
  })

  it('persists material participation in sourceValueOverrides and clears back to default', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
        })}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Materially participated in the securities-trading activity/i }))

    expect(readPanelData().sourceValueOverrides?.['k1:material-participation']).toMatchObject({
      value: 'true',
      originalValue: null,
      label: 'Material participation in securities-trading activity',
    })
    expect(screen.getByText(/Off Form 4952; fully deductible on Schedule E Part II line 28/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Materially participated in the securities-trading activity/i }))

    expect(readPanelData().sourceValueOverrides).toBeUndefined()
    expect(screen.getByText(/Default: Form 4952 §163\(d\) limit/i)).toBeInTheDocument()
  })

  it('does not render material participation control for non-trader K-1s', () => {
    render(
      <K1ReviewPanel
        data={makeData({
          fields: {
            B: { value: 'Investment Partnership' },
            partnershipPosition_traderInSecurities: { value: 'false' },
          },
        })}
        onChange={() => {}}
      />,
    )

    expect(screen.queryByRole('checkbox', { name: /Materially participated in the securities-trading activity/i })).not.toBeInTheDocument()
  })
})

describe('K1ReviewPanel — Form 4952 tracing split override', () => {
  it('shows the default Schedule E split for non-materially-participating trader K-1 interest', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
        })}
      />,
    )

    expect(screen.getByText('Form 4952 interest tracing split')).toBeInTheDocument()
    expect(screen.getByLabelText('Box 13H Schedule A traced interest')).toHaveValue('')
    expect(screen.getByLabelText('Box 13H Schedule E traced interest')).toHaveValue('200')
  })

  it('disables tracing split controls in read-only mode', () => {
    render(
      <K1ReviewPanel
        data={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
          sourceValueOverrides: {
            'form4952:tracing:code:13:H': {
              value: JSON.stringify({ scheduleA: 80, scheduleE: 120 }),
              originalValue: null,
              label: 'Form 4952 tracing split — Box 13H',
            },
          },
        })}
        onChange={() => {}}
        readOnly
      />,
    )

    expect(screen.getByLabelText('Box 13H Schedule A traced interest')).toBeDisabled()
    expect(screen.getByLabelText('Box 13H Schedule E traced interest')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('persists and clears the tracing split source override', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText('Box 13H Schedule A traced interest'), {
      target: { value: '80' },
    })
    fireEvent.change(screen.getByLabelText('Box 13H Schedule E traced interest'), {
      target: { value: '120' },
    })

    const override = readPanelData().sourceValueOverrides?.['form4952:tracing:code:13:H']
    expect(override).toMatchObject({
      originalValue: null,
      label: 'Form 4952 tracing split — Box 13H',
    })
    expect(JSON.parse(override?.value ?? '{}')).toEqual({ scheduleA: 80, scheduleE: 120 })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(readPanelData().sourceValueOverrides).toBeUndefined()
  })

  it('hides tracing split controls when material participation takes trader interest off Form 4952', () => {
    render(
      <ControlledK1ReviewPanel
        initialData={makeData({
          fields: {
            B: { value: 'Trading Partnership' },
            partnershipPosition_traderInSecurities: { value: 'true' },
          },
          codes: {
            '13': [{ code: 'H', value: '200' }],
          },
          sourceValueOverrides: {
            'k1:material-participation': {
              value: 'true',
              originalValue: null,
              label: 'Material participation in securities-trading activity',
            },
          },
        })}
      />,
    )

    expect(screen.queryByText('Form 4952 interest tracing split')).not.toBeInTheDocument()
  })
})
