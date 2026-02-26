import { Download, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

import type { StatementDetail, StatementInfo } from '../StatementDetailsModal'

interface StatementDetailViewProps {
  accountId: number
  statementId: number
  /** Preloaded data (to avoid re-fetching when navigating from list) */
  preloadedInfo?: StatementInfo | undefined
  preloadedDetails?: StatementDetail[] | undefined
  onBack: () => void
  year?: number | undefined
}

export default function StatementDetailView({
  accountId,
  statementId,
  preloadedInfo,
  preloadedDetails,
  onBack,
  year,
}: StatementDetailViewProps) {
  const [statementInfo, setStatementInfo] = useState<StatementInfo | undefined>(preloadedInfo)
  const [statementDetails, setStatementDetails] = useState<StatementDetail[]>(preloadedDetails ?? [])
  const [isLoading, setIsLoading] = useState(!preloadedDetails)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<{ view_url: string; download_url: string; filename: string } | null>(null)
  const [pdfError, setPdfError] = useState(false)

  // Fetch data if not preloaded
  useEffect(() => {
    if (preloadedDetails && preloadedDetails.length > 0) return
    const fetchDetails = async () => {
      setIsLoading(true)
      try {
        const data = await fetchWrapper.get(`/api/finance/statement/${statementId}/details`)
        setStatementInfo(data.statementInfo)
        setStatementDetails(data.statementDetails || [])
      } catch (error) {
        console.error('Error fetching statement details:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDetails()
  }, [statementId, preloadedDetails])

  // Check if there's a PDF file for this statement
  useEffect(() => {
    const checkPdf = async () => {
      setPdfLoading(true)
      setPdfError(false)
      try {
        const data = await fetchWrapper.get(`/api/finance/${accountId}/statements/${statementId}/pdf`)
        setPdfUrl(data)
      } catch {
        // No PDF attached — that's fine
        setPdfError(true)
      } finally {
        setPdfLoading(false)
      }
    }
    checkPdf()
  }, [accountId, statementId])

  const handleViewPdf = useCallback(() => {
    if (pdfUrl?.view_url) {
      window.open(pdfUrl.view_url, '_blank')
    }
  }, [pdfUrl])

  const handleDownloadPdf = useCallback(() => {
    if (pdfUrl?.download_url) {
      window.open(pdfUrl.download_url, '_blank')
    }
  }, [pdfUrl])

  // Group details by section
  const detailsBySection = statementDetails.reduce((acc, detail) => {
    const section = detail.section
    if (!acc[section]) {
      acc[section] = []
    }
    acc[section]!.push(detail)
    return acc
  }, {} as Record<string, StatementDetail[]>)

  const formatValue = (value: number | null | undefined, isPercentage: boolean) => {
    if (value == null) {
      return '-'
    }
    if (isPercentage) {
      return `${value.toFixed(2)}%`
    }
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="px-8 py-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button
          onClick={onBack}
          className="hover:text-foreground hover:underline transition-colors"
        >
          Statements
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">
          Statement Details
          {statementInfo?.periodEnd && ` — ${statementInfo.periodEnd}`}
        </span>
      </nav>

      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">
            {statementInfo?.brokerName || 'Statement Details'}
            {statementInfo?.accountNumber && ` — ${statementInfo.accountNumber}`}
          </h2>
          <div className="text-sm text-muted-foreground mt-1 flex gap-4">
            {statementInfo?.periodStart && statementInfo?.periodEnd && (
              <span>Period: {statementInfo.periodStart} to {statementInfo.periodEnd}</span>
            )}
            {statementInfo?.closingBalance != null && (
              <span>
                Closing Balance: {statementInfo.closingBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
            )}
          </div>
        </div>

        {/* PDF buttons */}
        {!pdfLoading && pdfUrl && !pdfError && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleViewPdf}>
              <ExternalLink className="h-4 w-4 mr-1" />
              View Original PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {/* Statement details sections */}
      <div className="space-y-6">
        {Object.entries(detailsBySection).length === 0 ? (
          <p className="text-muted-foreground">No details found for this statement.</p>
        ) : (
          Object.entries(detailsBySection).map(([section, details]) => (
            <div key={section}>
              <h3 className="font-semibold text-lg mb-2 border-b pb-1">{section}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line Item</TableHead>
                    <TableHead className="text-right">Statement Period</TableHead>
                    <TableHead className="text-right">YTD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((detail, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{detail.line_item}</TableCell>
                      <TableCell className={`text-right ${detail.statement_period_value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {formatValue(detail.statement_period_value, detail.is_percentage)}
                      </TableCell>
                      <TableCell className={`text-right ${detail.ytd_value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {formatValue(detail.ytd_value, detail.is_percentage)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </div>

      {/* Back button at bottom */}
      <div className="mt-8">
        <Button variant="outline" onClick={onBack}>
          ← Back to Statements
        </Button>
      </div>
    </div>
  )
}
