'use client'

import { CheckCircle, Clock, Download, Eye, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocumentUploadModal from '@/components/finance/TaxDocumentUploadModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { ACCOUNT_FORM_TYPES_1099, FORM_TYPE_LABELS } from '@/types/finance/tax-document'

const IN_FLIGHT_STATUSES = new Set(['pending', 'processing'])
const POLLING_INTERVAL_MS = 5_000

interface AccountTaxDocumentsSectionProps {
  accountId: number
  selectedYear?: number
}

export default function AccountTaxDocumentsSection({ accountId, selectedYear }: AccountTaxDocumentsSectionProps) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(selectedYear ?? currentYear)
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadModalState, setUploadModalState] = useState<{ formType: string } | null>(null)
  const [reviewDoc, setReviewDoc] = useState<TaxDocument | null>(null)
  const [reviewLink, setReviewLink] = useState<TaxDocumentAccountLink | null>(null)
  const hasLoadedOnce = useRef(false)

  const availableYears = Array.from({ length: currentYear - 2018 }, (_, i) => currentYear - i)

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        account_id: String(accountId),
        year: String(year),
      })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      setDocuments(data as TaxDocument[])
    } catch {
      setError('Failed to load tax documents')
    }
  }, [accountId, year])

  useEffect(() => {
    if (!hasLoadedOnce.current) setLoading(true)
    fetchDocuments().finally(() => {
      hasLoadedOnce.current = true
      setLoading(false)
    })
  }, [fetchDocuments])

  // Poll every 5 s while any document is still being processed by the AI.
  useEffect(() => {
    const hasInFlight = documents.some(d => IN_FLIGHT_STATUSES.has(d.genai_status ?? ''))
    if (!hasInFlight) return
    const id = setInterval(() => void fetchDocuments(), POLLING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [documents, fetchDocuments])

  const handleDownload = async (doc: TaxDocument) => {
    if (!doc.s3_path) return
    try {
      const result = (await fetchWrapper.get(`/api/finance/tax-documents/${doc.id}/download`)) as {
        download_url: string
      }
      window.open(result.download_url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Failed to get download link')
    }
  }

  const handleDelete = async (doc: TaxDocument) => {
    if (!confirm(`Delete "${doc.original_filename}"?`)) return
    try {
      await fetchWrapper.delete(`/api/finance/tax-documents/${doc.id}`, {})
      toast.success('Document deleted')
      await fetchDocuments()
    } catch {
      toast.error('Failed to delete document')
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">1099 Tax Documents</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Year:</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {ACCOUNT_FORM_TYPES_1099.map(ft => (
          <Button key={ft} size="sm" variant="outline" onClick={() => setUploadModalState({ formType: ft })}>
            <Upload className="h-3 w-3 mr-1" />
            {FORM_TYPE_LABELS[ft] ?? ft}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">{error}</div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No 1099 documents for {year}.</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Filename</TableHead>
                <TableHead>Review</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map(doc => {
                const isProcessing = doc.genai_status === 'pending' || doc.genai_status === 'processing'
                const isFailed = doc.genai_status === 'failed'
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Badge variant="secondary">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{doc.original_filename}</TableCell>
                    <TableCell>
                      {isProcessing ? (
                        <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 border-orange-300 text-orange-600">
                          <Clock className="h-3.5 w-3.5 animate-pulse" />
                          Processing
                        </Button>
                      ) : isFailed ? (
                        <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 border-destructive text-destructive">
                          Failed
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`gap-1.5 h-8 ${doc.is_reviewed ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900'}`}
                          onClick={() => {
                            // For broker_1099 docs, find the matching link for this account.
                            const link = doc.form_type === 'broker_1099'
                              ? (doc.account_links ?? []).find(l => l.account_id === accountId) ?? null
                              : null
                            setReviewDoc(doc)
                            setReviewLink(link)
                          }}
                          title={doc.is_reviewed ? 'Reviewed' : 'Review document'}
                        >
                          {doc.is_reviewed ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              Reviewed
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Needs Review
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {doc.s3_path && (
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)} title="Download">
                            <Download className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {uploadModalState && (
        <TaxDocumentUploadModal
          open
          formType={uploadModalState.formType}
          taxYear={year}
          accountId={accountId}
          onSuccess={() => {
            setUploadModalState(null)
            void fetchDocuments()
          }}
          onCancel={() => setUploadModalState(null)}
        />
      )}

      {reviewDoc && (
        <TaxDocumentReviewModal
          open
          taxYear={year}
          document={reviewDoc}
          accountLink={reviewLink ?? undefined}
          onClose={() => { setReviewDoc(null); setReviewLink(null) }}
          onDocumentReviewed={() => {
            setReviewDoc(null)
            setReviewLink(null)
            void fetchDocuments()
          }}
        />
      )}
    </div>
  )
}
