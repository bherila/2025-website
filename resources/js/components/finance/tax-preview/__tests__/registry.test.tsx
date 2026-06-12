import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import type { TaxPreviewState } from '../formRegistry'
import { ALL_FORM_IDS } from '../formRegistry'
import { formRegistry } from '../registry'
import { FORM_IDS } from '../taxRoute'

jest.mock('../DockActions', () => ({
  useDockActions: () => ({
    reviewK1Doc: jest.fn(),
    openTaxDocumentDetail: jest.fn(),
    bulkSetSbpElection: jest.fn(),
    exportXlsx: jest.fn(),
    isExportingXlsx: false,
  }),
}))

describe('formRegistry', () => {
  it('registers entries with matching id field', () => {
    for (const [key, entry] of Object.entries(formRegistry)) {
      expect(entry).toBeDefined()
      expect(entry!.id).toBe(key)
    }
  })

  it('column-presentation entries have a component', () => {
    for (const entry of Object.values(formRegistry)) {
      if (entry?.presentation === 'column') {
        expect(entry.component).toBeDefined()
      }
    }
  })

  it('every entry has at least one keyword for command-palette search', () => {
    for (const entry of Object.values(formRegistry)) {
      expect(entry).toBeDefined()
      expect(entry!.keywords.length).toBeGreaterThan(0)
    }
  })

  it('includes the initial migrated forms', () => {
    expect(formRegistry['form-1040']).toBeDefined()
    expect(formRegistry['sch-1']).toBeDefined()
    expect(formRegistry.home).toBeDefined()
  })

  it('schedules use Schedule category, forms use Form category', () => {
    expect(formRegistry['sch-1']!.category).toBe('Schedule')
    expect(formRegistry['form-1040']!.category).toBe('Form')
    expect(formRegistry.home!.category).toBe('App')
  })

  it('renders Estimate at the same wide column width as Documents', () => {
    expect(formRegistry.estimate!.wide).toBe(true)
    expect(formRegistry.documents!.wide).toBe(true)
  })

  it('every registered form id is in the route allowlist so it can be navigated to', () => {
    // The Miller router round-trips routes through the URL hash, dropping any
    // column whose id is not allowlisted in FORM_IDS. A registry id missing
    // from the allowlist therefore renders as a no-op click (it snaps back to
    // Home). This guards against that drift — see All-in-One K-1 (#745).
    for (const id of Object.keys(formRegistry)) {
      expect(FORM_IDS.has(id)).toBe(true)
    }
  })

  it('the route allowlist contains no ids without a registry entry', () => {
    for (const id of ALL_FORM_IDS) {
      expect(formRegistry[id]).toBeDefined()
    }
  })

  describe('form-4952', () => {
    const entry = formRegistry['form-4952']!

    it('has relatedForms linking to sch-a, sch-b, and sch-e', () => {
      expect(entry.relatedForms).toEqual(['sch-a', 'sch-b', 'sch-e'])
    })

    it('has size wide', () => {
      expect(entry.size).toBe('wide')
    })

    it('keyAmounts returns Deduction and Carryforward for a state with form4952 facts', () => {
      const state = {
        taxFacts: {
          form4952: {
            deductibleInvestmentInterestExpense: 1_500,
            disallowedCarryforward: 250,
          },
        },
      } as unknown as TaxPreviewState

      expect(entry.keyAmounts!(state)).toEqual([
        { label: 'Deduction', value: 1_500 },
        { label: 'Carryforward', value: 250 },
      ])
    })

    it('keyAmounts returns null when taxFacts is absent', () => {
      const state = {} as unknown as TaxPreviewState
      expect(entry.keyAmounts!(state)).toBeNull()
    })

    it('keyAmounts returns null when taxFacts.form4952 is absent', () => {
      const state = { taxFacts: {} } as unknown as TaxPreviewState
      expect(entry.keyAmounts!(state)).toBeNull()
    })
  })

  describe('form-8949', () => {
    const entry = formRegistry['form-8949']!

    it('hasData returns true for server tax-fact rows without broker 1099 documents', () => {
      const state = {
        reviewed1099Docs: [],
        taxFacts: {
          form8949: {
            rows: [{
              form8949Box: 'F',
              description: 'Partnership 731 gain',
              dateAcquired: '2023-01-01',
              dateSold: '2025-12-31',
              proceeds: 40,
              costBasis: 0,
              adjustmentCode: null,
              adjustmentAmount: 0,
              gainOrLoss: 40,
              isShortTerm: false,
              isCovered: null,
              isSummaryRow: false,
              accountName: 'Partnership',
              taxDocumentId: null,
              sourceTransactionId: 'partnership_basis_year:1',
            }],
          },
        },
      } as unknown as TaxPreviewState

      expect(entry.hasData!(state)).toBe(true)
    })
  })

  describe('partnership-basis', () => {
    const entry = formRegistry['partnership-basis']!

    it('is defined and has id partnership-basis', () => {
      expect(entry).toBeDefined()
      expect(entry.id).toBe('partnership-basis')
    })

    it('has at least one keyword', () => {
      expect(entry.keywords.length).toBeGreaterThan(0)
    })

    it('has a category set', () => {
      expect(entry.category).toBeDefined()
      expect(entry.category).toBe('Form')
    })

    it('hasData returns false for empty facts', () => {
      const state = {} as unknown as TaxPreviewState
      expect(entry.hasData!(state)).toBe(false)
    })

    it('hasData returns false when partnershipBasis has no interests', () => {
      const state = {
        taxFacts: {
          partnershipBasis: { interests: [] },
        },
      } as unknown as TaxPreviewState
      expect(entry.hasData!(state)).toBe(false)
    })

    it('hasData returns true when partnershipBasis has at least one interest', () => {
      const state = {
        taxFacts: {
          partnershipBasis: {
            interests: [{ interestId: 1, partnershipName: 'Test Fund LP', worksheet: { endingOutsideBasis: 50_000 } }],
          },
        },
      } as unknown as TaxPreviewState
      expect(entry.hasData!(state)).toBe(true)
    })

    it('keyAmounts returns null when there are no interests', () => {
      const state = {
        taxFacts: { partnershipBasis: { interests: [] } },
      } as unknown as TaxPreviewState
      expect(entry.keyAmounts!(state)).toBeNull()
    })

    it('keyAmounts returns ending basis total when interests are present', () => {
      const state = {
        taxFacts: {
          partnershipBasis: {
            interests: [
              { interestId: 1, partnershipName: 'Fund A', worksheet: { endingOutsideBasis: 30_000 } },
              { interestId: 2, partnershipName: 'Fund B', worksheet: { endingOutsideBasis: 20_000 } },
            ],
          },
        },
      } as unknown as TaxPreviewState
      expect(entry.keyAmounts!(state)).toEqual([{ label: 'Ending basis', value: 50_000 }])
    })
  })

  describe('loading skeletons', () => {
    const renderEntry = (id: keyof typeof formRegistry, overrides: Partial<TaxPreviewState> = {}) => {
      const Component = formRegistry[id]!.component
      const state = {
        isLoading: true,
        taxFacts: null,
        payslips: [],
        reviewedK1Docs: [],
        reviewed1099Docs: [],
        reviewedW2Docs: [],
        allK1Documents: [],
        foreignTaxSummaries: [],
        scheduleCData: null,
        year: 2025,
        ...overrides,
      } as unknown as TaxPreviewState

      render(<Component state={state} onDrill={jest.fn()} />)
    }

    it('renders a skeleton for Form 1116 while initial tax facts are loading', () => {
      renderEntry('form-1116')

      expect(screen.getByTestId('tax-preview-column-skeleton')).toHaveAttribute(
        'aria-label',
        'Loading Form 1116',
      )
      expect(screen.queryByText(/No foreign tax data detected/i)).not.toBeInTheDocument()
    })

    it('renders a skeleton for W-2 summary while payslips are loading', () => {
      renderEntry('w2-summary')

      expect(screen.getByTestId('tax-preview-column-skeleton')).toHaveAttribute(
        'aria-label',
        'Loading W-2 income summary',
      )
      expect(screen.queryByText(/No W-2 payslip data/i)).not.toBeInTheDocument()
    })

    it('renders a skeleton for partnership basis while initial tax facts are loading', () => {
      renderEntry('partnership-basis')

      expect(screen.getByTestId('tax-preview-column-skeleton')).toHaveAttribute(
        'aria-label',
        'Loading partnership outside basis',
      )
      expect(screen.queryByText(/No partnership basis interests found/i)).not.toBeInTheDocument()
    })
  })

  describe('form-6781', () => {
    const entry = formRegistry['form-6781']!

    it('is related to Schedule D and Schedule D links back to it', () => {
      expect(entry.relatedForms).toEqual(['sch-d'])
      expect(formRegistry['sch-d']!.relatedForms).toContain('form-6781')
    })

    it('has command-palette keywords for Section 1256 and straddles', () => {
      expect(entry.keywords).toEqual(expect.arrayContaining(['6781', 'section 1256', 'straddles', 'contracts', 'mark to market']))
    })

    it('keyAmounts returns net gain only when Form 6781 has sources', () => {
      const state = {
        taxFacts: {
          form6781: {
            shortTermSources: [{ id: 'short' }],
            longTermSources: [],
            netGain: 32_545,
          },
        },
      } as unknown as TaxPreviewState

      expect(entry.keyAmounts!(state)).toEqual([{ label: 'Net gain', value: 32_545 }])
    })

    it('keyAmounts returns null when Form 6781 has no sources', () => {
      const state = {
        taxFacts: {
          form6781: {
            shortTermSources: [],
            longTermSources: [],
            netGain: 0,
          },
        },
      } as unknown as TaxPreviewState

      expect(entry.keyAmounts!(state)).toBeNull()
    })
  })
})
