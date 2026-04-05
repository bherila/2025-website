'use client'

import { CheckCircle, Clock, Download, Eye, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocumentUploadModal from '@/components/finance/TaxDocumentUploadModal'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { EmploymentEntity, TaxDocument } from '@/types/finance/tax-document'

interface TaxDocumentsSectionProps {
  selectedYear: number | 'all'
  payslips: fin_payslip[]
  onDocumentReviewed?: () => void
}

export default function TaxDocumentsSection({ selectedYear, payslips, onDocumentReviewed }: TaxDocumentsSectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [entities, setEntities] = useState<EmploymentEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadModal, setUploadModal] = useState<{ entityId: number; formType: string } | null>(null)
  const [reviewModalDoc, setReviewModalDoc] = useState<TaxDocument | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({ form_type: 'w2,w2c' })
      if (typeof selectedYear === 'number') {
        params.set('year', String(selectedYear))
      }
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      setDocuments(data as TaxDocument[])
    } catch {
      setError('Failed to load tax documents')
    }
  }, [selectedYear])

  const fetchEntities = useCallback(async () => {
    try {
      const data = await fetchWrapper.get('/api/finance/employment-entities?visible_only=false')
      setEntities(Array.isArray(data) ? (data as EmploymentEntity[]) : [])
    } catch {
      // non-fatal: employment entities may just be empty
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchDocuments(), fetchEntities()]).finally(() => setLoading(false))
  }, [fetchDocuments, fetchEntities])

  const handleView = async (doc: TaxDocument) => {
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

  const handleToggleReconciled = async (doc: TaxDocument) => {
    try {
      await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}/reconciled`, {
        is_reconciled: !doc.is_reconciled,
      })
      await fetchDocuments()
    } catch {
      toast.error('Failed to update reconciliation status')
    }
  }

  const w2Entities = entities.filter(e => e.type === 'w2')

  const getDocsForEntity = (entityId: number) =>
    documents.filter(d => d.employment_entity_id === entityId)

  const renderProcessingBadge = (doc: TaxDocument) => {
    if (doc.genai_status === 'pending' || doc.genai_status === 'processing') {
      return (
        <Badge variant="outline" className="border-orange-400 text-orange-600 gap-1">
          <Clock className="h-3 w-3" />
          Processing
        </Badge>
      )
    }
    if (doc.genai_status === 'parsed' && doc.is_confirmed) {
      return <Badge variant="outline" className="border-green-500 text-green-600">Confirmed</Badge>
    }
    if (doc.genai_status === 'parsed') {
      return <Badge variant="outline" className="border-blue-400 text-blue-600">Ready for Review</Badge>
    }
    if (doc.genai_status === 'failed') {
      return <Badge variant="destructive">Failed</Badge>
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tax documents...
      </div>
    )
  }

  if (error) {
    return <div className="text-destructive text-sm">{error}</div>
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">W-2 Documents</h2>

      {w2Entities.length === 0 && (
        <p className="text-sm text-muted-foreground">No W-2 employers found.</p>
      )}

      {w2Entities.map(entity => {
        const entityDocs = getDocsForEntity(entity.id)
        return (
          <div key={entity.id} className="mb-4 border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <span className="font-medium text-sm">{entity.display_name}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadModal({ entityId: entity.id, formType: 'w2' })}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  W-2
                </Button>
              </div>
            </div>

            {entityDocs.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No documents uploaded</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entityDocs.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <Badge variant="secondary">{doc.form_type.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{doc.original_filename}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.human_file_size}</TableCell>
                      <TableCell>{renderProcessingBadge(doc)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`gap-1.5 h-8 ${doc.is_confirmed ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800' : ''}`}
                          onClick={() => setReviewModalDoc(doc)}
                        >
                          {doc.is_confirmed ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              Reviewed
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Review
                            </>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleView(doc)} title="View">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(doc)}
                            title="Download"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(doc)}
                            title={doc.is_reconciled ? 'Uncheck Reviewed to enable delete' : 'Delete'}
                            disabled={doc.is_reconciled}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )
      })}

      {/* Upload modal */}
      {uploadModal && (
        <TaxDocumentUploadModal
          open
          formType={uploadModal.formType}
          taxYear={typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear()}
          employmentEntityId={uploadModal.entityId}
          onSuccess={() => {
            setUploadModal(null)
            fetchDocuments()
          }}
          onCancel={() => setUploadModal(null)}
        />
      )}

      {/* Review Modal */}
      {reviewModalDoc && (
        <TaxDocumentReviewModal
          open
          taxYear={typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear()}
          document={reviewModalDoc}
          payslips={payslips.filter(p => p.employment_entity_id === reviewModalDoc.employment_entity_id)}
          onClose={() => setReviewModalDoc(null)}
          onDocumentReviewed={() => {
            setReviewModalDoc(null)
            fetchDocuments()
            onDocumentReviewed?.()
          }}
        />
      )}
    </div>
  )
}
