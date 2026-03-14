'use client'
import './TransactionsTable.css'

import currency from 'currency.js'
import { useEffect, useMemo, useState } from 'react'

import { collectTagsFromRows, type TransactionTag } from '@/components/finance/transactionsTableTags'
import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Table } from '@/components/ui/table'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { isDuplicateTransaction } from '@/data/finance/isDuplicateTransaction'
import { fetchWrapper } from '@/fetchWrapper'
import { cn } from '@/lib/utils'

import { ClearFilterButton } from './ClearFilterButton'
import TransactionLotsModal from './lots/TransactionLotsModal'
import { TagApplyButton } from './TagApplyButton'
import TransactionDetailsModal from './TransactionDetailsModal'
import TransactionLinkModal from './TransactionLinkModal'

const DEFAULT_PAGE_SIZE = 5000

interface Props {
  data: AccountLineItem[]
  onDeleteTransaction?: ((transactionId: string) => Promise<void>) | undefined
  enableTagging?: boolean | undefined
  refreshFn?: (() => void) | undefined
  duplicates?: AccountLineItem[] | undefined
  enableLinking?: boolean | undefined
  accountId?: number | undefined
  /** Override the default page size (default: 5000) */
  pageSize?: number | undefined
  /** Transaction ID to scroll to (triggers page auto-selection) */
  highlightTransactionId?: number | undefined
}

function PaginationControls({ 
  currentPage, totalPages, totalRows, pageSize, viewAll, 
  onPageChange, onViewAll 
}: { 
  currentPage: number; totalPages: number; totalRows: number; pageSize: number; viewAll: boolean;
  onPageChange: (page: number) => void; onViewAll: () => void
}) {
  if (totalRows <= pageSize && !viewAll) return null
  
  const startRow = viewAll ? 1 : (currentPage - 1) * pageSize + 1
  const endRow = viewAll ? totalRows : Math.min(currentPage * pageSize, totalRows)

  return (
    <div className="flex items-center justify-between px-2 py-2 text-sm text-muted-foreground">
      <span>
        Showing {startRow.toLocaleString()}–{endRow.toLocaleString()} of {totalRows.toLocaleString()} rows
      </span>
      <div className="flex items-center gap-2">
        {!viewAll && totalPages > 1 && (
          <>
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(1)}>
              ««
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
              «
            </Button>
            <span className="px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
              »
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(totalPages)}>
              »»
            </Button>
          </>
        )}
        {viewAll ? (
          <Button variant="ghost" size="sm" onClick={() => onPageChange(1)}>
            Paginate
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View All
          </Button>
        )}
      </div>
    </div>
  )
}

