/**
 * Shared test data factory for creating AccountLineItem test fixtures.
 * This eliminates duplicate makeRow helpers across test files.
 */

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

/**
 * Creates a mock AccountLineItem with sensible defaults and optional overrides.
 *
 * @param overrides - Partial AccountLineItem to override defaults
 * @returns A complete AccountLineItem suitable for testing
 */
export function makeRow(overrides: Partial<AccountLineItem> = {}): AccountLineItem {
  return {
    t_id: 1,
    t_date: '2024-01-01',
    t_description: 'Test transaction',
    t_amt: 0,
    t_schc_category: undefined,
    t_qty: 0,
    t_price: undefined,
    t_commission: undefined,
    t_fee: undefined,
    t_type: undefined,
    t_comment: undefined,
    t_cusip: undefined,
    t_symbol: undefined,
    opt_expiration: undefined,
    opt_type: undefined,
    opt_strike: undefined,
    tags: [],
    t_date_posted: undefined,
    t_account_balance: undefined,
    client_expense: undefined,
    t_method: undefined,
    t_source: undefined,
    t_origin: undefined,
    t_from: undefined,
    t_to: undefined,
    t_interest_rate: undefined,
    t_harvested_amount: undefined,
    ...overrides,
  } as AccountLineItem
}

/**
 * Creates an array of mock AccountLineItems with sequential IDs.
 *
 * @param count - Number of rows to create
 * @param baseOverrides - Base overrides to apply to all rows
 * @returns Array of AccountLineItems
 */
export function makeRows(
  count: number,
  baseOverrides: Partial<AccountLineItem> = {}
): AccountLineItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeRow({
      t_id: i + 1,
      t_description: `Row ${i + 1}`,
      ...baseOverrides,
    })
  )
}
