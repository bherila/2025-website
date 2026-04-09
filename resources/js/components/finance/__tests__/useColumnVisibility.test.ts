// renderHook is not needed here — useColumnVisibility is a pure useMemo hook.
// We call it via renderHook to stay close to real usage.
import { renderHook } from '@testing-library/react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

import { useColumnVisibility } from '../useColumnVisibility'

function makeRow(overrides: Partial<AccountLineItem> = {}): AccountLineItem {
  return {
    t_id: 1,
    t_date: '2024-01-01',
    t_description: 'Test',
    t_amt: '0',
    t_schc_category: undefined,
    t_qty: undefined,
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
    ...overrides,
  } as AccountLineItem
}

describe('useColumnVisibility', () => {
  it('all columns empty when all rows have null/zero values', () => {
    const rows = [makeRow(), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isCategoryColumnEmpty).toBe(true)
    expect(result.current.isQtyColumnEmpty).toBe(true)
    expect(result.current.isPriceColumnEmpty).toBe(true)
    expect(result.current.isCommissionColumnEmpty).toBe(true)
    expect(result.current.isFeeColumnEmpty).toBe(true)
    expect(result.current.isTypeColumnEmpty).toBe(true)
    expect(result.current.isMemoColumnEmpty).toBe(true)
    expect(result.current.isCusipColumnEmpty).toBe(true)
    expect(result.current.isSymbolColumnEmpty).toBe(true)
    expect(result.current.isOptionExpiryColumnEmpty).toBe(true)
    expect(result.current.isOptionTypeColumnEmpty).toBe(true)
    expect(result.current.isStrikeColumnEmpty).toBe(true)
    expect(result.current.isTagsColumnEmpty).toBe(true)
    expect(result.current.isPostDateColumnEmpty).toBe(true)
    expect(result.current.isCashBalanceColumnEmpty).toBe(true)
    expect(result.current.isClientExpenseColumnEmpty).toBe(true)
  })

  it('symbol column not empty when at least one row has a symbol', () => {
    const rows = [makeRow({ t_symbol: 'AAPL' }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isSymbolColumnEmpty).toBe(false)
  })

  it('type column not empty when at least one row has a type', () => {
    const rows = [makeRow({ t_type: 'BUY' }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isTypeColumnEmpty).toBe(false)
  })

  it('memo column not empty when at least one row has a comment', () => {
    const rows = [makeRow({ t_comment: 'some memo' }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isMemoColumnEmpty).toBe(false)
  })

  it('tags column not empty when at least one row has tags', () => {
    const rows = [
      makeRow({ tags: [{ tag_id: 1, tag_label: 'business', tag_userid: '1', tag_color: 'blue' }] }),
      makeRow(),
    ]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isTagsColumnEmpty).toBe(false)
  })

  it('qty column not empty when at least one row has non-zero qty', () => {
    const rows = [makeRow({ t_qty: 5 }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isQtyColumnEmpty).toBe(false)
  })

  it('empty data array: all columns considered empty', () => {
    const { result } = renderHook(() => useColumnVisibility([]))
    expect(result.current.isSymbolColumnEmpty).toBe(true)
    expect(result.current.isTypeColumnEmpty).toBe(true)
  })

  it('category column not empty when at least one row has a category', () => {
    const rows = [makeRow({ t_schc_category: 'Office' }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isCategoryColumnEmpty).toBe(false)
  })

  it('post date column not empty when at least one row has t_date_posted', () => {
    const rows = [makeRow({ t_date_posted: '2024-01-02' }), makeRow()]
    const { result } = renderHook(() => useColumnVisibility(rows))
    expect(result.current.isPostDateColumnEmpty).toBe(false)
  })
})
