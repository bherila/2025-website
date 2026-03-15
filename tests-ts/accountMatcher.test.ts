import {
  buildAccountsContext,
  getAccountSuffix,
  matchAccount,
  matchAccountByNumber,
  redactAccountNumber,
  type AccountForMatching,
} from '@/lib/finance/accountMatcher'

const accounts: AccountForMatching[] = [
  { acct_id: 1, acct_name: 'Ally Online Savings', acct_number: '123456781234' },
  { acct_id: 2, acct_name: 'Ally Checking', acct_number: '987654325678' },
  { acct_id: 3, acct_name: 'No Number Account', acct_number: null },
  { acct_id: 4, acct_name: 'Another Savings', acct_number: '111122221234' },
]

describe('getAccountSuffix', () => {
  it('extracts last 4 digits', () => {
    expect(getAccountSuffix('123456789')).toBe('6789')
  })

  it('strips non-numeric characters', () => {
    expect(getAccountSuffix('xxxx-1234')).toBe('1234')
    expect(getAccountSuffix('...1234')).toBe('1234')
    expect(getAccountSuffix('Account ending in 5678')).toBe('5678')
  })

  it('handles short strings', () => {
    expect(getAccountSuffix('12')).toBe('12')
    expect(getAccountSuffix('')).toBe('')
  })

  it('respects custom digit count', () => {
    expect(getAccountSuffix('123456789', 3)).toBe('789')
  })
})

describe('redactAccountNumber', () => {
  it('shows only last 4 digits with mask', () => {
    expect(redactAccountNumber('123456789')).toBe('•••6789')
  })

  it('leaves short numbers unchanged', () => {
    expect(redactAccountNumber('1234')).toBe('1234')
    expect(redactAccountNumber('123')).toBe('123')
  })
})

describe('matchAccountByNumber', () => {
  it('returns null for empty parsed number', () => {
    expect(matchAccountByNumber('', accounts)).toBeNull()
  })

  it('exact match', () => {
    expect(matchAccountByNumber('123456781234', accounts)).toBe(1)
  })

  it('suffix match with unique result', () => {
    // Account 2 ends in 5678
    expect(matchAccountByNumber('xxxx5678', accounts)).toBe(2)
    expect(matchAccountByNumber('...5678', accounts)).toBe(2)
  })

  it('returns null when suffix matches multiple accounts', () => {
    // Both account 1 (ends 1234) and account 4 (ends 1234) match
    expect(matchAccountByNumber('xxxx1234', accounts)).toBeNull()
  })

  it('returns null when no match found', () => {
    expect(matchAccountByNumber('xxxx9999', accounts)).toBeNull()
  })

  it('ignores accounts without account numbers', () => {
    expect(matchAccountByNumber('', accounts)).toBeNull()
  })
})

describe('matchAccount', () => {
  it('matches by exact account number', () => {
    expect(matchAccount('123456781234', null, accounts)).toBe(1)
  })

  it('matches by unique suffix', () => {
    expect(matchAccount('xxxx5678', null, accounts)).toBe(2)
  })

  it('disambiguates multiple suffix matches using account name', () => {
    // Both account 1 and 4 end in 1234; account 1 has "Savings" in name
    expect(matchAccount('xxxx1234', 'Online Savings Account', accounts)).toBe(1)
    expect(matchAccount('xxxx1234', 'Another Savings', accounts)).toBe(4)
  })

  it('returns null when no number and no match', () => {
    expect(matchAccount(null, null, accounts)).toBeNull()
    expect(matchAccount('xxxx9999', 'Unknown Account', accounts)).toBeNull()
  })

  it('handles undefined inputs gracefully', () => {
    expect(matchAccount(undefined, undefined, accounts)).toBeNull()
  })
})

describe('buildAccountsContext', () => {
  it('builds context string with last 4 digits only', () => {
    const ctx = buildAccountsContext(accounts)
    expect(ctx).toContain('Ally Online Savings: last 4 digits 1234')
    expect(ctx).toContain('Ally Checking: last 4 digits 5678')
    // Full account numbers must NOT appear
    expect(ctx).not.toContain('123456781234')
    expect(ctx).not.toContain('987654325678')
  })

  it('omits accounts without account numbers', () => {
    const ctx = buildAccountsContext(accounts)
    expect(ctx).not.toContain('No Number Account')
  })

  it('returns empty string when no accounts have numbers', () => {
    const noNumbers = [{ acct_id: 1, acct_name: 'Test', acct_number: null }]
    expect(buildAccountsContext(noNumbers)).toBe('')
  })
})
