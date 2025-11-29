/**
 * Finance Route Builder
 * 
 * Centralizes URL construction and year selection management for the finance module.
 * Uses URL query strings for year selection (shareable, bookmarkable, browser-history friendly).
 * Also syncs to sessionStorage for persistence when navigating without explicit year param.
 */

export type YearSelection = number | 'all'

const STORAGE_KEY_PREFIX = 'finance_year_'

// ============================================================================
// Storage helpers (for persistence when no explicit year in URL)
// ============================================================================

function getStorageKey(accountId: number): string {
  return `${STORAGE_KEY_PREFIX}${accountId}`
}

export function getStoredYear(accountId: number): YearSelection | null {
  try {
    const stored = sessionStorage.getItem(getStorageKey(accountId))
    if (stored === 'all') return 'all'
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed)) return parsed
    }
  } catch {
    // sessionStorage not available
  }
  return null
}

export function setStoredYear(accountId: number, year: YearSelection): void {
  try {
    sessionStorage.setItem(getStorageKey(accountId), String(year))
  } catch {
    // sessionStorage not available
  }
}

// ============================================================================
// URL Parameter helpers
// ============================================================================

/**
 * Get the year from current URL query string.
 * Returns null if not present.
 */
export function getYearFromUrl(): YearSelection | null {
  const params = new URLSearchParams(window.location.search)
  const yearParam = params.get('year')
  if (!yearParam) return null
  if (yearParam === 'all') return 'all'
  const parsed = parseInt(yearParam, 10)
  return isNaN(parsed) ? null : parsed
}

/**
 * Get the effective year for an account.
 * Priority: URL query string > sessionStorage > default to 'all'
 * Also syncs the chosen year to sessionStorage.
 */
export function getEffectiveYear(accountId: number): YearSelection {
  // First check URL
  const urlYear = getYearFromUrl()
  if (urlYear !== null) {
    // Sync to storage
    setStoredYear(accountId, urlYear)
    return urlYear
  }
  
  // Fall back to storage
  const storedYear = getStoredYear(accountId)
  if (storedYear !== null) {
    return storedYear
  }
  
  // Default to 'all'
  return 'all'
}

// ============================================================================
// Route builders
// ============================================================================

interface RouteOptions {
  year?: YearSelection | undefined
  hash?: string | undefined  // e.g., 't_id=123'
}

function buildQueryString(year?: YearSelection): string {
  if (year === undefined || year === 'all') return ''
  return `?year=${year}`
}

function buildHash(hash?: string): string {
  if (!hash) return ''
  return `#${hash}`
}

/**
 * Build URL for account transactions page
 */
export function transactionsUrl(accountId: number, options: RouteOptions = {}): string {
  return `/finance/${accountId}${buildQueryString(options.year)}${buildHash(options.hash)}`
}

/**
 * Build URL for duplicates page
 */
export function duplicatesUrl(accountId: number, options: RouteOptions = {}): string {
  return `/finance/${accountId}/duplicates${buildQueryString(options.year)}`
}

/**
 * Build URL for linker page
 */
export function linkerUrl(accountId: number, options: RouteOptions = {}): string {
  return `/finance/${accountId}/linker${buildQueryString(options.year)}`
}

/**
 * Build URL for statements page
 */
export function statementsUrl(accountId: number, options: RouteOptions = {}): string {
  return `/finance/${accountId}/statements${buildQueryString(options.year)}`
}

/**
 * Build URL for summary page
 */
export function summaryUrl(accountId: number, options: RouteOptions = {}): string {
  return `/finance/${accountId}/summary${buildQueryString(options.year)}`
}

/**
 * Build URL for import transactions page
 */
export function importUrl(accountId: number): string {
  return `/finance/${accountId}/import-transactions`
}

/**
 * Build URL for maintenance page
 */
export function maintenanceUrl(accountId: number): string {
  return `/finance/${accountId}/maintenance`
}

/**
 * Build URL for accounts list
 */
export function accountsUrl(): string {
  return '/finance/accounts'
}

/**
 * Build URL for tags management
 */
export function tagsUrl(): string {
  return '/finance/tags'
}

/**
 * Navigate to a transaction in a specific account.
 * Preserves year selection in URL and scrolls to the transaction.
 */
export function goToTransaction(accountId: number, transactionId: number, year?: YearSelection): void {
  window.location.href = transactionsUrl(accountId, { year, hash: `t_id=${transactionId}` })
}

/**
 * Navigate to a tab within the same account, preserving year selection.
 * This does a full page navigation (not SPA-style).
 */
export function navigateToTab(
  accountId: number,
  tab: 'transactions' | 'duplicates' | 'linker' | 'statements' | 'summary' | 'import' | 'maintenance'
): void {
  const year = getEffectiveYear(accountId)
  
  switch (tab) {
    case 'transactions':
      window.location.href = transactionsUrl(accountId, { year })
      break
    case 'duplicates':
      window.location.href = duplicatesUrl(accountId, { year })
      break
    case 'linker':
      window.location.href = linkerUrl(accountId, { year })
      break
    case 'statements':
      window.location.href = statementsUrl(accountId, { year })
      break
    case 'summary':
      window.location.href = summaryUrl(accountId, { year })
      break
    case 'import':
      window.location.href = importUrl(accountId)
      break
    case 'maintenance':
      window.location.href = maintenanceUrl(accountId)
      break
  }
}

/**
 * Get the current tab URL builder for a given tab name.
 */
export function getTabUrl(
  tab: string,
  accountId: number,
  year?: YearSelection
): string {
  const options = { year }
  switch (tab) {
    case 'transactions':
      return transactionsUrl(accountId, options)
    case 'duplicates':
      return duplicatesUrl(accountId, options)
    case 'linker':
      return linkerUrl(accountId, options)
    case 'statements':
      return statementsUrl(accountId, options)
    case 'summary':
      return summaryUrl(accountId, options)
    case 'import':
      return importUrl(accountId)
    case 'maintenance':
      return maintenanceUrl(accountId)
    default:
      return transactionsUrl(accountId, options)
  }
}

/**
 * Update the current URL's year parameter without navigation.
 * Also syncs to sessionStorage.
 */
export function updateYearInUrl(accountId: number, year: YearSelection): void {
  // Sync to storage
  setStoredYear(accountId, year)
  
  // Update URL without navigation
  const url = new URL(window.location.href)
  if (year === 'all') {
    url.searchParams.delete('year')
  } else {
    url.searchParams.set('year', String(year))
  }
  
  // Use replaceState to update URL without adding to history
  window.history.replaceState({}, '', url.toString())
  
  // Dispatch event for components that need to know about year changes
  window.dispatchEvent(new CustomEvent('financeYearChange', { detail: { accountId, year } }))
}

export const YEAR_CHANGED_EVENT = 'financeYearChange'
