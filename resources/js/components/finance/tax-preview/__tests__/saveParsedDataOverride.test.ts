import type { FK1StructuredData } from '@/types/finance/k1-data'

import { saveParsedDataOverride } from '../registry'

const mockPut = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    put: (...args: unknown[]) => mockPut(...args),
  },
}))

type SaveState = Parameters<typeof saveParsedDataOverride>[0]

function buildState() {
  return {
    setAccountDocuments: jest.fn(),
    setAllK1Documents: jest.fn(),
    setTaxFacts: jest.fn(),
    refreshAll: jest.fn().mockResolvedValue(undefined),
  }
}

const NO_PARSED_DATA = {} as unknown as FK1StructuredData

describe('saveParsedDataOverride', () => {
  beforeEach(() => {
    mockPut.mockReset()
  })

  it('applies the response taxFacts directly by default (single-year previews such as All-in-One K-1)', async () => {
    const editedYearFacts = { form1040: {} }
    mockPut.mockResolvedValue({ document: { id: 7 }, taxFacts: editedYearFacts })
    const state = buildState()

    await saveParsedDataOverride(state as unknown as SaveState)(7, NO_PARSED_DATA)

    expect(state.setTaxFacts).toHaveBeenCalledWith(editedYearFacts)
    expect(state.refreshAll).not.toHaveBeenCalled()
  })

  it('refreshes for the page year instead of applying edited-year facts when alwaysRefreshTaxFacts is set (multi-year K-1 column)', async () => {
    // Regression for the multi-year K-1 column (PR #935 follow-up): the PUT returns taxFacts
    // computed for the EDITED document's year, which may differ from the page year. Applying
    // them would clobber the page-year facts, so the adapter must refresh for the page instead.
    const priorYearFacts = { form1040: {} }
    mockPut.mockResolvedValue({ document: { id: 9 }, taxFacts: priorYearFacts })
    const state = buildState()

    await saveParsedDataOverride(state as unknown as SaveState, { alwaysRefreshTaxFacts: true })(9, NO_PARSED_DATA)

    expect(state.setTaxFacts).not.toHaveBeenCalled()
    expect(state.refreshAll).toHaveBeenCalledWith({ includeTaxFacts: true })
  })

  it('refreshes (never applies stale facts) when the response has no document', async () => {
    mockPut.mockResolvedValue({ taxFacts: { form1040: {} } })
    const state = buildState()

    await saveParsedDataOverride(state as unknown as SaveState)(11, NO_PARSED_DATA)

    expect(state.setTaxFacts).not.toHaveBeenCalled()
    expect(state.refreshAll).toHaveBeenCalledWith({ includeTaxFacts: true })
  })
})
