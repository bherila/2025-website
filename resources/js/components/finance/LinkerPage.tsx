'use client'

import { useState, useEffect, useCallback } from 'react'
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
import currency from 'currency.js'

interface Transaction {
  t_id: number
  t_date: string
  t_type: string | null
  t_description: string | null
  t_account: number
  acct_name: string | null
  t_amt: string | number
}

interface LinkablePair {
  transaction_a: Transaction
  transaction_b: Transaction
  are_opposite_signs: boolean
  amount_diff: number
  date_diff: number
}

export default function LinkerPage({ id }: { id: number }) {
  const [linkablePairs, setLinkablePairs] = useState<LinkablePair[]>([])
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isLinking, setIsLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<YearSelection | null>(null)

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

  const fetchLinkablePairs = useCallback(async () => {
    if (selectedYear === null) return

    setIsLoading(true)
    setError(null)
    try {
      const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
      const data = await fetchWrapper.get(`/api/finance/${id}/linkable-pairs${yearParam}`)
      setLinkablePairs(data.pairs || [])
      
      // Pre-select pairs with opposite signs
      const preSelected = new Set<string>()
      for (const pair of data.pairs || []) {
        if (pair.are_opposite_signs) {
          const pairKey = `${pair.transaction_a.t_id}-${pair.transaction_b.t_id}`
          preSelected.add(pairKey)
        }
      }
      setSelectedPairs(preSelected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load linkable pairs')
    } finally {
      setIsLoading(false)
    }
  }, [id, selectedYear])

  useEffect(() => {
    if (selectedYear !== null) {
      fetchLinkablePairs()
    }
  }, [fetchLinkablePairs, selectedYear])

  const toggleSelection = (pairKey: string) => {
    setSelectedPairs(prev => {
      const next = new Set(prev)
      if (next.has(pairKey)) {
        next.delete(pairKey)
      } else {
        next.add(pairKey)
      }
      return next
    })
  }

  const handleLinkAll = async () => {
    if (selectedPairs.size === 0) {
      setError('No pairs selected for linking')
      return
    }

    setIsLinking(true)
    setError(null)
    setSuccessMessage(null)

    let linkedCount = 0
    let errorCount = 0

    for (const pairKey of selectedPairs) {
      const pair = linkablePairs.find(
        p => `${p.transaction_a.t_id}-${p.transaction_b.t_id}` === pairKey
      )
      if (!pair) continue

      try {
        await fetchWrapper.post('/api/finance/transactions/link', {
          parent_t_id: pair.transaction_a.t_id,
          child_t_id: pair.transaction_b.t_id,
        })
        linkedCount++
      } catch (err) {
        console.error('Failed to link pair:', pairKey, err)
        errorCount++
      }
    }

    if (linkedCount > 0) {
      setSuccessMessage(`Successfully linked ${linkedCount} transaction pair${linkedCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`)
    } else {
      setError(`Failed to link any pairs. ${errorCount} error${errorCount > 1 ? 's' : ''} occurred.`)
    }

    setIsLinking(false)
    // Refresh the list
    await fetchLinkablePairs()
  }

  const selectAll = () => {
    const all = new Set<string>()
    for (const pair of linkablePairs) {
      all.add(`${pair.transaction_a.t_id}-${pair.transaction_b.t_id}`)
    }
    setSelectedPairs(all)
  }

  const selectNone = () => {
    setSelectedPairs(new Set())
  }

  const selectOppositeSigns = () => {
    const opposite = new Set<string>()
    for (const pair of linkablePairs) {
      if (pair.are_opposite_signs) {
        opposite.add(`${pair.transaction_a.t_id}-${pair.transaction_b.t_id}`)
      }
    }
    setSelectedPairs(opposite)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Finding linkable transactions...</span>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Transaction Linker</h1>
      
      <p className="text-gray-600 dark:text-gray-300 mb-4">
        Find and link related transactions across different accounts.
        This tool identifies potential transfer pairs based on exact amounts and similar dates (±5 days).
      </p>

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

      {linkablePairs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-300">No linkable transaction pairs found for {selectedYear === 'all' ? 'all years' : selectedYear}.</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
            Transactions may already be linked, or there are no matching pairs.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                Select None
              </Button>
              <Button variant="outline" size="sm" onClick={selectOppositeSigns}>
                Select Opposite Signs Only
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedPairs.size} of {linkablePairs.length} pairs selected
              </span>
              <Button 
                onClick={handleLinkAll} 
                disabled={isLinking || selectedPairs.size === 0}
              >
                {isLinking ? 'Linking...' : `Link ${selectedPairs.size} Pair${selectedPairs.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {linkablePairs.map((pair) => {
              const pairKey = `${pair.transaction_a.t_id}-${pair.transaction_b.t_id}`
              const isSelected = selectedPairs.has(pairKey)
              
              return (
                <div 
                  key={pairKey}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700'
                  }`}
                  onClick={() => toggleSelection(pairKey)}
                >
                  <div className="flex items-start gap-4">
                    <div className="pt-1">
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(pairKey)}
                      />
                    </div>
                    
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      {/* Transaction A */}
                      <div className="space-y-1">
                        <div className="font-medium text-sm text-gray-500 dark:text-gray-400">
                          {pair.transaction_a.acct_name}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{pair.transaction_a.t_date}</span>
                          {' — '}
                          {pair.transaction_a.t_description}
                        </div>
                        <div className={`font-mono ${
                          parseFloat(String(pair.transaction_a.t_amt)) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                        }`}>
                          {currency(pair.transaction_a.t_amt).format()}
                        </div>
                      </div>

                      {/* Transaction B */}
                      <div className="space-y-1">
                        <div className="font-medium text-sm text-gray-500 dark:text-gray-400">
                          {pair.transaction_b.acct_name}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">{pair.transaction_b.t_date}</span>
                          {' — '}
                          {pair.transaction_b.t_description}
                        </div>
                        <div className={`font-mono ${
                          parseFloat(String(pair.transaction_b.t_amt)) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                        }`}>
                          {currency(pair.transaction_b.t_amt).format()}
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-500 dark:text-gray-400 space-y-1">
                      {pair.are_opposite_signs && (
                        <div className="text-green-600 dark:text-green-400 font-medium">
                          ✓ Opposite signs
                        </div>
                      )}
                      <div>Δ {pair.date_diff.toFixed(0)} day{pair.date_diff !== 1 ? 's' : ''}</div>
                      <div>Δ {currency(pair.amount_diff).format()}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
