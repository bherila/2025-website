import { fireEvent, render, screen, within } from '@testing-library/react'

import K3AllInOneView, { buildK3AllInOneXlsxGrids } from '@/components/finance/K3AllInOneView'
import {
  k3ForeignTaxTotalSourceFieldId,
  k3Part2Section1SourceFieldId,
  k3Part2Section2SourceFieldId,
  k3Part3CountrySourceFieldId,
} from '@/lib/finance/taxSourceFieldIds'
import type { FK1StructuredData, K3Section } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

function k1WithK3(id: number, name: string, sections: K3Section[]): TaxDocument {
  const data: FK1StructuredData = {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: { B: { value: name } },
    codes: {},
    k3: { sections },
  }
  return { id, parsed_data: data, employment_entity: null } as unknown as TaxDocument
}

function part2(rows: Array<Record<string, unknown>>): K3Section {
  return { sectionId: 'part2_section1', title: 'Part II', data: { rows } }
}

function part2Section2(rows: Array<Record<string, unknown>>): K3Section {
  return { sectionId: 'part2_section2', title: 'Part II Section 2', data: { rows } }
}

function part3(countries: Array<Record<string, unknown>>): K3Section {
  return { sectionId: 'part3_section4', title: 'Part III §4', data: { countries } }
}

// Alpha: passive interest (Ireland). Trader: passive + general dividends (Cayman).
const docs: TaxDocument[] = [
  k1WithK3(201, 'Alpha Fund LP', [
    part2([{ line: '1', description: 'Interest', country: 'Ireland', col_a_us_source: '0', col_c_passive: '8010', col_d_general: '0', col_g_total: '8010' }]),
    part3([{ country: 'Ireland', amount_usd: 1201 }]),
  ]),
  k1WithK3(202, 'Trader Fund LP', [
    part2([{ line: '2', description: 'Dividends', country: 'Cayman', col_a_us_source: '0', col_c_passive: '16047', col_d_general: '500', col_g_total: '16547' }]),
    part3([{ country: 'Cayman', amount_usd: 842 }]),
  ]),
]

function renderView(overrides: Partial<React.ComponentProps<typeof K3AllInOneView>> = {}) {
  const onReviewDoc = jest.fn()
  const onSaveParsedData = jest.fn().mockResolvedValue(undefined)
  render(<K3AllInOneView k1Docs={docs} onReviewDoc={onReviewDoc} onSaveParsedData={onSaveParsedData} {...overrides} />)
  return { onReviewDoc, onSaveParsedData }
}

