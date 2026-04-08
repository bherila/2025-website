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

import TransactionLotsModal from './lots/TransactionLotsModal'
import { TagSelect } from './rules_engine/TagSelect'
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
  pageSize?: number | undefined
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
    <div className="flex items-center justify-between px-1 py-3 text-xs font-mono text-muted-foreground border-b border-border mb-4">
      <span>
        SHOWING {startRow.toLocaleString()}–{endRow.toLocaleString()} OF {totalRows.toLocaleString()} ROWS
      </span>
      <div className="flex items-center gap-2">
        {!viewAll && totalPages > 1 && (
          <>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage <= 1} onClick={() => onPageChange(1)}>
              ««
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
              «
            </Button>
            <span className="px-2 uppercase tracking-wider">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
              »
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage >= totalPages} onClick={() => onPageChange(totalPages)}>
              »»
            </Button>
          </>
        )}
        {viewAll ? (
          <Button variant="ghost" size="sm" className="h-7 font-mono text-[10px] uppercase tracking-wider" onClick={() => onPageChange(1)}>
            Paginate
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 font-mono text-[10px] uppercase tracking-wider" onClick={onViewAll}>
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
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)

  const isDuplicate = (item: AccountLineItem) => {
    if (!duplicates || duplicates.length === 0) return false
    return isDuplicateTransaction(item, duplicates)
  }

  const hasLinks = (item: AccountLineItem) => {
    return (item.parent_of_t_ids && item.parent_of_t_ids.length > 0) ||
           (item.child_transactions && item.child_transactions.length > 0) ||
           (item.parent_transaction !== null && item.parent_transaction !== undefined)
  }

  const tagsFromRows: TransactionTag[] = useMemo(() => collectTagsFromRows(data), [data])
  const { tags: availableTags, isLoading: isLoadingTags } = useFinanceTags({
    enabled: enableTagging,
    fallbackTags: tagsFromRows,
  })

  const handleApplyTag = async (tagId: number) => {
    const transactionIds = sortedData.map((r) => r.t_id).filter((id) => id != null).join(',')
    if (!transactionIds) return
    try {
      await fetchWrapper.post('/api/finance/tags/apply', { tag_id: tagId, transaction_ids: transactionIds })
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to apply tag:', error)
    }
  }

  const [removeTagsConfirmOpen, setRemoveTagsConfirmOpen] = useState(false)
  const handleRemoveAllTags = async (tagId?: number) => {
    const transactionIds = sortedData.map((r) => r.t_id).filter((id) => id != null).join(',')
    if (!transactionIds) return
    try {
      const payload: Record<string, unknown> = { transaction_ids: transactionIds }
      if (tagId != null) payload.tag_id = tagId
      await fetchWrapper.post('/api/finance/tags/remove', payload)
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to remove tags:', error)
    }
  }

  const handleUpdateTransaction = async (_updatedTransaction: Partial<AccountLineItem>): Promise<void> => {
    if (typeof refreshFn === 'function') {
      await refreshFn()
    }
  }

  const renderTransactionTags = (row: AccountLineItem) => (
    <div className="flex flex-wrap gap-1">
      {row.tags?.map((tag) => (
        <Badge
          key={tag.tag_id}
          variant="outline"
          className={cn(
            "font-mono text-[9px] px-1.5 py-0 rounded-sm cursor-pointer hover:opacity-80 transition-opacity",
            "border-border bg-surface text-muted-foreground" 
          )}
          style={{ borderColor: tag.tag_color, color: tag.tag_color }}
          onClick={(e) => {
            e.stopPropagation()
            setTagFilter(tagFilter === tag.tag_label ? '' : tag.tag_label)
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

  // Column visibility checks
  const isCategoryColumnEmpty = useMemo(() => data.every((row) => !row.t_schc_category), [data])
  const isQtyColumnEmpty = useMemo(() => data.every((row) => !row.t_qty || Number(row.t_qty) === 0), [data])
  const isPriceColumnEmpty = useMemo(() => data.every((row) => !row.t_price || Number(row.t_price) === 0), [data])
  const isCommissionColumnEmpty = useMemo(() => data.every((row) => !row.t_commission || Number(row.t_commission) === 0), [data])
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

  const filteredData = data.filter(row =>
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
  )

  const sortedData = [...filteredData].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    const direction = sortDirection === 'asc' ? 1 : -1
    if (aVal == null) return 1
    if (bVal == null) return -1
    return aVal < bVal ? -direction : direction
  })

  const totalRows = sortedData.length
  const totalPages = viewAll ? 1 : Math.max(1, Math.ceil(totalRows / pageSize))

  useEffect(() => {
    if (highlightTransactionId && !viewAll) {
      const idx = sortedData.findIndex(r => r.t_id === highlightTransactionId)
      if (idx >= 0) {
        const targetPage = Math.floor(idx / pageSize) + 1
        setCurrentPage(targetPage)
      }
    }
  }, [highlightTransactionId, sortedData, pageSize, viewAll])

  useEffect(() => {
    setCurrentPage(1)
  }, [descriptionFilter, typeFilter, categoryFilter, symbolFilter, cusipFilter, optExpirationFilter, optTypeFilter, dateFilter, memoFilter, tagFilter, amountFilter, qtyFilter, postDateFilter, cashBalanceFilter])

  const safePage = Math.min(currentPage, totalPages)
  const paginatedData = viewAll ? sortedData : sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)

  const [totalAmount, totalPositives, totalNegatives] = sortedData.reduce(
    ([total, positives, negatives], row) => {
        const amount = currency(row.t_amt || '0')
        return [
            total.add(amount),
            amount.value > 0 ? positives.add(amount) : positives,
            amount.value < 0 ? negatives.add(amount) : negatives,
        ]
    },
    [currency(0), currency(0), currency(0)],
  )

  const thClass = "text-left py-3 px-2 text-[10px] tracking-widest uppercase text-muted-foreground font-medium align-bottom whitespace-nowrap cursor-pointer hover:text-foreground transition-colors"
  const tdClass = "py-2 px-2 border-b border-table-border align-top"
  const inputClass = "bg-background/50 border border-border text-foreground text-xs rounded px-2 py-1 w-full mt-1 focus:ring-1 focus:ring-ring outline-none font-mono"

  return (
    <>
      {/* Summary Card Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
          <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Net Amount</div>
          <div className={cn("font-mono text-xl font-semibold", totalAmount.value >= 0 ? "text-success" : "text-destructive")}>
            {totalAmount.format()}
          </div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
          <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Total Credits</div>
          <div className="font-mono text-xl font-semibold text-success">{totalPositives.format()}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
          <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Total Debits</div>
          <div className="font-mono text-xl font-semibold text-destructive">{totalNegatives.format()}</div>
        </div>
        <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
          <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Rows in View</div>
          <div className="font-mono text-xl font-semibold text-foreground">{totalRows.toLocaleString()}</div>
        </div>
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        totalRows={totalRows}
        pageSize={pageSize}
        viewAll={viewAll}
        onPageChange={(page) => setCurrentPage(page)}
        onViewAll={() => setViewAll(true)}
      />

      <div className="relative w-full overflow-x-auto border border-border rounded-sm bg-card">
        <Table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className={thClass} onClick={() => handleSort('t_date')}>
                <div>Date {sortField === 't_date' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                <div className="relative mt-1">
                  <input className={inputClass} placeholder="Filter..." value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
              </th>
              
              {!isPostDateColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_date_posted')}>
                  <div>Post Date {sortField === 't_date_posted' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={postDateFilter} onChange={(e) => setPostDateFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isTypeColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_type')}>
                  <div>Type {sortField === 't_type' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              <th className={thClass} onClick={() => handleSort('t_description')}>
                <div>Description {sortField === 't_description' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                <div className="relative mt-1">
                  <input className={inputClass} placeholder="Filter..." value={descriptionFilter} onChange={(e) => setDescriptionFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
              </th>
              
              {!isTagsColumnEmpty && (
                <th className={cn(thClass, "cursor-default")}>
                  <div>Tags</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isSymbolColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_symbol')}>
                  <div>Symbol {sortField === 't_symbol' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isQtyColumnEmpty && (
                <th className={cn(thClass, "text-right")} onClick={() => handleSort('t_qty')}>
                  <div>Qty {sortField === 't_qty' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={qtyFilter} onChange={(e) => setQtyFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isPriceColumnEmpty && <th className={cn(thClass, "text-right")} onClick={() => handleSort('t_price')}>Price</th>}
              {!isCommissionColumnEmpty && <th className={cn(thClass, "text-right")} onClick={() => handleSort('t_commission')}>Comm.</th>}
              {!isFeeColumnEmpty && <th className={cn(thClass, "text-right")} onClick={() => handleSort('t_fee')}>Fee</th>}
              
              <th className={cn(thClass, "text-right")} onClick={() => handleSort('t_amt')}>
                <div>Amount {sortField === 't_amt' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                <div className="relative mt-1">
                  <input className={inputClass} placeholder="Filter..." value={amountFilter} onChange={(e) => setAmountFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                </div>
              </th>
              
              {!isCategoryColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_schc_category')}>
                  <div>Category {sortField === 't_schc_category' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isCusipColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_cusip')}>
                  <div>CUSIP {sortField === 't_cusip' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={cusipFilter} onChange={(e) => setCusipFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isOptionExpiryColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('opt_expiration')}>
                  <div>Expiry {sortField === 'opt_expiration' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                </th>
              )}
              
              {!isOptionTypeColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('opt_type')}>
                  <div>Opt Type {sortField === 'opt_type' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                </th>
              )}
              
              {!isStrikeColumnEmpty && <th className={thClass} onClick={() => handleSort('opt_strike')}>Strike</th>}
              
              {!isMemoColumnEmpty && (
                <th className={thClass} onClick={() => handleSort('t_comment')}>
                  <div>Memo {sortField === 't_comment' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                  <div className="relative mt-1">
                    <input className={inputClass} placeholder="Filter..." value={memoFilter} onChange={(e) => setMemoFilter(e.target.value)} onClick={e => e.stopPropagation()} />
                  </div>
                </th>
              )}
              
              {!isCashBalanceColumnEmpty && (
                <th className={cn(thClass, "text-right whitespace-nowrap")} onClick={() => handleSort('t_account_balance')}>
                  <div>Balance {sortField === 't_account_balance' && (sortDirection === 'asc' ? '↑' : '↓')}</div>
                </th>
              )}
              
              {!isClientExpenseColumnEmpty && <th className={cn(thClass, "text-center cursor-default")}>Client</th>}
              {enableLinking && <th className={cn(thClass, "text-center cursor-default")}>Link</th>}
              {accountId && <th className={cn(thClass, "text-center cursor-default")}>Lots</th>}
              <th className={cn(thClass, "text-center cursor-default")}>Details</th>
              {onDeleteTransaction && <th className={cn(thClass, "text-center cursor-default")}>🗑️</th>}
            </tr>
          </thead>
          
          <tbody className="[&_tr:last-child]:border-0 hover:[&>tr]:bg-muted/20">
            {paginatedData.map((row, i) => (
              <tr 
                key={row.t_id + ':' + i} 
                className={cn("transition-colors", isDuplicate(row) && "bg-destructive/10 hover:bg-destructive/20")}
                data-transaction-id={row.t_id}
              >
                <td className={cn(tdClass, "font-mono text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground")} onClick={() => setDateFilter(dateFilter === row.t_date ? '' : (row.t_date || ''))}>
                  {row.t_date}
                </td>
                
                {!isPostDateColumnEmpty && (
                  <td className={cn(tdClass, "font-mono text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground")} onClick={() => setPostDateFilter(postDateFilter === row.t_date_posted ? '' : (row.t_date_posted || ''))}>
                    {row.t_date_posted}
                  </td>
                )}
                
                {!isTypeColumnEmpty && (
                  <td className={cn(tdClass, "cursor-pointer hover:text-primary")} onClick={() => setTypeFilter(typeFilter === row.t_type ? '' : (row.t_type || ''))}>
                    {row.t_type}
                  </td>
                )}
                
                <td className={cn(tdClass, "cursor-pointer hover:text-primary font-medium")} onClick={() => setDescriptionFilter(descriptionFilter === row.t_description ? '' : (row.t_description || ''))}>
                  {row.t_description}
                </td>
                
                {!isTagsColumnEmpty && <td className={tdClass}>{renderTransactionTags(row)}</td>}
                
                {!isSymbolColumnEmpty && (
                  <td className={cn(tdClass, "font-mono cursor-pointer hover:text-primary")} onClick={() => setSymbolFilter(symbolFilter === row.t_symbol ? '' : (row.t_symbol || ''))}>
                    {row.t_symbol}
                  </td>
                )}
                
                {!isQtyColumnEmpty && (
                  <td className={cn(tdClass, "font-mono tabular-nums text-right cursor-pointer hover:text-primary")} onClick={() => setQtyFilter(qtyFilter === (row.t_qty?.toString() || '0') ? '' : (row.t_qty?.toString() || '0'))}>
                    {row.t_qty != null ? row.t_qty.toLocaleString() : ''}
                  </td>
                )}
                
                {!isPriceColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_price != null && Number(row.t_price) !== 0 ? row.t_price : ''}</td>}
                {!isCommissionColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_commission != null && Number(row.t_commission) !== 0 ? row.t_commission : ''}</td>}
                {!isFeeColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_fee != null && Number(row.t_fee) !== 0 ? row.t_fee : ''}</td>}
                
                <td 
                  className={cn(
                    tdClass, 
                    "font-mono tabular-nums text-right font-semibold cursor-pointer hover:opacity-80",
                    Number(row.t_amt) >= 0 ? "text-success" : "text-destructive"
                  )}
                  onClick={() => setAmountFilter(amountFilter === (row.t_amt?.toString() || '0') ? '' : (row.t_amt?.toString() || '0'))}
                >
                  {row.t_amt || '0'}
                </td>
                
                {!isCategoryColumnEmpty && (
                  <td className={cn(tdClass, "cursor-pointer hover:text-primary text-xs")} onClick={() => setCategoryFilter(categoryFilter === (row.t_schc_category || '-') ? '' : (row.t_schc_category || '-'))}>
                    {row.t_schc_category ?? '-'}
                  </td>
                )}
                
                {!isCusipColumnEmpty && (
                  <td className={cn(tdClass, "font-mono text-xs cursor-pointer hover:text-primary")} onClick={() => setCusipFilter(cusipFilter === row.t_cusip ? '' : (row.t_cusip || ''))}>
                    {row.t_cusip}
                  </td>
                )}
                
                {!isOptionExpiryColumnEmpty && (
                  <td className={cn(tdClass, "font-mono text-xs cursor-pointer hover:text-primary")} onClick={() => setOptExpirationFilter(optExpirationFilter === row.opt_expiration?.slice(0, 10) ? '' : (row.opt_expiration?.slice(0, 10) || ''))}>
                    {row.opt_expiration?.slice(0, 10) ?? ''}
                  </td>
                )}
                
                {!isOptionTypeColumnEmpty && (
                  <td className={cn(tdClass, "text-xs cursor-pointer hover:text-primary")} onClick={() => setOptTypeFilter(optTypeFilter === row.opt_type ? '' : (row.opt_type || ''))}>
                    {row.opt_type}
                  </td>
                )}
                
                {!isStrikeColumnEmpty && <td className={cn(tdClass, "font-mono text-xs")}>{row.opt_strike != null ? row.opt_strike : ''}</td>}
                
                {!isMemoColumnEmpty && (
                  <td className={cn(tdClass, "text-xs text-muted-foreground max-w-xs truncate text-ellipsis cursor-pointer transition-all")} onClick={() => setMemoFilter(memoFilter === row.t_comment ? '' : (row.t_comment || ''))}>
                    {row.t_comment}
                  </td>
                )}
                
                {!isCashBalanceColumnEmpty && (
                  <td className={cn(tdClass, "font-mono tabular-nums text-right whitespace-nowrap text-muted-foreground")}>
                    {row.t_account_balance != null ? currency(row.t_account_balance).format() : ''}
                  </td>
                )}
                
                {!isClientExpenseColumnEmpty && (
                  <td className={cn(tdClass, "text-center")}>
                    {row.client_expense?.client_company && (
                      <a href={`/client/portal/${row.client_expense.client_company.slug}`} className="text-primary hover:underline text-[10px] uppercase font-semibold">
                        {row.client_expense.client_company.company_name}
                      </a>
                    )}
                  </td>
                )}
                
                {enableLinking && (
                  <td className={cn(tdClass, "text-center")}>
                    <Button variant={hasLinks(row) ? "default" : "outline"} size="sm" className={cn("h-6 px-2 text-[10px]", hasLinks(row) && "bg-success hover:bg-success/80 text-success-foreground border-success")} onClick={() => setLinkTransaction(row)}>
                      🔗
                    </Button>
                  </td>
                )}
                
                {accountId && (
                  <td className={cn(tdClass, "text-center")}>
                    {row.t_symbol && (row.t_type?.toUpperCase() === 'SELL' || row.t_type?.toUpperCase() === 'BUY' || (row.t_qty && Number(row.t_qty) !== 0)) && (
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setLotsTransaction(row)}>
                        📦
                      </Button>
                    )}
                  </td>
                )}
                
                <td className={cn(tdClass, "text-center")}>
                  <Button variant="secondary" size="sm" className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider" onClick={() => setSelectedTransaction(row)}>
                    Details
                  </Button>
                </td>
                
                {onDeleteTransaction && (
                  <td className={cn(tdClass, "text-center")}>
                    <button onClick={() => setDeleteConfirmTransaction(row)} className="text-muted-foreground hover:text-destructive transition-colors">
                      🗑️
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {enableTagging && (
        <div className="mt-6 mb-8">
          {sortedData.length > 1000 ? (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
              <AlertDescription className="font-mono text-xs">
                Too many items to tag ({sortedData.length.toLocaleString()} transactions). Refine view to &lt; 1,000 items.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="p-4 border border-border bg-card rounded-sm flex flex-wrap items-center gap-3 shadow-sm">
              <span className="text-xs font-mono tracking-wide uppercase text-muted-foreground">
                Action on {sortedData.length} row{sortedData.length !== 1 ? 's' : ''}:
              </span>
              {isLoadingTags ? (
                <Spinner size="small" />
              ) : (
                <>
                  <TagSelect value={selectedTagId} onChange={setSelectedTagId} tags={availableTags} placeholder="Select a tag…" className="w-48 text-xs font-mono" />
                  <Button size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={sortedData.length === 0 || !selectedTagId} onClick={() => selectedTagId && handleApplyTag(Number(selectedTagId))}>
                    Add
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={sortedData.length === 0 || !selectedTagId} onClick={() => selectedTagId && handleRemoveAllTags(Number(selectedTagId))}>
                    Remove
                  </Button>
                  <Button variant="destructive" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider ml-2" disabled={sortedData.length === 0} onClick={() => setRemoveTagsConfirmOpen(true)}>
                    Clear All
                  </Button>
                  <a href="/finance/tags" className="ml-auto">
                    <Button variant="secondary" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider text-accent">
                      Manage Tags
                    </Button>
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dialogs and Modals remain identical structurally */}
      <AlertDialog open={removeTagsConfirmOpen} onOpenChange={setRemoveTagsConfirmOpen}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-accent">Remove all tags</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will remove all tags from the {sortedData.length} transaction{sortedData.length !== 1 ? 's' : ''} currently in view. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted/50">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { setRemoveTagsConfirmOpen(false); await handleRemoveAllTags(); }}>
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedTransaction && <TransactionDetailsModal transaction={selectedTransaction} isOpen={!!selectedTransaction} onClose={() => setSelectedTransaction(null)} onSave={handleUpdateTransaction} />}
      {linkTransaction && <TransactionLinkModal transaction={linkTransaction} isOpen={!!linkTransaction} onClose={() => setLinkTransaction(null)} onLinkChanged={() => refreshFn && refreshFn()} />}
      {lotsTransaction && accountId && <TransactionLotsModal accountId={accountId} transactionId={lotsTransaction.t_id!} isOpen={!!lotsTransaction} onClose={() => setLotsTransaction(null)} />}

      <AlertDialog open={!!deleteConfirmTransaction} onOpenChange={() => setDeleteConfirmTransaction(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-destructive">Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete this transaction? This action cannot be undone.
              {deleteConfirmTransaction && (
                <div className="mt-4 p-3 bg-surface border border-border rounded-sm text-sm font-mono text-foreground space-y-1">
                  <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Date:</span> {deleteConfirmTransaction.t_date}</p>
                  <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Description:</span> {deleteConfirmTransaction.t_description}</p>
                  <p><span className="text-muted-foreground uppercase text-[10px] tracking-wider inline-block w-24">Amount:</span> <span className={Number(deleteConfirmTransaction.t_amt) >= 0 ? "text-success" : "text-destructive"}>{currency(deleteConfirmTransaction.t_amt || 0).format()}</span></p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted/50">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
                if (deleteConfirmTransaction && onDeleteTransaction) {
                  onDeleteTransaction(deleteConfirmTransaction.t_id?.toString() || ''); setDeleteConfirmTransaction(null);
                }
              }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}