export default function TransactionsTable({ data, onDeleteTransaction, enableTagging = false, refreshFn, duplicates, enableLinking = false, accountId, pageSize = DEFAULT_PAGE_SIZE, highlightTransactionId }: Props) {
  const [sortField, setSortField] = useState<keyof AccountLineItem>('t_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [descriptionFilter, setDescriptionFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [cusipFilter, setCusipFilter] = useState('')
  const [optExpirationFilter, setOptExpirationFilter] = useState('')
  const [optTypeFilter, setOptTypeFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [memoFilter, setMemoFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [amountFilter, setAmountFilter] = useState('')
  const [qtyFilter, setQtyFilter] = useState('')
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<AccountLineItem | null>(null)
  const [linkTransaction, setLinkTransaction] = useState<AccountLineItem | null>(null)
  const [postDateFilter, setPostDateFilter] = useState('')
  const [cashBalanceFilter, setCashBalanceFilter] = useState('')
  const [deleteConfirmTransaction, setDeleteConfirmTransaction] = useState<AccountLineItem | null>(null)
  const [lotsTransaction, setLotsTransaction] = useState<AccountLineItem | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewAll, setViewAll] = useState(false)

  const isDuplicate = (item: AccountLineItem) => {
    if (!duplicates || duplicates.length === 0) {
      return false
    }
    return isDuplicateTransaction(item, duplicates)
  }

  const hasLinks = (item: AccountLineItem) => {
    return (item.parent_of_t_ids && item.parent_of_t_ids.length > 0) ||
           (item.child_transactions && item.child_transactions.length > 0) ||
           (item.parent_transaction !== null && item.parent_transaction !== undefined)
  }

  const tagsFromRows: TransactionTag[] = useMemo(() => collectTagsFromRows(data), [data])
  const {
    tags: availableTags,
    isLoading: isLoadingTags,
  } = useFinanceTags({
    enabled: enableTagging,
    fallbackTags: tagsFromRows,
  })

  const handleApplyTag = async (tagId: number, tagLabel: string) => {
    const transactionIds = sortedData.map((r) => r.t_id).join(',')
    try {
      await fetchWrapper.post('/api/finance/tags/apply', { tag_id: tagId, transaction_ids: transactionIds })
      if (typeof refreshFn === 'function') {
        refreshFn()
      }
    } catch (error) {
      console.error('Failed to apply tag:', error)
    }
  }

  const renderTransactionTags = (row: AccountLineItem) => (
    <div className="flex gap-1">
      {row.tags?.map((tag) => (
        <Badge
          key={tag.tag_id}
          variant="outline"
          className={`bg-${tag.tag_color}-200 text-${tag.tag_color}-800 dark:bg-${tag.tag_color}-800 dark:text-${tag.tag_color}-200 cursor-pointer hover:opacity-80`}
          onClick={(e) => {
            e.stopPropagation()
            if (tagFilter === tag.tag_label) {
              setTagFilter('')
            } else {
              setTagFilter(tag.tag_label)
            }
          }}
        >
          {tag.tag_label}
        </Badge>
      ))}
    </div>
  )

  const handleSort = (field: keyof AccountLineItem) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const isCategoryColumnEmpty = useMemo(() => data.every((row) => !row.t_schc_category), [data])
  const isQtyColumnEmpty = useMemo(() => data.every((row) => !row.t_qty || Number(row.t_qty) === 0), [data])
  const isPriceColumnEmpty = useMemo(() => data.every((row) => !row.t_price || Number(row.t_price) === 0), [data])
  const isCommissionColumnEmpty = useMemo(
    () => data.every((row) => !row.t_commission || Number(row.t_commission) === 0),
    [data],
  )
  const isFeeColumnEmpty = useMemo(() => data.every((row) => !row.t_fee || Number(row.t_fee) === 0), [data])
  const isTypeColumnEmpty = useMemo(() => data.every((row) => !row.t_type), [data])
  const isMemoColumnEmpty = useMemo(() => data.every((row) => !row.t_comment), [data])
  const isCusipColumnEmpty = useMemo(() => data.every((row) => !row.t_cusip), [data])
  const isSymbolColumnEmpty = useMemo(() => data.every((row) => !row.t_symbol), [data])
  const isOptionExpiryColumnEmpty = useMemo(() => data.every((row) => !row.opt_expiration), [data])
  const isOptionTypeColumnEmpty = useMemo(() => data.every((row) => !row.opt_type), [data])
  const isStrikeColumnEmpty = useMemo(() => data.every((row) => !row.opt_strike || Number(row.opt_strike) === 0), [data])
  const isTagsColumnEmpty = useMemo(() => data.every((row) => !row.tags || row.tags.length === 0), [data])
  const isPostDateColumnEmpty = useMemo(() => data.every((row) => !row.t_date_posted), [data])
  const isCashBalanceColumnEmpty = useMemo(() => data.every((row) => !row.t_account_balance), [data])
  const isClientExpenseColumnEmpty = useMemo(() => data.every((row) => !row.client_expense), [data])

  const filteredData = data.filter(
    (row) =>
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
        (row.tags &&
          row.tags.some((tag) =>
            tagFilter
              .toLowerCase()
              .split(',')
              .map((t) => t.trim())
              .some((filterPart) => tag.tag_label.toLowerCase().includes(filterPart)),
          ))) &&
      (!amountFilter ||
        (row.t_amt || '0')
          .toString()
          .includes(amountFilter)) &&
      (!qtyFilter ||
        (row.t_qty || '0')
          .toString()
          .includes(qtyFilter)) &&
      (!postDateFilter || row.t_date_posted?.includes(postDateFilter)) &&
      (!cashBalanceFilter ||
        (row.t_account_balance || '0')
          .toString()
          .includes(cashBalanceFilter)),
  )

  const sortedData = [...filteredData].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    const direction = sortDirection === 'asc' ? 1 : -1
    if (aVal == null) return 1
    if (bVal == null) return -1
    return aVal < bVal ? -direction : direction
  })

  // Pagination: compute total pages and the visible slice
  const totalRows = sortedData.length
  const totalPages = viewAll ? 1 : Math.max(1, Math.ceil(totalRows / pageSize))

  // Auto-select page when highlightTransactionId is set
  useEffect(() => {
    if (highlightTransactionId && !viewAll) {
      const idx = sortedData.findIndex(r => r.t_id === highlightTransactionId)
      if (idx >= 0) {
        const targetPage = Math.floor(idx / pageSize) + 1
        setCurrentPage(targetPage)
      }
    }
  }, [highlightTransactionId, sortedData, pageSize, viewAll])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [descriptionFilter, typeFilter, categoryFilter, symbolFilter, cusipFilter, optExpirationFilter, optTypeFilter, dateFilter, memoFilter, tagFilter, amountFilter, qtyFilter, postDateFilter, cashBalanceFilter])

  // Clamp page
  const safePage = Math.min(currentPage, totalPages)
  const paginatedData = viewAll ? sortedData : sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Totals are computed from all filtered+sorted data (not just the current page)
  const [totalAmount, totalPositives, totalNegatives] = sortedData.reduce(
    ([total, positives, negatives], row) => {
        const amount = currency(row.t_amt || '0');
        return [
            total.add(amount),
            amount.value > 0 ? positives.add(amount) : positives,
            amount.value < 0 ? negatives.add(amount) : negatives,
        ]
    },
    [currency(0), currency(0), currency(0)],
  )

  const handleUpdateTransaction = async () => {
    if (typeof refreshFn === 'function') {
      refreshFn()
    }
  }

  const handlePageChange = (page: number) => {
    setViewAll(false)
    setCurrentPage(page)
  }

  const handleViewAll = () => {
    setViewAll(true)
  }

  const paginationControls = (
    <PaginationControls
      currentPage={safePage}
      totalPages={totalPages}
      totalRows={totalRows}
      pageSize={pageSize}
      viewAll={viewAll}
      onPageChange={handlePageChange}
      onViewAll={handleViewAll}
    />
  )

  return (
    <>
      {paginationControls}
      <Table style={{ fontSize: '90%' }}>
        <thead>
          <tr>
            <th className="clickable dateCol" onClick={() => handleSort('t_date')}>
              Date {sortField === 't_date' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            {!isPostDateColumnEmpty && (
              <th className="clickable dateCol" onClick={() => handleSort('t_date_posted')}>
                Post Date {sortField === 't_date_posted' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isTypeColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('t_type')}>
                Type {sortField === 't_type' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            <th className="clickable descriptionCol" onClick={() => handleSort('t_description')}>
              Description {sortField === 't_description' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            {!isTagsColumnEmpty && <th>Tags</th>}
            {!isSymbolColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('t_symbol')}>
                Symbol {sortField === 't_symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isQtyColumnEmpty && (
              <th className="clickable text-right pr-1" onClick={() => handleSort('t_qty')}>
                Qty {sortField === 't_qty' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isPriceColumnEmpty && (
              <th className="clickable text-right pr-1" onClick={() => handleSort('t_price')}>
                Price {sortField === 't_price' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isCommissionColumnEmpty && (
              <th className="clickable text-right pr-1" onClick={() => handleSort('t_commission')}>
                Comm. {sortField === 't_commission' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isFeeColumnEmpty && (
              <th className="clickable text-right pr-1" onClick={() => handleSort('t_fee')}>
                Fee {sortField === 't_fee' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            <th className="clickable text-right pr-1" onClick={() => handleSort('t_amt')}>
              Amount {sortField === 't_amt' && (sortDirection === 'asc' ? '↑' : '↓')}
            </th>
            {!isCategoryColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('t_schc_category')}>
                Category {sortField === 't_schc_category' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isCusipColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('t_cusip')}>
                CUSIP {sortField === 't_cusip' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isOptionExpiryColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('opt_expiration')}>
                Option Expiry {sortField === 'opt_expiration' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isOptionTypeColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('opt_type')}>
                Option Type {sortField === 'opt_type' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isStrikeColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('opt_strike')}>
                Strike {sortField === 'opt_strike' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isMemoColumnEmpty && (
              <th className="clickable" onClick={() => handleSort('t_comment')} style={{ width: '200px' }}>
                Memo {sortField === 't_comment' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isCashBalanceColumnEmpty && (
              <th className="clickable text-right" onClick={() => handleSort('t_account_balance')}>
                Cash Balance {sortField === 't_account_balance' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            )}
            {!isClientExpenseColumnEmpty && (
              <th className="text-center">Client</th>
            )}
            {enableLinking && <th className="text-center">Link</th>}
            {accountId && <th className="text-center">Lots</th>}
            <th className="text-center">Details</th>
            {onDeleteTransaction && <th className="text-center">🗑️</th>}
          </tr>
          <tr>
            <th className="position-relative dateCol">
              <input
                style={{ width: '100%', maxWidth: '150px' }}
                type="text"
                placeholder="Filter date..."
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {dateFilter && <ClearFilterButton onClick={() => setDateFilter('')} ariaLabel="Clear date filter" />}
            </th>
            {!isPostDateColumnEmpty && (
              <th className="position-relative dateCol">
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter post date..."
                  value={postDateFilter}
                  onChange={(e) => setPostDateFilter(e.target.value)}
                />
                {postDateFilter && (
                  <ClearFilterButton onClick={() => setPostDateFilter('')} ariaLabel="Clear post date filter" />
                )}
              </th>
            )}
            {!isTypeColumnEmpty && (
              <th className="position-relative">
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter type..."
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                />
                {typeFilter && <ClearFilterButton onClick={() => setTypeFilter('')} ariaLabel="Clear type filter" />}
              </th>
            )}
            <th className="position-relative descriptionCol">
              <input
                style={{ width: '100%', maxWidth: '150px' }}
                type="text"
                placeholder="Filter description..."
                value={descriptionFilter}
                onChange={(e) => setDescriptionFilter(e.target.value)}
              />
              {descriptionFilter && (
                <ClearFilterButton onClick={() => setDescriptionFilter('')} ariaLabel="Clear description filter" />
              )}
            </th>
            {!isTagsColumnEmpty && (
              <th className="position-relative">
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter tags..."
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                />
                {tagFilter && <ClearFilterButton onClick={() => setTagFilter('')} ariaLabel="Clear tag filter" />}
              </th>
            )}
            {!isSymbolColumnEmpty && (
              <th className="position-relative" style={{ width: '100px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter symbol..."
                  value={symbolFilter}
                  onChange={(e) => setSymbolFilter(e.target.value)}
                />
                {symbolFilter && <ClearFilterButton onClick={() => setSymbolFilter('')} ariaLabel="Clear symbol filter" />}
              </th>
            )}
            {!isQtyColumnEmpty && (
              <th className="position-relative" style={{ width: '80px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter qty..."
                  value={qtyFilter}
                  onChange={(e) => setQtyFilter(e.target.value)}
                />
                {qtyFilter && <ClearFilterButton onClick={() => setQtyFilter('')} ariaLabel="Clear qty filter" />}
              </th>
            )}
            {!isPriceColumnEmpty && <th></th>}
            {!isCommissionColumnEmpty && <th></th>}
            {!isFeeColumnEmpty && <th></th>}
            <th className="position-relative" style={{ width: '100px' }}>
              <input
                style={{ width: '100%', maxWidth: '150px' }}
                type="text"
                placeholder="Filter amount..."
                value={amountFilter}
                onChange={(e) => setAmountFilter(e.target.value)}
              />
              {amountFilter && <ClearFilterButton onClick={() => setAmountFilter('')} ariaLabel="Clear amount filter" />}
            </th>
            {!isCategoryColumnEmpty && (
              <th className="position-relative" style={{ width: '140px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter category..."
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                />
                {categoryFilter && (
                  <ClearFilterButton onClick={() => setCategoryFilter('')} ariaLabel="Clear category filter" />
                )}
              </th>
            )}
            {!isCusipColumnEmpty && (
              <th className="position-relative" style={{ width: '100px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter CUSIP..."
                  value={cusipFilter}
                  onChange={(e) => setCusipFilter(e.target.value)}
                />
                {cusipFilter && <ClearFilterButton onClick={() => setCusipFilter('')} ariaLabel="Clear CUSIP filter" />}
              </th>
            )}
            {!isOptionExpiryColumnEmpty && (
              <th className="position-relative" style={{ width: '100px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter option expiry..."
                  value={optExpirationFilter}
                  onChange={(e) => setOptExpirationFilter(e.target.value)}
                />
                {optExpirationFilter && (
                  <ClearFilterButton onClick={() => setOptExpirationFilter('')} ariaLabel="Clear option expiry filter" />
                )}
              </th>
            )}
            {!isOptionTypeColumnEmpty && (
              <th className="position-relative" style={{ width: '100px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter option type..."
                  value={optTypeFilter}
                  onChange={(e) => setOptTypeFilter(e.target.value)}
                />
                {optTypeFilter && (
                  <ClearFilterButton onClick={() => setOptTypeFilter('')} ariaLabel="Clear option type filter" />
                )}
              </th>
            )}
            {!isStrikeColumnEmpty && <th></th>}
            {!isMemoColumnEmpty && (
              <th className="position-relative" style={{ width: '200px' }}>
                <input
                  style={{ width: '100%', maxWidth: '200px' }}
                  type="text"
                  placeholder="Filter memo..."
                  value={memoFilter}
                  onChange={(e) => setMemoFilter(e.target.value)}
                />
                {memoFilter && <ClearFilterButton onClick={() => setMemoFilter('')} ariaLabel="Clear memo filter" />}
              </th>
            )}
            {!isCashBalanceColumnEmpty && (
              <th className="position-relative" style={{ width: '100px' }}>
                <input
                  style={{ width: '100%', maxWidth: '150px' }}
                  type="text"
                  placeholder="Filter balance..."
                  value={cashBalanceFilter}
                  onChange={(e) => setCashBalanceFilter(e.target.value)}
                />
                {cashBalanceFilter && <ClearFilterButton onClick={() => setCashBalanceFilter('')} ariaLabel="Clear balance filter" />}
              </th>
            )}
            {!isClientExpenseColumnEmpty && <th></th>}
            {enableLinking && <th></th>}
            {accountId && <th></th>}
            <th></th>
            {onDeleteTransaction && <th></th>}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, i) => (
            <tr 
              key={row.t_id + ':' + i} 
              className={cn({ 'duplicate-row': isDuplicate(row) })}
              data-transaction-id={row.t_id}
            >
              <td
                className="dateCol"
                onClick={() => {
                  const formattedDate = row.t_date
                  if (dateFilter === formattedDate) {
                    setDateFilter('')
                  } else {
                    setDateFilter(formattedDate || '')
                  }
                }}
              >
                {row.t_date}
              </td>
              {!isPostDateColumnEmpty && (
                <td
                  className="dateCol"
                  onClick={() => {
                    const formattedPostDate = row.t_date_posted
                    if (postDateFilter === formattedPostDate) {
                      setPostDateFilter('')
                    } else {
                      setPostDateFilter(formattedPostDate || '')
                    }
                  }}
                >
                  {row.t_date_posted}
                </td>
              )}
              {!isTypeColumnEmpty && (
                <td
                  onClick={() => {
                    if (typeFilter === row.t_type) {
                      setTypeFilter('')
                    } else {
                      setTypeFilter(row.t_type || '')
                    }
                  }}
                  className="typeCol clickable"
                >
                  {row.t_type}
                </td>
              )}
              <td
                onClick={() => {
                  if (descriptionFilter === row.t_description) {
                    setDescriptionFilter('')
                  } else {
                    setDescriptionFilter(row.t_description || '')
                  }
                }}
                className="descriptionCol clickable"
              >
                {row.t_description}
              </td>
              {!isTagsColumnEmpty && <td className="tagsCol">{renderTransactionTags(row)}</td>}
              {!isSymbolColumnEmpty && (
                <td
                  className={'numericCol'}
                  onClick={() => {
                    if (symbolFilter === row.t_symbol) {
                      setSymbolFilter('')
                    } else {
                      setSymbolFilter(row.t_symbol || '')
                    }
                  }}
                >
                  {row.t_symbol}
                </td>
              )}
              {!isQtyColumnEmpty && (
                <td
                  className={'numericCol text-right clickable'}
                  onClick={() => {
                    const qty = row.t_qty?.toString() || '0';
                    if (qtyFilter === qty) {
                      setQtyFilter('')
                    } else {
                      setQtyFilter(qty)
                    }
                  }}
                >
                  {row.t_qty != null ? row.t_qty.toLocaleString() : ''}
                </td>
              )}
              {!isPriceColumnEmpty && (
                <td className={'numericCol text-right pr-1'}>
                  {row.t_price != null && Number(row.t_price) !== 0 ? row.t_price : ''}
                </td>
              )}
              {!isCommissionColumnEmpty && (
                <td className={'numericCol text-right pr-1'}>
                  {row.t_commission != null && Number(row.t_commission) !== 0 ? row.t_commission : ''}
                </td>
              )}
              {!isFeeColumnEmpty && (
                <td className={'numericCol text-right pr-1'}>
                  {row.t_fee != null && Number(row.t_fee) !== 0 ? row.t_fee : ''}
                </td>
              )}
              <td
                className={'numericCol clickable text-right pr-1'}
                style={{
                  color: Number(row.t_amt) >= 0 ? 'green' : 'red',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  const amt = row.t_amt?.toString() || '0';
                  if (amountFilter === amt) {
                    setAmountFilter('')
                  } else {
                    setAmountFilter(amt)
                  }
                }}
              >
                {row.t_amt || '0'}
              </td>
              {!isCategoryColumnEmpty && (
                <td
                  onClick={() => {
                    if (categoryFilter === (row.t_schc_category || '-')) {
                      setCategoryFilter('')
                    } else {
                      setCategoryFilter(row.t_schc_category || '-')
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {row.t_schc_category ?? '-'}
                </td>
              )}
              {!isCusipColumnEmpty && (
                <td
                  style={{ width: '100px', cursor: 'pointer' }}
                  onClick={() => {
                    if (cusipFilter === row.t_cusip) {
                      setCusipFilter('')
                    } else {
                      setCusipFilter(row.t_cusip || '')
                    }
                  }}
                >
                  {row.t_cusip}
                </td>
              )}
              {!isOptionExpiryColumnEmpty && (
                <td
                  className={'numericCol'}
                  onClick={() => {
                    const formattedExpiry = row.opt_expiration?.slice(0, 10)
                    if (optExpirationFilter === formattedExpiry) {
                      setOptExpirationFilter('')
                    } else {
                      setOptExpirationFilter(formattedExpiry || '')
                    }
                  }}
                >
                  {row.opt_expiration?.slice(0, 10) ?? ''}
                </td>
              )}
              {!isOptionTypeColumnEmpty && (
                <td
                  className={'numericCol'}
                  onClick={() => {
                    if (optTypeFilter === row.opt_type) {
                      setOptTypeFilter('')
                    } else {
                      setOptTypeFilter(row.opt_type || '')
                    }
                  }}
                >
                  {row.opt_type}
                </td>
              )}
              {!isStrikeColumnEmpty && (
                <td className={'numericCol'}>
                  {row.opt_strike != null ? row.opt_strike : ''}
                </td>
              )}
              {!isMemoColumnEmpty && <td>{row.t_comment}</td>}
              {!isCashBalanceColumnEmpty && (
                <td className={'numericCol text-right'}>
                  {row.t_account_balance != null ? currency(row.t_account_balance).format() : ''}
                </td>
              )}
              {!isClientExpenseColumnEmpty && (
                <td className="text-center">
                  {row.client_expense?.client_company && (
                    <a
                      href={`/client/portal/${row.client_expense.client_company.slug}`}
                      className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"
                      title={`Billed to ${row.client_expense.client_company.company_name}`}
                    >
                      {row.client_expense.client_company.company_name}
                    </a>
                  )}
                </td>
              )}
              {enableLinking && (
                <td>
                  <Button 
                    variant={hasLinks(row) ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setLinkTransaction(row)}
                    className={hasLinks(row) ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    title={hasLinks(row) ? "View linked transactions" : "Link transaction"}
                  >
                    🔗
                  </Button>
                </td>
              )}
              {accountId && (
                <td>
                  {row.t_symbol && (row.t_type === 'Sell' || row.t_type === 'Buy' || row.t_type === 'SELL' || row.t_type === 'BUY' || (row.t_qty && Number(row.t_qty) !== 0)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLotsTransaction(row)}
                      title="View/Edit Lots"
                    >
                      📦
                    </Button>
                  )}
                </td>
              )}
              <td>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setSelectedTransaction(row)}
                >
                  Details
                </Button>
              </td>
              {onDeleteTransaction && (
                <td style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => setDeleteConfirmTransaction(row)}
                    className="btn btn-link p-0"
                    aria-label="Delete transaction"
                  >
                    🗑️
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <TotalCell />
            {!isPostDateColumnEmpty && <TotalCell />}
            {!isTypeColumnEmpty && <TotalCell />}
            <TotalCell />
            {!isTagsColumnEmpty && <TotalCell />}
            {!isSymbolColumnEmpty && <TotalCell />}
            {!isQtyColumnEmpty && <TotalCell />}
            {!isPriceColumnEmpty && <TotalCell />}
            {!isCommissionColumnEmpty && <TotalCell />}
            {!isFeeColumnEmpty && <TotalCell />}
            <td className="totalCell numericCol text-right">
              <strong>
                {totalPositives.format()} (Credits) <br />
                {totalNegatives.format()} (Debits) <br />= {totalAmount.format()} (Net)
              </strong>
            </td>
            {!isCategoryColumnEmpty && <TotalCell />}
            {!isCusipColumnEmpty && <TotalCell />}
            {!isOptionExpiryColumnEmpty && <TotalCell />}
            {!isOptionTypeColumnEmpty && <TotalCell />}
            {!isStrikeColumnEmpty && <TotalCell />}
            {!isMemoColumnEmpty && <TotalCell />}
            {!isCashBalanceColumnEmpty && <TotalCell />}
            {!isClientExpenseColumnEmpty && <TotalCell />}
            {enableLinking && <TotalCell />}
            {accountId && <TotalCell />}
            <TotalCell />
            {onDeleteTransaction && <TotalCell />}
          </tr>
        </tfoot>
      </Table>

      {paginationControls}

      {enableTagging && (
        <div className="mt-4">
          {sortedData.length > 1000 ? (
            <Alert variant="destructive">
              <AlertDescription>
                There are too many items to tag ({sortedData.length.toLocaleString()} transactions). Please refine your
                view to fewer than 1,000 items before applying tags.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="p-4 border rounded flex flex-wrap items-center gap-4">
              <span>Apply tag to {sortedData.length} selected transactions:</span>
              {isLoadingTags ? (
                <Spinner size="small" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <TagApplyButton
                      key={tag.tag_id}
                      tagId={tag.tag_id}
                      tagLabel={tag.tag_label}
                      tagColor={tag.tag_color}
                      disabled={sortedData.length === 0}
                      onApplyTag={handleApplyTag}
                    />
                  ))}
                  <a href="/finance/tags" className="ml-auto">
                    <Button variant="secondary" size="sm">
                      Manage Tags
                    </Button>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedTransaction && (
        <TransactionDetailsModal
          transaction={selectedTransaction}
          isOpen={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onSave={handleUpdateTransaction}
        />
      )}

      {linkTransaction && (
        <TransactionLinkModal
          transaction={linkTransaction}
          isOpen={!!linkTransaction}
          onClose={() => setLinkTransaction(null)}
          onLinkChanged={() => {
            if (typeof refreshFn === 'function') {
              refreshFn()
            }
          }}
        />
      )}

      {lotsTransaction && accountId && (
        <TransactionLotsModal
          accountId={accountId}
          transactionId={lotsTransaction.t_id!}
          isOpen={!!lotsTransaction}
          onClose={() => setLotsTransaction(null)}
        />
      )}

      <AlertDialog open={!!deleteConfirmTransaction} onOpenChange={() => setDeleteConfirmTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
              {deleteConfirmTransaction && (
                <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm">
                  <p><strong>Date:</strong> {deleteConfirmTransaction.t_date}</p>
                  <p><strong>Description:</strong> {deleteConfirmTransaction.t_description}</p>
                  <p><strong>Amount:</strong> {currency(deleteConfirmTransaction.t_amt || 0).format()}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirmTransaction && onDeleteTransaction) {
                  onDeleteTransaction(deleteConfirmTransaction.t_id?.toString() || '')
                  setDeleteConfirmTransaction(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const TotalCell = ({ children, label }: { children?: any; label?: string }) => (
  <td className="totalCell">
    {children}
    {label ? <strong>{label}</strong> : null}
  </td>
)
