'use client'
import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'

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

export default function FinanceAccountStatementsPage({ id }: { id: number }) {
  const [statements, setStatements] = useState<StatementSnapshot[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // URL-driven detail view state
  const [detailView, setDetailView] = useState<DetailViewState | null>(() => {
    const sid = getSearchParam('statement_id')
    return sid ? { statementId: parseInt(sid, 10) } : null
  })

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const sid = getSearchParam('statement_id')
      if (sid) {
        setDetailView({ statementId: parseInt(sid, 10) })
      } else {
        setDetailView(null)
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
    setSearchParams({ statement_id: String(statementId), year: currentYear })

    // Pre-fetch details
    try {
      const data = await fetchWrapper.get(`/api/finance/statement/${statementId}/details`)
      setDetailView({
        statementId,
        info: data.statementInfo as StatementInfo,
        details: (data.statementDetails || []) as StatementDetail[],
      })
    } catch {
      // Still show the detail view — it will fetch its own data
      setDetailView({ statementId })
    }
  }, [])

  const handleBackToList = useCallback(() => {
    const currentYear = getSearchParam('year')
    setSearchParams({ statement_id: null, year: currentYear })
    setDetailView(null)
  }, [])

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!statements || statements.length === 0) {
    return (
      <div className="text-center p-8 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">No Statements Found</h2>
        <p className="mb-6">This account doesn&apos;t have any statements yet.</p>
      </div>
    )
  }

  // Show detail view if a statement is selected
  if (detailView) {
    return (
      <StatementDetailView
        accountId={id}
        statementId={detailView.statementId}
        preloadedInfo={detailView.info}
        preloadedDetails={detailView.details}
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
    />
  )
}
