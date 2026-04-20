/**
 * States with full tax-table support in the Tax Preview.
 * Kept in sync with `App\Enums\Finance\TaxState`.
 */

export const SUPPORTED_TAX_STATES = [
  { code: 'CA' as const, name: 'California' },
  { code: 'NY' as const, name: 'New York' },
]

export type SupportedStateCode = (typeof SUPPORTED_TAX_STATES)[number]['code']

export const SUPPORTED_TAX_STATE_CODES: readonly SupportedStateCode[] =
  SUPPORTED_TAX_STATES.map(s => s.code)
