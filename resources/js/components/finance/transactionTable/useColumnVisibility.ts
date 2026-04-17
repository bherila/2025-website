import { useMemo } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

export interface ColumnVisibility {
  isCategoryColumnEmpty: boolean
  isQtyColumnEmpty: boolean
  isPriceColumnEmpty: boolean
  isCommissionColumnEmpty: boolean
  isFeeColumnEmpty: boolean
  isTypeColumnEmpty: boolean
  isMemoColumnEmpty: boolean
  isCusipColumnEmpty: boolean
  isSymbolColumnEmpty: boolean
  isOptionExpiryColumnEmpty: boolean
  isOptionTypeColumnEmpty: boolean
  isStrikeColumnEmpty: boolean
  isTagsColumnEmpty: boolean
  isPostDateColumnEmpty: boolean
  isCashBalanceColumnEmpty: boolean
  isClientExpenseColumnEmpty: boolean
}

export function useColumnVisibility(data: AccountLineItem[]): ColumnVisibility {
  return useMemo(() => ({
    isCategoryColumnEmpty: data.every((row) => !row.t_schc_category),
    isQtyColumnEmpty: data.every((row) => !row.t_qty || Number(row.t_qty) === 0),
    isPriceColumnEmpty: data.every((row) => !row.t_price || Number(row.t_price) === 0),
    isCommissionColumnEmpty: data.every((row) => !row.t_commission || Number(row.t_commission) === 0),
    isFeeColumnEmpty: data.every((row) => !row.t_fee || Number(row.t_fee) === 0),
    isTypeColumnEmpty: data.every((row) => !row.t_type),
    isMemoColumnEmpty: data.every((row) => !row.t_comment),
    isCusipColumnEmpty: data.every((row) => !row.t_cusip),
    isSymbolColumnEmpty: data.every((row) => !row.t_symbol),
    isOptionExpiryColumnEmpty: data.every((row) => !row.opt_expiration),
    isOptionTypeColumnEmpty: data.every((row) => !row.opt_type),
    isStrikeColumnEmpty: data.every((row) => !row.opt_strike || Number(row.opt_strike) === 0),
    isTagsColumnEmpty: data.every((row) => !row.tags || row.tags.length === 0),
    isPostDateColumnEmpty: data.every((row) => !row.t_date_posted),
    isCashBalanceColumnEmpty: data.every((row) => !row.t_account_balance),
    isClientExpenseColumnEmpty: data.every((row) => !row.client_expense),
  }), [data])
}
