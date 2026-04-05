'use client'

import { CheckCircle, Download, Eye, FileText, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxDocumentReviewModalProps {
  open: boolean
  taxYear: number
  onClose: () => void
  /** Called when any document is reviewed so parent can refresh. */
  onDocumentReviewed?: () => void
}

/**
 * Renders a key–value row from the parsed_data object.
 */
function ParsedDataDisplay({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No parsed data available.</p>

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <span className="text-muted-foreground font-medium truncate">{key}</span>
          <span className="font-mono">
            {typeof value === 'boolean'
              ? value
                ? 'Yes'
                : 'No'
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function TaxDocumentReviewModal({
  open,
  taxYear,
  onClose,
  onDocumentReviewed,
}: TaxDocumentReviewModalProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState<number | null>(null)

  const fetchPending = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ year: String(taxYear), genai_status: 'parsed', is_confirmed: '0' })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      setDocuments(data as TaxDocument[])
    } catch {
      toast.error('Failed to load documents for review')
    } finally {
      setLoading(false)
    }
  }, [open, taxYear])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleView = async (doc: TaxDocument) => {
    if (!doc.s3_path) return
    try {
      const result = (await fetchWrapper.get(`/api/finance/tax-documents/${doc.id}/download`)) as {
        view_url: string
        download_url: string
      }
      window.open(result.view_url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Failed to get view link')
    }
  }

  const handleDownload = async (doc: TaxDocument) => {
    if (!doc.s3_path) return
    try {
      const result = (await fetchWrapper.get(`/api/finance/tax-documents/${doc.id}/download`)) as {
        view_url: string
        download_url: string
      }
      window.open(result.download_url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Failed to get download link')
    }
  }

  const handleMarkReviewed = async (doc: TaxDocument) => {
    setReviewing(doc.id)
    try {
      // Atomically confirm and mark as reviewed in one request
      await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}/mark-reviewed`, {})
      toast.success(`${FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type} marked as reviewed`)
      onDocumentReviewed?.()
      // Re-fetch to remove reviewed docs from list
      await fetchPending()
    } catch {
      toast.error('Failed to mark document as reviewed')
    } finally {
      setReviewing(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Documents — {taxYear}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="font-medium">All documents reviewed!</p>
              <p className="text-sm">No documents are waiting for review.</p>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {documents.map(doc => (
                <div key={doc.id} className="border rounded-lg p-3 space-y-2">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">
                        {FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}
                      </span>
                      {doc.account?.acct_name && (
                        <Badge variant="outline" className="text-xs">{doc.account.acct_name}</Badge>
                      )}
                      {doc.employment_entity?.display_name && (
                        <Badge variant="outline" className="text-xs">
                          {doc.employment_entity.display_name}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{doc.original_filename}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {doc.s3_path && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleView(doc)} title="View">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDownload(doc)} title="Download">
                            <Download className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={onClose}
                        title="Dismiss"
                        aria-label="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Parsed data */}
                  {doc.parsed_data && (
                    <div className="bg-muted/40 rounded p-2">
                      <ParsedDataDisplay data={doc.parsed_data as Record<string, unknown>} />
                    </div>
                  )}

                  {/* Review action */}
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleMarkReviewed(doc)}
                      disabled={reviewing === doc.id}
                      className="gap-1"
                    >
                      {reviewing === doc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      Mark as Reviewed
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
