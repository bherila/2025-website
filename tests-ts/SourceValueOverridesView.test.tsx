import { fireEvent, render, screen, within } from '@testing-library/react'

import SourceValueOverridesView from '@/components/finance/SourceValueOverridesView'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

function k1Doc(id: number, data: FK1StructuredData, accountName = `Account ${id}`): TaxDocument {
  return {
    id,
    parsed_data: data,
    employment_entity: { id, display_name: `Entity ${id}` },
    account: { acct_id: id, acct_name: accountName },
    account_links: [],
  } as unknown as TaxDocument
}

function baseK1(overrides: FK1StructuredData['sourceValueOverrides']): FK1StructuredData {
  const data: FK1StructuredData = {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields: { B: { value: 'Extracted Partnership LP' }, '5': { value: '1000' } },
    codes: { '11': [{ code: 'A', value: '200' }] },
  }
  if (overrides) {
    data.sourceValueOverrides = overrides
  }
  return data
}

describe('SourceValueOverridesView', () => {
  it('shows an empty state when no K-1 source overrides exist', () => {
    render(
      <SourceValueOverridesView
        k1Docs={[k1Doc(1, baseK1({}))]}
        onReviewDoc={jest.fn()}
        onOpenAllK1={jest.fn()}
        onOpenAllK3={jest.fn()}
      />,
    )

    expect(screen.getByText('No source value overrides')).toBeInTheDocument()
  })

  it('lists active overrides and opens the source review modal target', () => {
    const onReviewDoc = jest.fn()
    render(
      <SourceValueOverridesView
        k1Docs={[k1Doc(7, baseK1({
          'field:5': { value: '1234', originalValue: '1000', label: 'K-1 Box 5: Interest income' },
          'code:11:A': { value: '250', originalValue: '200' },
        }), 'Brokerage K-1 account')]}
        onReviewDoc={onReviewDoc}
        onOpenAllK1={jest.fn()}
        onOpenAllK3={jest.fn()}
      />,
    )

    expect(screen.getByText('Active overrides')).toBeInTheDocument()
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.getByText('K-1 Box 5: Interest income')).toBeInTheDocument()
    expect(screen.getByText('K-1 Box 11 Code A: Other portfolio income (loss)')).toBeInTheDocument()
    expect(screen.getByText('$1,234')).toBeInTheDocument()
    expect(screen.getByText('$234')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /go to source/i })[0]!)
    expect(onReviewDoc).toHaveBeenCalledWith(7)
  })

  it('shows aggregate K-3 overrides with excluded source rows', () => {
    const doc = k1Doc(9, {
      schemaVersion: '2026.1',
      formType: 'K-1-1065',
      fields: { B: { value: 'Foreign Fund LP' } },
      codes: {},
      k3: {
        sections: [
          {
            sectionId: 'part3_section4',
            title: 'Part III Section 4',
            data: { countries: [{ country: 'Ireland', amount_usd: 1201 }] },
          },
        ],
      },
      sourceValueOverrides: {
        'k3:foreign-tax-total': { value: '999', originalValue: '1201', label: 'Foreign tax total' },
      },
    })

    render(
      <SourceValueOverridesView
        k1Docs={[doc]}
        onReviewDoc={jest.fn()}
        onOpenAllK1={jest.fn()}
        onOpenAllK3={jest.fn()}
      />,
    )

    expect(screen.getByText(/aggregate override/i)).toBeInTheDocument()
    const row = screen.getByText('Foreign tax total').closest('tr')!
    expect(within(row).getByText('Aggregate')).toBeInTheDocument()
    expect(within(row).getByText('Excluded source rows')).toBeInTheDocument()
    expect(within(row).getByText('Ireland')).toBeInTheDocument()
    expect(within(row).getAllByText('$1,201').length).toBeGreaterThanOrEqual(1)
  })
})
