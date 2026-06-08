import { commandFilter } from '../commandSearch'

function matches(query: string, value: string, keywords: string[] = []): boolean {
  return commandFilter(value, query, keywords) > 0
}

describe('commandFilter', () => {
  it.each([
    ['k1', 'All-in-One K-1'],
    ['k-1', 'K1 Package'],
    ['k 1', 'All-in-One K-1'],
    ['k3', 'K-3 Source Value Overrides'],
    ['k-3', 'K3 Source Value Overrides'],
    ['w2', 'W-2 Income Summary'],
    ['w-2', 'W2 Income Summary'],
    ['1099b', '1099-B Lot Reconciliation'],
    ['1099-b', '1099B Lot Reconciliation'],
  ])('matches normalized tax token query %s against %s', (query, value) => {
    expect(matches(query, value)).toBe(true)
  })

  it('matches through punctuation and diacritics', () => {
    expect(matches('cafe deductions', 'Café — deductions')).toBe(true)
  })

  it('matches multi-token searches across label text', () => {
    expect(matches('checking transactions', 'Checking → Transactions')).toBe(true)
  })
})
