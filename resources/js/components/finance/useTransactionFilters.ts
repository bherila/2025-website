import { useMemo, useState } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

export function useTransactionFilters(data: AccountLineItem[]) {
  const [dateFilter, setDateFilter] = useState('')
  const [descriptionFilter, setDescriptionFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [cusipFilter, setCusipFilter] = useState('')
  const [optExpirationFilter, setOptExpirationFilter] = useState('')
  const [optTypeFilter, setOptTypeFilter] = useState('')
  const [memoFilter, setMemoFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [amountFilter, setAmountFilter] = useState('')
  const [qtyFilter, setQtyFilter] = useState('')
  const [postDateFilter, setPostDateFilter] = useState('')
  const [cashBalanceFilter, setCashBalanceFilter] = useState('')

  const filteredData = useMemo(() => data.filter(row =>
    (!dateFilter || row.t_date?.includes(dateFilter)) &&
    (!descriptionFilter || row.t_description?.toLowerCase().includes(descriptionFilter.toLowerCase())) &&
    (!typeFilter || (row.t_type || '-').toLowerCase().includes(typeFilter.toLowerCase())) &&
    (!categoryFilter || (row.t_schc_category || '-').toLowerCase().includes(categoryFilter.toLowerCase())) &&
    (!symbolFilter || row.t_symbol?.toLowerCase().includes(symbolFilter.toLowerCase())) &&
    (!cusipFilter || row.t_cusip?.toLowerCase().includes(cusipFilter.toLowerCase())) &&
    (!optExpirationFilter || row.opt_expiration?.includes(optExpirationFilter.toLowerCase())) &&
    (!optTypeFilter || row.opt_type?.toLowerCase().includes(optTypeFilter.toLowerCase())) &&
    (!memoFilter || (row.t_comment || '-').toLowerCase().includes(memoFilter.toLowerCase())) &&
    (!tagFilter ||
      (row.tags && row.tags.some((tag) =>
        tagFilter.toLowerCase().split(',').map((t) => t.trim()).some((filterPart) => tag.tag_label.toLowerCase().includes(filterPart))
      ))) &&
    (!amountFilter || (row.t_amt || '0').toString().includes(amountFilter)) &&
    (!qtyFilter || (row.t_qty || '0').toString().includes(qtyFilter)) &&
    (!postDateFilter || row.t_date_posted?.includes(postDateFilter)) &&
    (!cashBalanceFilter || (row.t_account_balance || '0').toString().includes(cashBalanceFilter))
  ), [data, dateFilter, descriptionFilter, typeFilter, categoryFilter, symbolFilter, cusipFilter, optExpirationFilter, optTypeFilter, memoFilter, tagFilter, amountFilter, qtyFilter, postDateFilter, cashBalanceFilter])

  return {
    dateFilter, setDateFilter,
    descriptionFilter, setDescriptionFilter,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    symbolFilter, setSymbolFilter,
    cusipFilter, setCusipFilter,
    optExpirationFilter, setOptExpirationFilter,
    optTypeFilter, setOptTypeFilter,
    memoFilter, setMemoFilter,
    tagFilter, setTagFilter,
    amountFilter, setAmountFilter,
    qtyFilter, setQtyFilter,
    postDateFilter, setPostDateFilter,
    cashBalanceFilter, setCashBalanceFilter,
    filteredData,
  }
}
