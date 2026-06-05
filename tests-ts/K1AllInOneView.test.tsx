import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import K1AllInOneView from '@/components/finance/K1AllInOneView'
import { k1FieldSourceFieldId } from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData, K1CodeItem, K1FieldValue } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { TaxFactSource, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

function field(value: string): K1FieldValue {
  return { value }
}

function k1Doc(
  id: number,
  fields: Record<string, K1FieldValue>,
  codes: Record<string, K1CodeItem[]> = {},
): TaxDocument {
  const data: FK1StructuredData = { schemaVersion: '2026.1', formType: 'K-1-1065', fields, codes }
  return { id, parsed_data: data, employment_entity: null } as unknown as TaxDocument
}

function source(overrides: Partial<TaxFactSource>): TaxFactSource {
  return {
    sourceType: 'K1',
    routing: null,
    id: `src-${Math.random()}`,
    label: 'label',
    amount: 0,
    taxDocumentId: null,
    taxDocumentAccountId: null,
    accountId: null,
    formType: 'K-1-1065',
    box: null,
    code: null,
    routingReason: null,
    notes: null,
    isReviewed: false,
    reviewStatus: 'pending',
    reviewAction: null,
    ...overrides,
  }
}

// Portfolio fund (Alpha) and trader fund (Trader) — same Box 11 Code A routes
// differently per fund, demonstrating footnote/fund-type-aware destinations.
const docs: TaxDocument[] = [
  k1Doc(101, { A: field('11-1111111'), B: field('Alpha Fund LP'), '5': field('1000'), '7': field('60'), '8': field('50') }, { '11': [{ code: 'A', value: '100' }] }),
  k1Doc(102, { A: field('22-2222222'), B: field('Trader Fund LP'), '5': field('2000'), '7': field('80') }, { '11': [{ code: 'A', value: '200' }] }),
]

const taxFacts = {
  scheduleB: {
    interestSources: [
      source({ taxDocumentId: 101, box: '5', routing: 'schedule_b_line_1' }),
      source({ taxDocumentId: 102, box: '5', routing: 'schedule_b_line_1' }),
    ],
    ordinaryDividendSources: [
      source({ taxDocumentId: 101, box: '11', code: 'A', routing: 'schedule_b_line_5' }),
    ],
  },
  scheduleE: {
    box11ZZSources: [
      source({ taxDocumentId: 102, box: '11', code: 'A', routing: 'schedule_e_line_28', routingReason: 'Trader fund — ordinary nonpassive' }),
    ],
  },
  // Box 7 (royalties): only Alpha is routed; Trader has a value with no routing.
  scheduleA: {
    otherItemizedSources: [
      source({ taxDocumentId: 101, box: '7', routing: 'schedule_a_line_16' }),
    ],
  },
} as unknown as TaxPreviewFacts

function renderView(overrides: Partial<React.ComponentProps<typeof K1AllInOneView>> = {}) {
  const onReviewDoc = jest.fn()
  const onDrill = jest.fn()
  const onSaveParsedData = jest.fn().mockResolvedValue(undefined)
  render(
    <K1AllInOneView
      k1Docs={docs}
      taxFacts={taxFacts}
      onReviewDoc={onReviewDoc}
      onDrill={onDrill}
      onSaveParsedData={onSaveParsedData}
      {...overrides}
    />,
  )
  return { onReviewDoc, onDrill, onSaveParsedData }
}

describe('K1AllInOneView', () => {
  it('renders one column per fund plus a Total column with cross-fund sums', () => {
    renderView()
    // Names appear in both the column header and the Box B "Partnership info" row.
    expect(screen.getAllByText('Alpha Fund LP').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Trader Fund LP').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Total')).toBeInTheDocument()
    // Box 5 interest: 1000 + 2000 = 3000
    expect(screen.getByText('$3,000')).toBeInTheDocument()
  })

  it('opens the source popup first and can then open the K-1 review modal', () => {
    const { onReviewDoc } = renderView()
    fireEvent.click(screen.getByRole('button', { name: '$1,000' }))
    expect(screen.getByText('Effective value')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /go to source/i }))
    expect(onReviewDoc).toHaveBeenCalledWith(101, k1FieldSourceFieldId('5'))
  })

  it('saves a source value override without opening the K-1 review modal first', async () => {
    const { onReviewDoc, onSaveParsedData } = renderView()
    fireEvent.click(screen.getByRole('button', { name: '$1,000' }))
    fireEvent.change(screen.getByLabelText(/override source value/i), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /save override/i }))

    await waitFor(() => expect(onSaveParsedData).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        sourceValueOverrides: expect.objectContaining({
          'field:5': expect.objectContaining({ value: '1234', originalValue: '1000' }),
        }),
      }),
    ))
    expect(onReviewDoc).not.toHaveBeenCalled()
  })

  it('drills into the destination form when a destination chip is clicked', () => {
    const { onDrill } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Sch B line 1' }))
    expect(onDrill).toHaveBeenCalledWith({ id: 'sch-b' })
  })

  it('shows divergent per-fund destinations on the same line', () => {
    renderView()
    // Box 11 Code A: portfolio fund -> Sch B line 5, trader fund -> Sch E line 28
    expect(screen.getByRole('button', { name: 'Sch B line 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sch E line 28' })).toBeInTheDocument()
  })

  it('does not mask an unrouted fund with another fund’s destination on the same line', () => {
    renderView()
    // Box 7 royalties: Alpha routes to Sch A line 16; Trader has a value but no
    // routing — it must show its own "needs review", not inherit Alpha's chip.
    const royalties = screen.getByText('Royalties').closest('tr')!
    expect(within(royalties).getByRole('button', { name: 'Sch A line 16' })).toBeInTheDocument()
    expect(within(royalties).getByText(/needs review/)).toBeInTheDocument()
  })

  it('flags a routable line with no computed destination as needing review', () => {
    renderView()
    // Box 8 (ST capital gain) has a value but no source routing it anywhere.
    const stGain = screen.getByText('ST capital gain').closest('tr')!
    expect(within(stGain).getByText(/needs review — depends on K-1 footnotes/)).toBeInTheDocument()
  })

  it('keeps table headers, first-column cells, and section labels sticky inside the table viewport', () => {
    renderView()

    const table = screen.getByRole('table')
    expect(table.parentElement).toHaveClass('overflow-auto')
    expect(table.parentElement?.className).toContain('max-h-[calc(100vh-14rem)]')

    const corner = screen.getByRole('columnheader', { name: 'Line' })
    expect(corner).toHaveClass('sticky', 'top-0', 'left-0', 'z-30')
    expect(corner.className).toContain('shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]')
    expect(corner.closest('tr')).toHaveClass('sticky', 'top-0', 'z-20')

    const totalHeader = screen.getByRole('columnheader', { name: 'Total' })
    expect(totalHeader).toHaveClass('sticky', 'top-0', 'z-20')

    const firstColumnCell = screen.getByText('Royalties').closest('td')
    expect(firstColumnCell).toHaveClass('sticky', 'left-0', 'z-10')
    expect(firstColumnCell?.className).toContain('shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]')

    const sectionCell = screen.getByText('Income, Deductions & Other (Boxes 1–21)').closest('th')
    expect(sectionCell).toHaveClass('sticky', 'left-0', 'z-10')
    expect(sectionCell).not.toHaveAttribute('colspan')
  })

  it('renders an empty state when there are no parsed K-1s', () => {
    renderView({ k1Docs: [] })
    expect(screen.getByText(/No reviewed K-1s for this year yet/)).toBeInTheDocument()
  })
})
