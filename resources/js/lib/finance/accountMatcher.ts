/**
 * Utilities for matching parsed account numbers from bank statements
 * to the user's stored accounts using suffix matching.
 *
 * We never send full account numbers to AI services — only the last 4 digits
 * and account names are used for matching assistance.
 */

export interface AccountForMatching {
  acct_id: number
  acct_name: string
  /** Full account number (stored securely, never sent to AI) */
  acct_number: string | null
}

/**
 * Extracts the last N digits from an account number string,
 * stripping non-numeric characters.
 */
export function getAccountSuffix(accountNumber: string, digits = 4): string {
  return accountNumber.replace(/\D/g, '').slice(-digits)
}

/**
 * Returns a redacted version of an account number showing only the last 4 digits.
 * e.g. "123456789" → "•••5789"
 */
export function redactAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '')
  if (digits.length <= 4) return accountNumber
  return '•••' + digits.slice(-4)
}

/**
 * Matches a parsed account number string (which may be partial, e.g. "...1234" or "xxxx1234")
 * against the user's accounts using the following strategy:
 *
 * 1. Exact match on full account number
 * 2. Suffix match: last 4 numeric digits of the parsed number match the last 4 of an account
 * 3. If multiple suffix matches, attempt disambiguation by account name similarity
 *
 * @returns The matched acct_id, or null if no match found
 */
export function matchAccountByNumber(
  parsedAccountNumber: string,
  accounts: AccountForMatching[],
): number | null {
  if (!parsedAccountNumber) return null

  const accountsWithNumbers = accounts.filter((a) => a.acct_number)

  // 1. Exact match
  const exact = accountsWithNumbers.find(
    (a) => a.acct_number === parsedAccountNumber,
  )
  if (exact) return exact.acct_id

  // 2. Suffix match (last 4 digits)
  const parsedSuffix = getAccountSuffix(parsedAccountNumber, 4)
  if (!parsedSuffix) return null

  const suffixMatches = accountsWithNumbers.filter((a) => {
    const acctSuffix = getAccountSuffix(a.acct_number!, 4)
    return acctSuffix === parsedSuffix && acctSuffix.length === 4
  })

  if (suffixMatches.length === 1) return suffixMatches[0]!.acct_id
  if (suffixMatches.length === 0) return null

  // 3. Multiple suffix matches — cannot disambiguate without a name; caller should use matchAccount()
  return null
}

/**
 * Matches a parsed account identifier (number and/or name) against the user's accounts.
 * Tries number-based matching first, falls back to name-based matching.
 *
 * @param parsedAccountNumber - Account number from the statement (may be partial)
 * @param parsedAccountName - Account name from the statement (optional)
 * @param accounts - User's accounts list
 * @returns The matched acct_id, or null if no match found
 */
export function matchAccount(
  parsedAccountNumber: string | null | undefined,
  parsedAccountName: string | null | undefined,
  accounts: AccountForMatching[],
): number | null {
  // Try number-based matching first
  if (parsedAccountNumber) {
    const byNumber = matchAccountByNumber(parsedAccountNumber, accounts)
    if (byNumber !== null) return byNumber
  }

  // Try suffix match with both number and name disambiguation (word overlap)
  if (parsedAccountNumber) {
    const parsedSuffix = getAccountSuffix(parsedAccountNumber, 4)
    const accountsWithNumbers = accounts.filter((a) => a.acct_number)
    const suffixMatches = accountsWithNumbers.filter((a) => {
      const acctSuffix = getAccountSuffix(a.acct_number!, 4)
      return acctSuffix === parsedSuffix && acctSuffix.length === 4
    })

    if (suffixMatches.length > 1 && parsedAccountName) {
      // Disambiguate by word overlap between parsed name and account name
      const parsedWords = parsedAccountName.toLowerCase().split(/\W+/).filter(Boolean)
      let bestScore = 0
      let bestMatch: AccountForMatching | null = null
      for (const acct of suffixMatches) {
        const acctWords = acct.acct_name.toLowerCase().split(/\W+/).filter(Boolean)
        const overlap = parsedWords.filter(w => acctWords.includes(w)).length
        if (overlap > bestScore) {
          bestScore = overlap
          bestMatch = acct
        }
      }
      if (bestMatch && bestScore > 0) return bestMatch.acct_id
    }
  }

  return null
}

/**
 * Builds the accounts context string to include in LLM prompts.
 * Only includes account name and last 4 digits — never the full account number.
 */
export function buildAccountsContext(accounts: AccountForMatching[]): string {
  const lines = accounts
    .filter((a) => a.acct_number)
    .map((a) => {
      const last4 = getAccountSuffix(a.acct_number!, 4)
      return `- ${a.acct_name}: last 4 digits ${last4}`
    })

  if (lines.length === 0) return ''
  return 'Known user accounts (use these to assign transactions to the correct account):\n' + lines.join('\n')
}
