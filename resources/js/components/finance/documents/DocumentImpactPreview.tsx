import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'

import type { DocumentImpactPreviewData, FinanceDocument } from './types'

interface DocumentImpactPreviewProps {
  document: FinanceDocument
  onConfirmDelete: (hash: string) => void
  onCancel: () => void
}

export default function DocumentImpactPreview({ document, onConfirmDelete, onCancel }: DocumentImpactPreviewProps) {
  const [preview, setPreview] = useState<DocumentImpactPreviewData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = (await fetchWrapper.get(
        `/api/finance/documents/${document.id}/impact-preview`,
      )) as DocumentImpactPreviewData
      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load impact preview')
    } finally {
      setIsLoading(false)
    }
  }, [document.id])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Loading impact analysis...</div>
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  if (!preview) return null

  const { summary } = preview
  const statementDetails = summary.statement_details ?? 0
  const statementCashReports = summary.statement_cash_reports ?? 0
  const statementNav = summary.statement_nav ?? 0
  const statementPerformance = summary.statement_performance ?? 0
  const statementPositions = summary.statement_positions ?? 0
  const statementSecuritiesLent = summary.statement_securities_lent ?? 0
  const transactions = summary.transactions ?? 0
  const form1116Overrides = summary.form1116_overrides ?? 0
  const hasImpact = summary.account_links > 0
    || summary.statements > 0
    || statementDetails > 0
    || statementCashReports > 0
    || statementNav > 0
    || statementPerformance > 0
    || statementPositions > 0
    || statementSecuritiesLent > 0
    || transactions > 0
    || summary.lots > 0
    || summary.has_tax_document
    || form1116Overrides > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Delete Document</h3>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the document and all associated data.
          </p>
        </div>
      </div>

      {hasImpact && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Affected records</p>
          <ul className="space-y-1 text-sm">
            {summary.account_links > 0 && (
              <li>
                {summary.account_links} account link{summary.account_links > 1 ? 's' : ''}
              </li>
            )}
            {summary.statements > 0 && (
              <li>
                {summary.statements} statement{summary.statements > 1 ? 's' : ''}
              </li>
            )}
            {statementDetails > 0 && (
              <li>
                {statementDetails} statement detail{statementDetails > 1 ? 's' : ''}
              </li>
            )}
            {statementCashReports > 0 && (
              <li>
                {statementCashReports} statement cash report{statementCashReports > 1 ? 's' : ''}
              </li>
            )}
            {statementNav > 0 && (
              <li>
                {statementNav} statement NAV row{statementNav > 1 ? 's' : ''}
              </li>
            )}
            {statementPerformance > 0 && (
              <li>
                {statementPerformance} statement performance row{statementPerformance > 1 ? 's' : ''}
              </li>
            )}
            {statementPositions > 0 && (
              <li>
                {statementPositions} statement position{statementPositions > 1 ? 's' : ''}
              </li>
            )}
            {statementSecuritiesLent > 0 && (
              <li>
                {statementSecuritiesLent} securities-lent row{statementSecuritiesLent > 1 ? 's' : ''}
              </li>
            )}
            {transactions > 0 && (
              <li>
                {transactions} transaction{transactions > 1 ? 's' : ''}
              </li>
            )}
            {summary.lots > 0 && (
              <li>
                {summary.lots} lot{summary.lots > 1 ? 's' : ''}
              </li>
            )}
            {summary.has_tax_document && <li>1 tax document record</li>}
            {form1116Overrides > 0 && (
              <li>
                {form1116Overrides} Form 1116 override{form1116Overrides > 1 ? 's' : ''}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onConfirmDelete(preview.impact_hash)}>
          Delete permanently
        </Button>
      </div>
    </div>
  )
}
