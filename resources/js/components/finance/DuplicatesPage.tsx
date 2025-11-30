'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'
import { 
  getEffectiveYear, 
  YEAR_CHANGED_EVENT,
  type YearSelection 
} from '@/lib/financeRouteBuilder'

interface Transaction {
  t_id: number
  t_date: string
  t_type: string | null
  t_description: string | null
  t_symbol: string | null
  t_qty: number | null
  t_price: number | string | null
  t_amt: number | string | null
  t_comment: string | null
  parent_t_id: number | null
  tags?: { tag_id: number; tag_label: string }[]
}

interface DuplicateGroup {
  key: string
  transactions: Transaction[]
  keepId: number
  deleteIds: number[]
}

export default function DuplicatesPage({ id }: { id: number }) {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isMerging, setIsMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<YearSelection | null>(null)
  const [markedAsNonDuplicate, setMarkedAsNonDuplicate] = useState(0)
  const [previouslyMarkedCount, setPreviouslyMarkedCount] = useState(0)

  // Get year from URL/sessionStorage on mount and listen for changes
  useEffect(() => {
    const updateYear = () => {
      const effective = getEffectiveYear(id)
      setSelectedYear(effective)
    }
    
    // Initial load
    updateYear()
    
    // Listen for year changes from year selector
    const handleYearChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === id) {
        setSelectedYear(customEvent.detail.year)
      }
    }
    window.addEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    
    return () => {
      window.removeEventListener(YEAR_CHANGED_EVENT, handleYearChange)
    }
  }, [id])

  const fetchDuplicates = useCallback(async () => {
    if (selectedYear === null) return
    
    setIsLoading(true)
    setError(null)
    try {
      const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
      const data = await fetchWrapper.get(`/api/finance/${id}/duplicates${yearParam}`)
      setDuplicateGroups(data.groups || [])
      setMarkedAsNonDuplicate(data.markedAsNonDuplicate || 0)
      setPreviouslyMarkedCount(data.previouslyMarkedCount || 0)
      
      // Pre-select all suggested deletions
      const preSelected = new Set<number>()
      for (const group of data.groups || []) {
        for (const delId of group.deleteIds) {
          preSelected.add(delId)
        }
      }
      setSelectedForDeletion(preSelected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicates')
    } finally {
      setIsLoading(false)
    }
  }, [id, selectedYear])

  useEffect(() => {
    if (selectedYear !== null) {
      fetchDuplicates()
    }
  }, [fetchDuplicates, selectedYear])

  const toggleSelection = (tId: number) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev)
      if (next.has(tId)) {
        next.delete(tId)
      } else {
        next.add(tId)
      }
      return next
    })
  }

  const handleMerge = async () => {
    // Build merge requests - group by which transactions to keep
    const mergeRequests: { keepId: number; deleteIds: number[] }[] = []
    // Track groups that are entirely unchecked (to mark as non-duplicates)
    const markAsNotDuplicateIds: number[] = []
    
    for (const group of duplicateGroups) {
      const deleteIds = group.transactions
        .filter(t => selectedForDeletion.has(t.t_id))
        .map(t => t.t_id)
      
      if (deleteIds.length > 0) {
        // Find the transaction to keep (highest t_id not being deleted)
        const keepId = group.transactions
          .filter(t => !selectedForDeletion.has(t.t_id))
          .sort((a, b) => b.t_id - a.t_id)[0]?.t_id
        
        if (keepId) {
          mergeRequests.push({ keepId, deleteIds })
        }
      } else {
        // Group is entirely unchecked - mark all as non-duplicates
        for (const tx of group.transactions) {
          markAsNotDuplicateIds.push(tx.t_id)
        }
      }
    }

    if (mergeRequests.length === 0 && markAsNotDuplicateIds.length === 0) {
      setError('No operations to perform')
      return
    }

    setIsMerging(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await fetchWrapper.post(`/api/finance/${id}/merge-duplicates`, {
        merges: mergeRequests,
        markAsNotDuplicateIds: markAsNotDuplicateIds
      })
      const messages: string[] = []
      if (result.mergedCount > 0) {
        messages.push(`merged ${result.mergedCount} duplicate transaction(s)`)
      }
      if (result.markedAsNotDuplicate > 0) {
        messages.push(`marked ${result.markedAsNotDuplicate} as not duplicates`)
      }
      setSuccessMessage(`Successfully ${messages.join(' and ')}`)
      // Refresh the list
      await fetchDuplicates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge transactions')
    } finally {
      setIsMerging(false)
    }
  }

  // Compute counts for button text
  const { deleteCount, markAsNonDuplicateCount } = useMemo(() => {
    let deleteCount = 0
    let markAsNonDuplicateCount = 0
    
    for (const group of duplicateGroups) {
      const selectedInGroup = group.transactions.filter(t => selectedForDeletion.has(t.t_id)).length
      if (selectedInGroup > 0) {
        deleteCount += selectedInGroup
      } else {
        // Group is entirely unchecked - all will be marked as non-duplicates
        markAsNonDuplicateCount += group.transactions.length
      }
    }
    
    return { deleteCount, markAsNonDuplicateCount }
  }, [duplicateGroups, selectedForDeletion])

  const selectAll = () => {
    const all = new Set<number>()
    for (const group of duplicateGroups) {
      for (const delId of group.deleteIds) {
        all.add(delId)
      }
    }
    setSelectedForDeletion(all)
  }

  const selectNone = () => {
    setSelectedForDeletion(new Set())
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Loading duplicates...</span>
      </div>
    )
  }
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Duplicate Transaction Detection</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {successMessage && (
        <Alert className="mb-4 bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800">
          <AlertDescription className="text-green-800 dark:text-green-200">{successMessage}</AlertDescription>
        </Alert>
      )}

      {duplicateGroups.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 space-y-2">
          <p>No duplicate transactions found for this account.</p>
          {previouslyMarkedCount > 0 && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {previouslyMarkedCount} transaction{previouslyMarkedCount !== 1 ? 's' : ''} previously marked as non-duplicate.
            </p>
          )}
          {markedAsNonDuplicate > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">
              {markedAsNonDuplicate} transaction{markedAsNonDuplicate !== 1 ? 's' : ''} just marked as verified non-duplicates.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span className="font-medium">
              Found {duplicateGroups.length} potential duplicate group(s)
            </span>
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All Suggested
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Deselect All
            </Button>
            <Button 
              onClick={handleMerge} 
              disabled={isMerging || (deleteCount === 0 && markAsNonDuplicateCount === 0)}
              className="ml-auto"
            >
              {isMerging ? (
                <>
                  <Spinner size="small" className="mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  {deleteCount > 0 && `Merge & Delete ${deleteCount}`}
                  {deleteCount > 0 && markAsNonDuplicateCount > 0 && ', '}
                  {markAsNonDuplicateCount > 0 && `Mark ${markAsNonDuplicateCount} as Not Duplicates`}
                  {deleteCount === 0 && markAsNonDuplicateCount === 0 && 'No Changes'}
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            {duplicateGroups.map((group, groupIndex) => (
              <div 
                key={group.key} 
                className="border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm"
              >
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Group {groupIndex + 1}: {group.transactions[0]?.t_date} - {group.transactions[0]?.t_symbol || 'No Symbol'} - ${group.transactions[0]?.t_amt}
                </div>
                
                <div className="space-y-2">
                  {group.transactions.map((tx) => {
                    const isSelected = selectedForDeletion.has(tx.t_id)
                    const isKeep = tx.t_id === group.keepId
                    
                    return (
                      <div 
                        key={tx.t_id}
                        className={`flex items-start gap-3 p-3 rounded border ${
                          isSelected 
                            ? 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-800' 
                            : isKeep 
                              ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800' 
                              : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <Checkbox
                          id={`tx-${tx.t_id}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(tx.t_id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">
                              #{tx.t_id}
                            </span>
                            {isKeep && !isSelected && (
                              <span className="text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-0.5 rounded">
                                KEEP
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-xs bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 px-2 py-0.5 rounded">
                                DELETE
                              </span>
                            )}
                            {tx.t_type && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                                {tx.t_type}
                              </span>
                            )}
                            {tx.parent_t_id && (
                              <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded">
                                parent: #{tx.parent_t_id}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Date:</span>{' '}
                              <span>{tx.t_date}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Symbol:</span>{' '}
                              <span>{tx.t_symbol || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Amount:</span>{' '}
                              <span className={Number(tx.t_amt) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                ${tx.t_amt}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Qty:</span>{' '}
                              <span>{tx.t_qty ?? '-'}</span>
                            </div>
                            <div className="md:col-span-2">
                              <span className="text-gray-500 dark:text-gray-400">Description:</span>{' '}
                              <span className="break-words">{tx.t_description || '-'}</span>
                            </div>
                            <div className="md:col-span-2">
                              <span className="text-gray-500 dark:text-gray-400">Memo:</span>{' '}
                              <span className="break-words">{tx.t_comment || '-'}</span>
                            </div>
                            {tx.tags && tx.tags.length > 0 && (
                              <div className="md:col-span-2">
                                <span className="text-gray-500 dark:text-gray-400">Tags:</span>{' '}
                                {tx.tags.map(tag => (
                                  <span 
                                    key={tag.tag_id} 
                                    className="inline-block text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded mr-1"
                                  >
                                    {tag.tag_label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
