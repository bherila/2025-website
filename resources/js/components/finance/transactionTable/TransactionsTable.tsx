'use client'
import './TransactionsTable.css'

import { useVirtualizer } from '@tanstack/react-virtual'
import currency from 'currency.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { isDuplicateTransaction } from '@/data/finance/isDuplicateTransaction'
import { fetchWrapper } from '@/fetchWrapper'
import { tagBadgeStyle } from '@/lib/finance/tagColorUtils'
import { cn } from '@/lib/utils'

import TransactionLotsModal from '../lots/TransactionLotsModal'
import TransactionDetailsModal from '../TransactionDetailsModal'
import TransactionLinkModal from '../TransactionLinkModal'
import { ColumnHeader } from './ColumnHeader'
import { DeleteTransactionDialog } from './DeleteTransactionDialog'
import { PaginationControls, type PaginationControlsProps } from './PaginationControls'
import { exportToCSV, exportToJSON } from './transactionExport'
import { TransactionsSummaryCards } from './TransactionsSummaryCards'
import { collectTagsFromRows, type TransactionTag } from './transactionsTableTags'
import { TransactionsTaggingToolbar } from './TransactionsTaggingToolbar'
import { useColumnVisibility } from './useColumnVisibility'
import { useKeyboardNavigation } from './useKeyboardNavigation'
import { useRowSelection } from './useRowSelection'
import { useTransactionFilters } from './useTransactionFilters'

const DEFAULT_PAGE_SIZE = 100

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
  useVirtualScroll?: boolean | undefined
}

