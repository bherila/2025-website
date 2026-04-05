'use client'

import { CheckCircle, Clock, Eye, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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
  /** Called whenever reviewed W-2 documents change (for Form 1040 data source). */
  onW2DocumentsChange?: (docs: TaxDocument[]) => void
}

export default function TaxDocumentsSection({ selectedYear, payslips, onDocumentReviewed, onW2DocumentsChange }: TaxDocumentsSectionProps) {
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
      const docs = data as TaxDocument[]
      setDocuments(docs)
      onW2DocumentsChange?.(docs.filter(d => d.is_reviewed))
    } catch {
      setError('Failed to load tax documents')
    }
  }, [selectedYear, onW2DocumentsChange])

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

  const w2Entities = entities.filter(e => e.type === 'w2')

  const getDocsForEntity = (entityId: number) =>
    documents.filter(d => d.employment_entity_id === entityId)

  /** Returns payslips filtered by entity id, falling back to all payslips when none match. */
  const getPayslipsForEntity = (entityId: number | null) => {
    const filtered = payslips.filter(p => p.employment_entity_id === entityId)
    return filtered.length > 0 ? filtered : payslips
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
                    <TableHead>Review</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entityDocs.map(doc => {
                    const isProcessing = doc.genai_status === 'pending' || doc.genai_status === 'processing'
                    const isFailed = doc.genai_status === 'failed'
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Badge variant="secondary">{doc.form_type.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{doc.original_filename}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.human_file_size}</TableCell>
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
                              className={`gap-1.5 h-8 ${doc.is_reviewed ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800' : ''}`}
                              onClick={() => setReviewModalDoc(doc)}
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
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-1.5 h-8 ${doc.is_reviewed ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900'}`}
                            onClick={() => setReviewModalDoc(doc)}
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
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
          payslips={getPayslipsForEntity(reviewModalDoc.employment_entity_id)}
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
