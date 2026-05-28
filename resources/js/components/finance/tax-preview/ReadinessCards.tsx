import { AlertCircle, AlertTriangle, CheckCircle, FileText, ListTodo } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchWrapper } from '@/fetchWrapper'

interface ReadinessSummary {
  year: number
  documents_by_kind: {
    w2: number
    '1099_div': number
    '1099_int': number
    '1099_b': number
    '1099_r': number
    k1: number
    other: number
  }
  pending_review_count: number
  missing_account_count: number
  parsing_failure_count: number
  reconciliation_health: {
    ok: number
    drift: number
    blocked: number
  }
  last_matcher_run_at: string | null
}

type ReadinessFormTarget = 'documents' | 'tax-lot-reconciliation'

interface ReadinessCardsProps {
  year: number
  onOpenForm?: (formId: ReadinessFormTarget) => void
}

export function ReadinessCards({ year, onOpenForm }: ReadinessCardsProps): React.ReactElement {
  const [summary, setSummary] = useState<ReadinessSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    fetchWrapper
      .get(`/api/finance/tax-years/${year}/readiness-summary`)
      .then((data) => {
        if (mounted) {
          setSummary(data as ReadinessSummary)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [year])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-5 bg-muted rounded w-3/4" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !summary) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Readiness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || 'Failed to load readiness summary'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalDocuments =
    summary.documents_by_kind.w2 +
    summary.documents_by_kind['1099_div'] +
    summary.documents_by_kind['1099_int'] +
    summary.documents_by_kind['1099_b'] +
    summary.documents_by_kind['1099_r'] +
    summary.documents_by_kind.k1 +
    summary.documents_by_kind.other

  const hasReconciliationIssues = summary.reconciliation_health.drift > 0 || summary.reconciliation_health.blocked > 0
  const totalActionItems = summary.pending_review_count + summary.missing_account_count + summary.parsing_failure_count
  const hasActionItems = totalActionItems > 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Documents / Imports Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Documents
          </CardTitle>
          <CardDescription>{year} tax forms and imports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl font-bold">{totalDocuments}</div>
            <div className="text-xs text-muted-foreground">
              {summary.documents_by_kind.w2} W-2{summary.documents_by_kind.w2 !== 1 ? 's' : ''} •{' '}
              {summary.documents_by_kind['1099_b']} 1099-B{summary.documents_by_kind['1099_b'] !== 1 ? 's' : ''} •{' '}
              {summary.documents_by_kind['1099_div'] + summary.documents_by_kind['1099_int']} other 1099s
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <a href="/finance/documents">View All</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tax Source Review Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {summary.pending_review_count === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
            Tax Source Review
          </CardTitle>
          <CardDescription>Imported data awaiting review</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {summary.pending_review_count === 0 ? (
              <>
                <div className="text-sm font-medium text-green-600">All Reviewed</div>
                <p className="text-xs text-muted-foreground">No documents pending review</p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-600">{summary.pending_review_count}</div>
                <p className="text-xs text-muted-foreground">Documents need review</p>
                <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                  <a href="/finance/documents?is_reviewed=0">Review Now</a>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 1099-B Reconcile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {!hasReconciliationIssues ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : summary.reconciliation_health.blocked > 0 ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            1099-B Reconcile
          </CardTitle>
          <CardDescription>Broker lot matching status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {!hasReconciliationIssues ? (
              <>
                <div className="text-sm font-medium text-green-600">All Synced</div>
                <p className="text-xs text-muted-foreground">
                  {summary.reconciliation_health.ok} document{summary.reconciliation_health.ok !== 1 ? 's' : ''} in
                  sync
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {summary.reconciliation_health.drift > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      {summary.reconciliation_health.drift} drift
                    </Badge>
                  )}
                  {summary.reconciliation_health.blocked > 0 && (
                    <Badge variant="outline" className="text-destructive border-destructive">
                      {summary.reconciliation_health.blocked} blocked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.reconciliation_health.ok} ok •{' '}
                  {summary.reconciliation_health.drift + summary.reconciliation_health.blocked} need attention
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => onOpenForm?.('tax-lot-reconciliation')}
                >
                  View Details
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Items Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {!hasActionItems ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <ListTodo className="h-5 w-5 text-amber-600" />
            )}
            Action Items
          </CardTitle>
          <CardDescription>Tasks requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {!hasActionItems ? (
              <>
                <div className="text-sm font-medium text-green-600">All Clear</div>
                <p className="text-xs text-muted-foreground">No pending action items</p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{totalActionItems}</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  {summary.missing_account_count > 0 && (
                    <div>• {summary.missing_account_count} missing account link{summary.missing_account_count !== 1 ? 's' : ''}</div>
                  )}
                  {summary.pending_review_count > 0 && (
                    <div>• {summary.pending_review_count} unreviewed doc{summary.pending_review_count !== 1 ? 's' : ''}</div>
                  )}
                  {summary.parsing_failure_count > 0 && (
                    <div>• {summary.parsing_failure_count} parsing failure{summary.parsing_failure_count !== 1 ? 's' : ''}</div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                  <a href="/finance/documents">Take Action</a>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
