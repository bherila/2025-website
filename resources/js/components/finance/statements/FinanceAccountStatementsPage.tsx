'use client'
import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'

import AccountTaxDocumentsSection from '../AccountTaxDocumentsSection'
import type { StatementDetail, StatementInfo } from '../StatementDetailsModal'
import StatementDetailView from './StatementDetailView'
import StatementsListView, { type StatementSnapshot } from './StatementsListView'

/** Read a URL search param value from the current window location. */
function getSearchParam(key: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(key)
  } catch {
    return null
  }
}

/** Update URL query params without full page reload. */
function setSearchParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(params)) {
    if (value === null) {
      url.searchParams.delete(key)
    } else {
      url.searchParams.set(key, value)
    }
  }
  window.history.pushState({}, '', url.toString())
}

interface DetailViewState {
  statementId: number
  info?: StatementInfo
  details?: StatementDetail[]
}

import AllStatementsView from './AllStatementsView' // I will rename this later or use it as a component

export default function FinanceAccountStatementsPage({ id }: { id: number }) {
  const [statements, setStatements] = useState<StatementSnapshot[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // URL-driven view state
  const [viewState, setViewState] = useState<{
    view: 'list' | 'detail' | 'all'
    statementId?: number
    info?: StatementInfo
    details?: StatementDetail[]
  }>(() => {
    const sid = getSearchParam('statement_id')
    const view = getSearchParam('view')
    if (sid) return { view: 'detail', statementId: parseInt(sid, 10) }
    if (view === 'all') return { view: 'all' }
    return { view: 'list' }
  })

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const sid = getSearchParam('statement_id')
      const view = getSearchParam('view')
      if (sid) {
        setViewState({ view: 'detail', statementId: parseInt(sid, 10) })
      } else if (view === 'all') {
        setViewState({ view: 'all' })
      } else {
        setViewState({ view: 'list' })
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const fetchedData = await fetchWrapper.get(`/api/finance/${id}/balance-timeseries`)
      setStatements(fetchedData)
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching statements:', error)
      setStatements([])
      setIsLoading(false)
    }
  }, [id])

  // Fetch statements on mount
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleViewDetail = useCallback(async (statementId: number) => {
    // Preserve current year in URL
    const currentYear = getSearchParam('year')
    setSearchParams({ statement_id: String(statementId), year: currentYear, view: null })

    // Pre-fetch details
    try {
      const data = await fetchWrapper.get(`/api/finance/statement/${statementId}/details`)
      setViewState({
        view: 'detail',
        statementId,
        info: data.statementInfo as StatementInfo,
        details: (data.statementDetails || []) as StatementDetail[],
      })
    } catch {
      // Still show the detail view — it will fetch its own data
      setViewState({ view: 'detail', statementId })
    }
  }, [])

  const handleViewAll = useCallback(() => {
    const currentYear = getSearchParam('year')
    setSearchParams({ statement_id: null, year: currentYear, view: 'all' })
    setViewState({ view: 'all' })
  }, [])

  const handleBackToList = useCallback(() => {
    const currentYear = getSearchParam('year')
    setSearchParams({ statement_id: null, year: currentYear, view: null })
    setViewState({ view: 'list' })
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (!statements || statements.length === 0) {
    return (
      <div className="container mx-auto px-4 md:px-8 py-8">
        <div className="text-center p-8 bg-muted rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">No Statements Found</h2>
          <p className="mb-6 text-muted-foreground">This account doesn&apos;t have any statements yet.</p>
        </div>
        <AccountTaxDocumentsSection accountId={id} />
      </div>
    )
  }

  // Show all statements full-screen
  if (viewState.view === 'all') {
    return (
      <div className="container mx-auto">
        <AllStatementsView
          accountId={id}
          isOpen={true}
          onClose={handleBackToList}
          fullScreen
        />
      </div>
    )
  }

  // Show detail view if a statement is selected
  if (viewState.view === 'detail' && viewState.statementId) {
    return (
      <StatementDetailView
        accountId={id}
        statementId={viewState.statementId}
        preloadedInfo={viewState.info}
        preloadedDetails={viewState.details}
        onBack={handleBackToList}
      />
    )
  }

  // Show list view
  return (
    <StatementsListView
      accountId={id}
      statements={statements}
      onRefresh={fetchData}
      onViewDetail={handleViewDetail}
      onViewAll={handleViewAll}
    />
  )
}