export default function TransactionsTable({ data, onDeleteTransaction, enableTagging = false, refreshFn, duplicates, enableLinking = false, accountId, pageSize = DEFAULT_PAGE_SIZE, highlightTransactionId, useVirtualScroll = true }: Props) {
  const [sortField, setSortField] = useState<keyof AccountLineItem>('t_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const {
    dateFilter, setDateFilter, descriptionFilter, setDescriptionFilter,
    typeFilter, setTypeFilter, categoryFilter, setCategoryFilter,
    symbolFilter, setSymbolFilter, cusipFilter, setCusipFilter,
    optExpirationFilter, setOptExpirationFilter, optTypeFilter, setOptTypeFilter,
    memoFilter, setMemoFilter, tagFilter, setTagFilter,
    amountFilter, setAmountFilter, qtyFilter, setQtyFilter,
    postDateFilter, setPostDateFilter, cashBalanceFilter, setCashBalanceFilter,
    filteredData,
  } = useTransactionFilters(data)
  const [selectedTransaction, setSelectedTransaction] = useState<AccountLineItem | null>(null)
  const [linkTransaction, setLinkTransaction] = useState<AccountLineItem | null>(null)
  const [deleteConfirmTransaction, setDeleteConfirmTransaction] = useState<AccountLineItem | null>(null)
  const [lotsTransaction, setLotsTransaction] = useState<AccountLineItem | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewAll, setViewAll] = useState(false)
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1)

  // Full-viewport layout state (virtual scroll mode only)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const [wrapperTop, setWrapperTop] = useState(100) // Initial estimate: navbar(48px) + toolbar(52px)

  const {
    isCategoryColumnEmpty, isQtyColumnEmpty, isPriceColumnEmpty,
    isCommissionColumnEmpty, isFeeColumnEmpty, isTypeColumnEmpty,
    isMemoColumnEmpty, isCusipColumnEmpty, isSymbolColumnEmpty,
    isOptionExpiryColumnEmpty, isOptionTypeColumnEmpty, isStrikeColumnEmpty,
    isTagsColumnEmpty, isPostDateColumnEmpty, isCashBalanceColumnEmpty,
    isClientExpenseColumnEmpty,
  } = useColumnVisibility(data)

  const isDuplicate = useCallback((item: AccountLineItem) => {
    if (!duplicates || duplicates.length === 0) return false
    return isDuplicateTransaction(item, duplicates)
  }, [duplicates])

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

  const handleUpdateTransaction = useCallback(async (_updatedTransaction: Partial<AccountLineItem>): Promise<void> => {
    if (typeof refreshFn === 'function') {
      await refreshFn()
    }
  }, [refreshFn])

  const renderTransactionTags = useCallback((row: AccountLineItem) => (
    <div className="flex flex-wrap gap-1">
      {row.tags?.map((tag) => (
        <Badge
          key={tag.tag_id}
          variant="outline"
          className="font-mono text-[9px] px-1.5 py-0 rounded-sm cursor-pointer hover:opacity-80 transition-opacity border-0"
          style={tagBadgeStyle(tag.tag_color)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setTagFilter((prev) => prev === tag.tag_label ? '' : tag.tag_label)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {tag.tag_label}
        </Badge>
      ))}
    </div>
  ), [setTagFilter])

  const handleSort = (field: keyof AccountLineItem) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const handlePageSizeChange = useCallback((size: number) => {
    setCurrentPageSize(size)
    setViewAll(false)
    setCurrentPage(1)
  }, [])

   
  const sortedData = useMemo(() => {
    const sorted = filteredData.slice()
    sorted.sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      const direction = sortDirection === 'asc' ? 1 : -1
      if (aVal == null) return 1
      if (bVal == null) return -1
      return aVal < bVal ? -direction : direction
    })
    return sorted
  }, [filteredData, sortField, sortDirection])

  const totalRows = sortedData.length
  const totalPages = viewAll ? 1 : Math.max(1, Math.ceil(totalRows / currentPageSize))

  useEffect(() => {
    if (highlightTransactionId && !viewAll) {
      const idx = sortedData.findIndex(r => r.t_id === highlightTransactionId)
      if (idx >= 0) {
        const targetPage = Math.floor(idx / currentPageSize) + 1
        setCurrentPage(targetPage)
      }
    }
  }, [highlightTransactionId, sortedData, currentPageSize, viewAll])

  useEffect(() => {
    setCurrentPage(1)
  }, [descriptionFilter, typeFilter, categoryFilter, symbolFilter, cusipFilter, optExpirationFilter, optTypeFilter, dateFilter, memoFilter, tagFilter, amountFilter, qtyFilter, postDateFilter, cashBalanceFilter])

  const safePage = Math.min(currentPage, totalPages)
  const paginatedData = useMemo(() => {
    if (viewAll) return sortedData
    const start = (safePage - 1) * currentPageSize
    return sortedData.slice(start, start + currentPageSize)
  }, [sortedData, safePage, currentPageSize, viewAll])

  // Virtual scrolling setup
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36, // Fixed row height in pixels (matches table row)
    overscan: 10, // Render 10 extra rows above/below viewport
    enabled: useVirtualScroll,
  })

  // Handle highlightTransactionId for virtual scrolling
  const highlightedTransactionIndex = useMemo(() => {
    if (!highlightTransactionId) return -1
    return sortedData.findIndex((row) => row.t_id === highlightTransactionId)
  }, [sortedData, highlightTransactionId])

  useEffect(() => {
    if (!useVirtualScroll) return
    if (highlightedTransactionIndex < 0) return

    virtualizer.scrollToIndex(highlightedTransactionIndex, { align: 'center' })
  }, [useVirtualScroll, highlightedTransactionIndex, virtualizer])

  // Measure wrapper's top offset so the table fills the remaining viewport height
  useLayoutEffect(() => {
    if (!useVirtualScroll) return
    const updateTop = () => {
      if (wrapperRef.current) {
        setWrapperTop(wrapperRef.current.getBoundingClientRect().top)
      }
    }
    updateTop()
    window.addEventListener('resize', updateTop)
    return () => window.removeEventListener('resize', updateTop)
  }, [useVirtualScroll])

  // Collapse summary cards and toolbar when the table is scrolled down
  useEffect(() => {
    if (!useVirtualScroll) return
    const container = tableContainerRef.current
    if (!container) return
    const onScroll = () => setIsHeaderCollapsed(container.scrollTop > 60)
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [useVirtualScroll])

  // Data to render: virtual scroll uses sortedData, pagination uses paginatedData
  const displayData = useVirtualScroll ? sortedData : paginatedData

  const totals = useMemo(() => {
    let total = currency(0)
    let positives = currency(0)
    let negatives = currency(0)
    for (const row of sortedData) {
      const amount = currency(row.t_amt || '0')
      total = total.add(amount)
      if (amount.value > 0) positives = positives.add(amount)
      else if (amount.value < 0) negatives = negatives.add(amount)
    }
    return { total, positives, negatives }
  }, [sortedData])


  const totalAmount = totals.total
  const totalPositives = totals.positives
  const totalNegatives = totals.negatives

  // Row selection
  const { selectedRowIds, handleRowClick, clearSelection, selectAll } = useRowSelection(displayData)

  // Selection-aware transaction IDs for tagging
  const effectiveTransactionIds = useMemo(() => {
    if (selectedRowIds.size > 0) {
      return Array.from(selectedRowIds).join(',')
    }
    return sortedData.map((r) => r.t_id).filter((id) => id != null).join(',')
  }, [selectedRowIds, sortedData])

  const effectiveCount = selectedRowIds.size > 0 ? selectedRowIds.size : sortedData.length
  const isSelection = selectedRowIds.size > 0

  const handleApplyTag = useCallback(async (tagId: number) => {
    if (!effectiveTransactionIds) return
    try {
      await fetchWrapper.post('/api/finance/tags/apply', { tag_id: tagId, transaction_ids: effectiveTransactionIds })
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to apply tag:', error)
    }
  }, [effectiveTransactionIds, refreshFn])

  const handleRemoveTag = useCallback(async (tagId: number) => {
    if (!effectiveTransactionIds) return
    try {
      await fetchWrapper.post('/api/finance/tags/remove', { tag_id: tagId, transaction_ids: effectiveTransactionIds })
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to remove tag:', error)
    }
  }, [effectiveTransactionIds, refreshFn])

  const handleRemoveAllTags = useCallback(async () => {
    if (!effectiveTransactionIds) return
    try {
      await fetchWrapper.post('/api/finance/tags/remove', { transaction_ids: effectiveTransactionIds })
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to remove tags:', error)
    }
  }, [effectiveTransactionIds, refreshFn])

  const handleBatchDelete = useCallback(async () => {
    const ids = selectedRowIds.size > 0
      ? Array.from(selectedRowIds)
      : sortedData.map((r) => r.t_id).filter((id): id is number => id != null)
    if (ids.length === 0) return
    try {
      await fetchWrapper.post('/api/finance/transactions/batch-delete', { t_ids: ids })
      clearSelection()
      if (typeof refreshFn === 'function') refreshFn()
    } catch (error) {
      console.error('Failed to batch delete:', error)
    }
  }, [selectedRowIds, sortedData, clearSelection, refreshFn])

  // Export handlers - export selected rows or all filtered rows
  const handleExportCSV = useCallback(() => {
    const dataToExport = selectedRowIds.size > 0
      ? sortedData.filter(row => row.t_id != null && selectedRowIds.has(row.t_id))
      : sortedData
    const suffix = selectedRowIds.size > 0 ? 'selected' : 'filtered'
    const timestamp = new Date().toISOString().split('T')[0]
    exportToCSV(dataToExport, accountId || 'all', `${suffix}_${timestamp}`)
  }, [selectedRowIds, sortedData, accountId])

  const handleExportJSON = useCallback(() => {
    const dataToExport = selectedRowIds.size > 0
      ? sortedData.filter(row => row.t_id != null && selectedRowIds.has(row.t_id))
      : sortedData
    const suffix = selectedRowIds.size > 0 ? 'selected' : 'filtered'
    const timestamp = new Date().toISOString().split('T')[0]
    exportToJSON(dataToExport, accountId || 'all', `${suffix}_${timestamp}`)
  }, [selectedRowIds, sortedData, accountId])

  // Keyboard navigation
  const { handleKeyDown } = useKeyboardNavigation({
    focusedRowIndex,
    setFocusedRowIndex,
    displayData,
    selectedRowIds,
    handleRowClick,
    clearSelection,
    selectAll,
    useVirtualScroll,
    virtualizer,
    tableContainerRef,
    onDeleteTransaction,
    handleBatchDelete,
    setSelectedTransaction,
    setDeleteConfirmTransaction,
  })

  // Pagination callbacks
  const handlePageChange = useCallback((page: number) => {
    setViewAll(false)
    setCurrentPage(page)
  }, [])

  const handleViewAll = useCallback(() => setViewAll(true), [])

  const paginationProps: PaginationControlsProps = {
    currentPage: safePage,
    totalPages,
    totalRows,
    pageSize: currentPageSize,
    viewAll,
    onPageChange: handlePageChange,
    onViewAll: handleViewAll,
    onPageSizeChange: handlePageSizeChange,
  }

  const tdClass = "py-2 px-2 border-b border-table-border align-top"

  return (
    <div
      ref={wrapperRef}
      className={useVirtualScroll ? "flex flex-col" : undefined}
      style={useVirtualScroll ? { height: `calc(100dvh - ${wrapperTop}px)` } : undefined}
    >
      {/* Summary cards — collapses when user scrolls the table */}
      <div
        aria-hidden={useVirtualScroll && isHeaderCollapsed ? true : undefined}
        style={useVirtualScroll ? {
          overflow: 'hidden',
          maxHeight: isHeaderCollapsed ? '0' : '200px',
          opacity: isHeaderCollapsed ? 0 : 1,
          transition: 'max-height 250ms ease, opacity 200ms ease',
          visibility: isHeaderCollapsed ? 'hidden' : 'visible',
        } : undefined}
      >
        <TransactionsSummaryCards
          netAmount={totalAmount.format()}
          netAmountPositive={totalAmount.value >= 0}
          totalCredits={totalPositives.format()}
          totalDebits={totalNegatives.format()}
          totalRows={totalRows}
        />
      </div>

      {/* Pagination + tagging toolbar — collapses when user scrolls the table */}
      <div
        className={cn(
          "bg-background border-x border-t border-border",
          useVirtualScroll
            ? (isHeaderCollapsed ? "rounded-sm" : "rounded-t-sm")
            : "sticky top-0 z-20 rounded-t-sm",
        )}
        aria-hidden={useVirtualScroll && isHeaderCollapsed ? true : undefined}
        style={useVirtualScroll ? {
          overflow: 'hidden',
          maxHeight: isHeaderCollapsed ? '0' : '200px',
          opacity: isHeaderCollapsed ? 0 : 1,
          transition: 'max-height 250ms ease, opacity 200ms ease',
          visibility: isHeaderCollapsed ? 'hidden' : 'visible',
        } : undefined}
      >
        {!useVirtualScroll && <PaginationControls {...paginationProps} />}

        {enableTagging && (
          <TransactionsTaggingToolbar
            effectiveCount={effectiveCount}
            isSelection={isSelection}
            onApplyTag={handleApplyTag}
            onRemoveTag={handleRemoveTag}
            onRemoveAllTags={handleRemoveAllTags}
            availableTags={availableTags}
            isLoadingTags={isLoadingTags}
            onClearSelection={clearSelection}
            {...(onDeleteTransaction ? { onBatchDelete: handleBatchDelete } : {})}
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
          />
        )}
      </div>

      {/* Scrollable table container — flex-1 fills remaining height */}
      <div
        ref={tableContainerRef}
        className={cn(
          "relative w-full overflow-auto border border-border bg-card",
          useVirtualScroll ? "flex-1 min-h-0" : "transactions-table-scroll max-h-[calc(100vh-14rem)]",
          isHeaderCollapsed && useVirtualScroll ? "rounded-sm" : "rounded-b-sm",
        )}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Transactions table with keyboard navigation"
      >
        <table className="w-full text-sm" role="grid" aria-rowcount={sortedData.length}>
          <thead className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
            <tr>
              <ColumnHeader label="Date" field="t_date" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_date')} filter={dateFilter} setFilter={setDateFilter} />
              {!isPostDateColumnEmpty && <ColumnHeader label="Post Date" field="t_date_posted" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_date_posted')} filter={postDateFilter} setFilter={setPostDateFilter} />}
              {!isTypeColumnEmpty && <ColumnHeader label="Type" field="t_type" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_type')} filter={typeFilter} setFilter={setTypeFilter} />}
              <ColumnHeader label="Description" field="t_description" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_description')} filter={descriptionFilter} setFilter={setDescriptionFilter} />
              {!isTagsColumnEmpty && <ColumnHeader label="Tags" sortField={sortField} sortDirection={sortDirection} filter={tagFilter} setFilter={setTagFilter} />}
              {!isSymbolColumnEmpty && <ColumnHeader label="Symbol" field="t_symbol" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_symbol')} filter={symbolFilter} setFilter={setSymbolFilter} />}
              {!isQtyColumnEmpty && <ColumnHeader label="Qty" field="t_qty" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_qty')} filter={qtyFilter} setFilter={setQtyFilter} className="text-right" />}
              {!isPriceColumnEmpty && <ColumnHeader label="Price" field="t_price" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_price')} className="text-right" />}
              {!isCommissionColumnEmpty && <ColumnHeader label="Comm." field="t_commission" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_commission')} className="text-right" />}
              {!isFeeColumnEmpty && <ColumnHeader label="Fee" field="t_fee" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_fee')} className="text-right" />}
              <ColumnHeader label="Amount" field="t_amt" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_amt')} filter={amountFilter} setFilter={setAmountFilter} className="text-right" />
              {!isCategoryColumnEmpty && <ColumnHeader label="Category" field="t_schc_category" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_schc_category')} filter={categoryFilter} setFilter={setCategoryFilter} />}
              {!isCusipColumnEmpty && <ColumnHeader label="CUSIP" field="t_cusip" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_cusip')} filter={cusipFilter} setFilter={setCusipFilter} />}
              {!isOptionExpiryColumnEmpty && <ColumnHeader label="Expiry" field="opt_expiration" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('opt_expiration')} />}
              {!isOptionTypeColumnEmpty && <ColumnHeader label="Opt Type" field="opt_type" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('opt_type')} />}
              {!isStrikeColumnEmpty && <ColumnHeader label="Strike" field="opt_strike" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('opt_strike')} />}
              {!isMemoColumnEmpty && <ColumnHeader label="Memo" field="t_comment" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_comment')} filter={memoFilter} setFilter={setMemoFilter} />}
              {!isCashBalanceColumnEmpty && <ColumnHeader label="Balance" field="t_account_balance" sortField={sortField} sortDirection={sortDirection} onSort={() => handleSort('t_account_balance')} filter={cashBalanceFilter} setFilter={setCashBalanceFilter} className="text-right whitespace-nowrap" />}
              {!isClientExpenseColumnEmpty && <ColumnHeader label="Client" sortField={sortField} sortDirection={sortDirection} className="text-center" />}
              {enableLinking && <ColumnHeader label="Link" sortField={sortField} sortDirection={sortDirection} className="text-center" />}
              {accountId && <ColumnHeader label="Lots" sortField={sortField} sortDirection={sortDirection} className="text-center" />}
              <ColumnHeader label="Details" sortField={sortField} sortDirection={sortDirection} className="text-center" />
            </tr>
          </thead>
          
          <tbody className="[&_tr:last-child]:border-0">
            {useVirtualScroll && virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${virtualizer.getVirtualItems()[0]!.start}px` }} aria-hidden />
            )}
            {(useVirtualScroll ? virtualizer.getVirtualItems().map(virtualRow => ({ virtualRow, row: sortedData[virtualRow.index], index: virtualRow.index })) : paginatedData.map((row, i) => ({ virtualRow: null, row, index: i }))).map((item) => {
              const { row, index: i } = item
              if (!row) return null
              const rowId = row.t_id ?? -i
              const isRowSelected = rowId >= 0 && selectedRowIds.has(rowId)
              const isFocused = i === focusedRowIndex
              // Calculate correct aria-rowindex: global index for virtual scroll, page offset + index for pagination
              const ariaRowIndex = useVirtualScroll ? i + 1 : ((safePage - 1) * currentPageSize) + i + 1
              return (
                <tr
                  key={row.t_id != null ? row.t_id : `row-${i}`}
                  className={cn(
                    "transition-colors cursor-pointer hover:bg-muted/20",
                    isDuplicate(row) && "bg-destructive/10 hover:bg-destructive/20",
                    isRowSelected && !isDuplicate(row) && "bg-primary/15 hover:bg-primary/25",
                    isFocused && "outline outline-2 outline-ring outline-offset-[-2px]",
                  )}
                  data-transaction-id={row.t_id}
                  role="row"
                  aria-selected={isRowSelected}
                  aria-rowindex={ariaRowIndex}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest('button') || target.closest('a')) return
                    if (row.t_id != null) {
                      handleRowClick(row.t_id, i, e)
                      setFocusedRowIndex(i)
                    }
                  }}
                >
                  <td className={cn(tdClass, "font-mono text-muted-foreground whitespace-nowrap hover:text-foreground")} onDoubleClick={() => setDateFilter(dateFilter === row.t_date ? '' : (row.t_date || ''))}>
                    {row.t_date}
                  </td>

                  {!isPostDateColumnEmpty && (
                    <td className={cn(tdClass, "font-mono text-muted-foreground whitespace-nowrap hover:text-foreground")} onDoubleClick={() => setPostDateFilter(postDateFilter === row.t_date_posted ? '' : (row.t_date_posted || ''))}>
                      {row.t_date_posted}
                    </td>
                  )}

                  {!isTypeColumnEmpty && (
                    <td className={cn(tdClass, "hover:text-primary")} onDoubleClick={() => setTypeFilter(typeFilter === row.t_type ? '' : (row.t_type || ''))}>
                      {row.t_type}
                    </td>
                  )}

                  <td className={cn(tdClass, "hover:text-primary font-medium")} onDoubleClick={() => setDescriptionFilter(descriptionFilter === row.t_description ? '' : (row.t_description || ''))}>
                    {row.t_description}
                  </td>

                  {!isTagsColumnEmpty && <td className={tdClass}>{renderTransactionTags(row)}</td>}

                  {!isSymbolColumnEmpty && (
                    <td className={cn(tdClass, "font-mono hover:text-primary")} onDoubleClick={() => setSymbolFilter(symbolFilter === row.t_symbol ? '' : (row.t_symbol || ''))}>
                      {row.t_symbol}
                    </td>
                  )}

                  {!isQtyColumnEmpty && (
                    <td className={cn(tdClass, "font-mono tabular-nums text-right hover:text-primary")} onDoubleClick={() => setQtyFilter(qtyFilter === (row.t_qty?.toString() || '0') ? '' : (row.t_qty?.toString() || '0'))}>
                      {row.t_qty != null ? row.t_qty.toLocaleString() : ''}
                    </td>
                  )}

                  {!isPriceColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_price != null && Number(row.t_price) !== 0 ? row.t_price : ''}</td>}
                  {!isCommissionColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_commission != null && Number(row.t_commission) !== 0 ? row.t_commission : ''}</td>}
                  {!isFeeColumnEmpty && <td className={cn(tdClass, "font-mono tabular-nums text-right")}>{row.t_fee != null && Number(row.t_fee) !== 0 ? row.t_fee : ''}</td>}

                  <td
                    className={cn(
                      tdClass,
                      "font-mono tabular-nums text-right font-semibold hover:opacity-80",
                      Number(row.t_amt) >= 0 ? "text-success" : "text-destructive"
                    )}
                    onDoubleClick={() => setAmountFilter(amountFilter === (row.t_amt?.toString() || '0') ? '' : (row.t_amt?.toString() || '0'))}
                  >
                    {row.t_amt || '0'}
                  </td>

                  {!isCategoryColumnEmpty && (
                    <td className={cn(tdClass, "hover:text-primary text-xs")} onDoubleClick={() => setCategoryFilter(categoryFilter === (row.t_schc_category || '-') ? '' : (row.t_schc_category || '-'))}>
                      {row.t_schc_category ?? '-'}
                    </td>
                  )}

                  {!isCusipColumnEmpty && (
                    <td className={cn(tdClass, "font-mono text-xs hover:text-primary")} onDoubleClick={() => setCusipFilter(cusipFilter === row.t_cusip ? '' : (row.t_cusip || ''))}>
                      {row.t_cusip}
                    </td>
                  )}

                  {!isOptionExpiryColumnEmpty && (
                    <td className={cn(tdClass, "font-mono text-xs hover:text-primary")} onDoubleClick={() => setOptExpirationFilter(optExpirationFilter === row.opt_expiration?.slice(0, 10) ? '' : (row.opt_expiration?.slice(0, 10) || ''))}>
                      {row.opt_expiration?.slice(0, 10) ?? ''}
                    </td>
                  )}

                  {!isOptionTypeColumnEmpty && (
                    <td className={cn(tdClass, "text-xs hover:text-primary")} onDoubleClick={() => setOptTypeFilter(optTypeFilter === row.opt_type ? '' : (row.opt_type || ''))}>
                      {row.opt_type}
                    </td>
                  )}

                  {!isStrikeColumnEmpty && <td className={cn(tdClass, "font-mono text-xs")}>{row.opt_strike != null ? row.opt_strike : ''}</td>}

                  {!isMemoColumnEmpty && (
                    <td className={cn(tdClass, "text-xs text-muted-foreground max-w-xs truncate text-ellipsis transition-all")} onDoubleClick={() => setMemoFilter(memoFilter === row.t_comment ? '' : (row.t_comment || ''))}>
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
                      <Button variant={hasLinks(row) ? "default" : "outline"} size="sm" className={cn("h-6 px-2 text-[10px]", hasLinks(row) && "bg-success hover:bg-success/80 text-success-foreground border-success")} onClick={(e) => { e.stopPropagation(); setLinkTransaction(row) }}>
                        🔗
                      </Button>
                    </td>
                  )}

                  {accountId && (
                    <td className={cn(tdClass, "text-center")}>
                      {row.t_symbol && (row.t_type?.toUpperCase() === 'SELL' || row.t_type?.toUpperCase() === 'BUY' || (row.t_qty && Number(row.t_qty) !== 0)) && (
                        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setLotsTransaction(row) }}>
                          📦
                        </Button>
                      )}
                    </td>
                  )}

                  <td className={cn(tdClass, "text-center")}>
                    <Button variant="secondary" size="sm" className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider" onClick={(e) => { e.stopPropagation(); setSelectedTransaction(row) }}>
                      Details
                    </Button>
                  </td>

                </tr>
              )
            })}
            {useVirtualScroll && virtualizer.getVirtualItems().length > 0 && (() => {
              const items = virtualizer.getVirtualItems()
              const last = items[items.length - 1]!
              const bottomPad = virtualizer.getTotalSize() - last.end
              return bottomPad > 0 ? <tr style={{ height: `${bottomPad}px` }} aria-hidden /> : null
            })()}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
              <td className="py-2 px-2 font-mono text-muted-foreground text-xs uppercase tracking-wide" colSpan={
                1 +
                (isPostDateColumnEmpty ? 0 : 1) +
                (isTypeColumnEmpty ? 0 : 1) +
                1 + // description
                (isTagsColumnEmpty ? 0 : 1) +
                (isSymbolColumnEmpty ? 0 : 1) +
                (isQtyColumnEmpty ? 0 : 1) +
                (isPriceColumnEmpty ? 0 : 1) +
                (isCommissionColumnEmpty ? 0 : 1) +
                (isFeeColumnEmpty ? 0 : 1)
              }>
                {totalRows.toLocaleString()} row{totalRows !== 1 ? 's' : ''}
              </td>
              <td className="py-2 px-2 font-mono tabular-nums text-right">
                <div className={cn("text-sm", totalAmount.value >= 0 ? "text-success" : "text-destructive")}>
                  {totalAmount.format()} net
                </div>
                <div className="text-[10px] text-muted-foreground">
                  <span className="text-success">{totalPositives.format()}</span>
                  {' / '}
                  <span className="text-destructive">{totalNegatives.format()}</span>
                </div>
              </td>
              {!isCategoryColumnEmpty && <td />}
              {!isCusipColumnEmpty && <td />}
              {!isOptionExpiryColumnEmpty && <td />}
              {!isOptionTypeColumnEmpty && <td />}
              {!isStrikeColumnEmpty && <td />}
              {!isMemoColumnEmpty && <td />}
              {!isCashBalanceColumnEmpty && <td />}
              {!isClientExpenseColumnEmpty && <td />}
              {enableLinking && <td />}
              {accountId && <td />}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bottom pagination for convenience */}
      {!useVirtualScroll && <PaginationControls {...paginationProps} />}

      {selectedTransaction && <TransactionDetailsModal transaction={selectedTransaction} isOpen={!!selectedTransaction} onClose={() => setSelectedTransaction(null)} onSave={handleUpdateTransaction} />}
      {linkTransaction && <TransactionLinkModal transaction={linkTransaction} isOpen={!!linkTransaction} onClose={() => setLinkTransaction(null)} onLinkChanged={() => refreshFn && refreshFn()} />}
      {lotsTransaction && accountId && <TransactionLotsModal accountId={accountId} transactionId={lotsTransaction.t_id!} isOpen={!!lotsTransaction} onClose={() => setLotsTransaction(null)} />}

      <DeleteTransactionDialog
        transaction={deleteConfirmTransaction}
        onClose={() => setDeleteConfirmTransaction(null)}
        onConfirm={(id) => { if (onDeleteTransaction) onDeleteTransaction(id) }}
      />
    </div>
  )
}
