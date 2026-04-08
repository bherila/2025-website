import { useCallback, useRef, useState } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

interface RowSelectionResult {
  selectedRowIds: Set<number>
  handleRowClick: (rowId: number, rowIndex: number, e: React.MouseEvent) => void
  clearSelection: () => void
}

export function useRowSelection(paginatedData: AccountLineItem[]): RowSelectionResult {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set())
  const anchorIndexRef = useRef<number>(-1)

  const handleRowClick = useCallback((rowId: number, rowIndex: number, e: React.MouseEvent) => {
    const isMultiKey = e.ctrlKey || e.metaKey

    if (e.shiftKey && anchorIndexRef.current >= 0) {
      const start = Math.min(anchorIndexRef.current, rowIndex)
      const end = Math.max(anchorIndexRef.current, rowIndex)
      const rangeIds = paginatedData
        .slice(start, end + 1)
        .map((r) => r.t_id)
        .filter((id): id is number => id != null)

      if (isMultiKey) {
        setSelectedRowIds(prev => {
          const next = new Set(prev)
          for (const id of rangeIds) next.add(id)
          return next
        })
      } else {
        setSelectedRowIds(new Set(rangeIds))
      }
    } else if (isMultiKey) {
      setSelectedRowIds(prev => {
        const next = new Set(prev)
        if (next.has(rowId)) {
          next.delete(rowId)
        } else {
          next.add(rowId)
        }
        return next
      })
      anchorIndexRef.current = rowIndex
    } else {
      setSelectedRowIds(prev => {
        if (prev.size === 1 && prev.has(rowId)) {
          anchorIndexRef.current = -1
          return new Set()
        }
        anchorIndexRef.current = rowIndex
        return new Set([rowId])
      })
    }
  }, [paginatedData])

  const clearSelection = useCallback(() => {
    setSelectedRowIds(new Set())
    anchorIndexRef.current = -1
  }, [])

  return { selectedRowIds, handleRowClick, clearSelection }
}