describe('K3AllInOneView', () => {
  it('pivots K-3 across funds with a Total column', () => {
    renderView()
    expect(screen.getByText('K-3 Part II — Foreign Income')).toBeInTheDocument()
    expect(screen.getByText(/K-3 Part III/)).toBeInTheDocument()
    // Both fund headers present (column headers).
    expect(screen.getAllByText('Alpha Fund LP').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Trader Fund LP').length).toBeGreaterThanOrEqual(1)
    // Part III foreign taxes are pivoted per country (Ireland 1,201; Cayman 842),
    // each summed into the per-row Total column (single fund ⇒ cell == total).
    expect(screen.getAllByText('$1,201').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('$842').length).toBeGreaterThanOrEqual(2)
  })

  it('switches the Part II basket via the category tabs', () => {
    renderView()
    // Default tab is Total: dividends total shows 16,547 (Trader cell + Total column).
    expect(screen.getAllByText('$16,547').length).toBeGreaterThanOrEqual(1)
    // Switch to General: dividends general portion is 500.
    fireEvent.click(screen.getByRole('button', { name: 'General' }))
    expect(screen.getAllByText('$500').length).toBeGreaterThanOrEqual(1)
    // Switch to Passive: dividends passive portion is 16,047.
    fireEvent.click(screen.getByRole('button', { name: 'Passive' }))
    expect(screen.getAllByText('$16,047').length).toBeGreaterThanOrEqual(1)
  })

  it('opens the source popup first and can then open the K-1 source', () => {
    const { onReviewDoc } = renderView()
    const ireland = screen.getByText('Ireland').closest('tr')!
    fireEvent.click(within(ireland).getByRole('button', { name: '$1,201' }))
    expect(screen.getByText('Effective value')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /go to source/i }))
    expect(onReviewDoc).toHaveBeenCalledWith(201, k3Part3CountrySourceFieldId('Ireland'))
  })

  it('opens K-3 Part II section 1 line targets from source cells', () => {
    const { onReviewDoc } = renderView()
    const interest = screen.getByText('Interest').closest('tr')!

    fireEvent.click(within(interest).getByRole('button', { name: '$8,010' }))
    fireEvent.click(screen.getByRole('button', { name: /go to source/i }))

    expect(onReviewDoc).toHaveBeenCalledWith(201, k3Part2Section1SourceFieldId('1'))
  })

  it('opens K-3 Part II section 2 line targets from source cells', () => {
    const doc = k1WithK3(306, 'Deduction Fund LP', [
      part2Section2([{ line: '55', description: 'Net income', col_c_passive: '100', col_g_total: '100' }]),
    ])
    const onReviewDoc = jest.fn()

    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={onReviewDoc} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(within(screen.getByText('Net income').closest('tr')!).getByRole('button', { name: '$100' }))
    fireEvent.click(screen.getByRole('button', { name: /go to source/i }))

    expect(onReviewDoc).toHaveBeenCalledWith(306, k3Part2Section2SourceFieldId('55'))
  })

  it('opens the K-3 foreign tax total aggregate target from source cells', () => {
    const { onReviewDoc } = renderView()
    const totalRow = screen.getByText('Foreign tax total (used)').closest('tr')!

    fireEvent.click(within(totalRow).getByRole('button', { name: '$1,201' }))
    fireEvent.click(screen.getByRole('button', { name: /go to source/i }))

    expect(onReviewDoc).toHaveBeenCalledWith(201, k3ForeignTaxTotalSourceFieldId())
  })

  it('downloads a scoped normalized K-3 XLSX grid', () => {
    const onExportXlsx = jest.fn()
    renderView({ onExportXlsx })

    fireEvent.click(screen.getByRole('button', { name: /download xlsx/i }))

    expect(onExportXlsx).toHaveBeenCalledTimes(1)
    const payload = onExportXlsx.mock.calls[0]?.[0] as {
      scope: string
      grids: Array<{
        name: string
        scope: string
        columns: Array<{ key: string; label: string; format?: string }>
        rows: Array<{ kind: string; label?: string; cells?: Record<string, string | number | null> }>
      }>
    }
    const grid = payload.grids[0]!
    expect(payload.scope).toBe('k3-all-in-one')
    expect(grid.name).toBe('All K-3s')
    expect(grid.scope).toBe('k3-all-in-one')
    expect(grid.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'doc_201', label: 'Alpha Fund LP', format: 'currency' }),
      expect.objectContaining({ key: 'doc_202', label: 'Trader Fund LP', format: 'currency' }),
      expect.objectContaining({ key: 'total', label: 'Total', format: 'currency' }),
    ]))
    expect(grid.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'section', label: 'K-3 Part II — Foreign Income — Total' }),
      expect.objectContaining({ kind: 'section', label: 'K-3 Part III §4 — Foreign Taxes (USD by country)' }),
    ]))

    const totalSectionIndex = grid.rows.findIndex((row) => row.label === 'K-3 Part II — Foreign Income — Total')
    const interestRow = grid.rows.slice(totalSectionIndex + 1).find((row) => row.label === 'Interest')
    expect(interestRow).toEqual(expect.objectContaining({
      kind: 'data',
      cells: expect.objectContaining({
        doc_201: 8010,
        doc_202: null,
        total: 8010,
      }),
    }))

    const foreignTaxTotalRow = grid.rows.find((row) => row.label === 'Foreign tax total (used)')
    expect(foreignTaxTotalRow).toEqual(expect.objectContaining({
      cells: expect.objectContaining({
        doc_201: 1201,
        doc_202: 842,
        total: 2043,
      }),
    }))
  })

  it('splits wide K-3 XLSX grids to stay within the API column limit', () => {
    const manyDocs = Array.from({ length: 64 }, (_, index) => {
      const sequence = index + 1

      return k1WithK3(2000 + index, `Fund ${sequence}`, [
        part2([{ line: '1', description: 'Interest', col_g_total: String(sequence) }]),
      ])
    })

    const grids = buildK3AllInOneXlsxGrids(manyDocs)

    expect(grids).toHaveLength(2)
    expect(grids.map((grid) => grid.name)).toEqual(['All K-3s', 'All K-3s 2'])
    expect(grids.map((grid) => grid.columns.length)).toEqual([64, 2])
    expect(grids.every((grid) => grid.columns.length <= 64)).toBe(true)

    const totalSectionIndex = grids[1]!.rows.findIndex((row) => row.label === 'K-3 Part II — Foreign Income — Total')
    const secondInterestRow = grids[1]!.rows.slice(totalSectionIndex + 1).find((row) => row.label === 'Interest')
    expect(secondInterestRow?.cells).toEqual(expect.objectContaining({
      doc_2063: 64,
      total: 64,
    }))
    expect(secondInterestRow?.cells ?? {}).not.toHaveProperty('doc_2000')
  })

  it('keeps table headers, first-column cells, and section labels sticky inside each table viewport', () => {
    renderView()

    const table = screen.getAllByRole('table')[0]!
    expect(table.parentElement).toHaveClass('overflow-auto')
    expect(table.parentElement?.className).toContain('max-h-[calc(100vh-14rem)]')

    const corner = within(table).getByRole('columnheader', { name: 'Line / Country' })
    expect(corner).toHaveClass('sticky', 'top-0', 'left-0', 'z-30')
    expect(corner.className).toContain('shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]')
    expect(corner.closest('tr')).toHaveClass('sticky', 'top-0', 'z-20')

    const fundHeader = within(table).getByText('Alpha Fund LP').closest('th')
    expect(fundHeader).toHaveClass('sticky', 'top-0', 'z-20')

    const firstColumnCell = within(table).getByText('Interest').closest('td')
    expect(firstColumnCell).toHaveClass('sticky', 'left-0', 'z-10')
    expect(firstColumnCell?.className).toContain('shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]')

    const sectionCell = within(table).getByText('K-3 Part II — Foreign Income').closest('th')
    expect(sectionCell).toHaveClass('sticky', 'left-0', 'z-10')
    expect(sectionCell).not.toHaveAttribute('colspan')
  })

  it('renders an empty state when no K-1 has K-3 data', () => {
    renderView({ k1Docs: [] })
    expect(screen.getByText(/No K-3 .* data found/)).toBeInTheDocument()
  })

  it('sums all Part II category columns when col_g_total is missing', () => {
    const doc = k1WithK3(301, 'Branch Fund LP', [
      // No col_g_total; foreign-branch + sourced-by-partner must be included.
      part2([{ line: '1', description: 'Interest', col_a_us_source: '100', col_b_foreign_branch: '200', col_f_sourced_by_partner: '400' }]),
    ])
    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={jest.fn()} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    // Default tab is Total: 100 + 200 + 400 = 700 (cell + Total column).
    expect(screen.getAllByText('$700').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: 'Foreign Source' }))
    expect(screen.getAllByText('$200').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: 'Sourced by Partner' }))
    expect(screen.getAllByText('$400').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: 'U.S. Source' }))
    expect(screen.getAllByText('$100').length).toBeGreaterThanOrEqual(1)
  })

  it('shows country rows as excluded when a K-3 foreign tax aggregate override is present', () => {
    const doc = k1WithK3(305, 'Override Fund LP', [
      part3([{ country: 'Ireland', amount_usd: 1201 }]),
    ])
    const data = doc.parsed_data as FK1StructuredData
    data.sourceValueOverrides = {
      'k3:foreign-tax-total': { value: '999', originalValue: '1201', label: 'Foreign tax total' },
    }

    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={jest.fn()} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    const countryRow = screen.getByText('Ireland').closest('tr')!
    expect(within(countryRow).getByRole('button', { name: '$1,201' }).closest('td')?.className).toContain('line-through')

    const totalRow = screen.getByText('Foreign tax total (used)').closest('tr')!
    fireEvent.click(within(totalRow).getByRole('button', { name: /\$999.*overridden source value/i }))
    expect(screen.getByText('Excluded source values')).toBeInTheDocument()
    expect(screen.getAllByText('Ireland').length).toBeGreaterThanOrEqual(2)
  })

  it('shows a fallback total row when Part III has only a grand total', () => {
    const doc = k1WithK3(302, 'Aggregate Fund LP', [
      { sectionId: 'part3_section4', title: 'Part III §4', data: { line1_foreignTaxesPaid: { grandTotalUSD: 500 } } },
    ])
    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={jest.fn()} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText(/no country breakdown/)).toBeInTheDocument()
    expect(screen.getAllByText('$500').length).toBeGreaterThanOrEqual(1)
  })

  it('reads canonical Part II line objects (lineN_* with per-country rows)', () => {
    const doc = k1WithK3(303, 'Canon Fund LP', [
      { sectionId: 'part2_section1', title: 'Part II', data: { line1_interest: { rows: [{ country: 'IE', a: '0', c: '8010', d: '0', g: '8010' }] } } },
    ])
    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={jest.fn()} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText('interest')).toBeInTheDocument()
    expect(screen.getAllByText('$8,010').length).toBeGreaterThanOrEqual(1)
  })

  it('reads canonical Part III country codes (DE/JP) and amounts', () => {
    const doc = k1WithK3(304, 'Code Fund LP', [
      { sectionId: 'part3_section4', title: 'Part III §4', data: { line1_foreignTaxesPaid: { countries: [{ code: 'DE', total: 300 }, { code: 'JP', passiveForeign: 200 }] } } },
    ])
    render(<K3AllInOneView k1Docs={[doc]} onReviewDoc={jest.fn()} onSaveParsedData={jest.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText('DE')).toBeInTheDocument()
    expect(screen.getByText('JP')).toBeInTheDocument()
    expect(screen.getAllByText('$300').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$200').length).toBeGreaterThanOrEqual(1)
  })
})
