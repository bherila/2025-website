'use client'

import { CheckCircle, Clock, Download, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'
import type { EmploymentEntity, TaxDocument } from '@/types/finance/tax-document'

interface TaxDocumentsSectionProps {
  selectedYear: number | 'all'
}

export default function TaxDocumentsSection({ selectedYear }: TaxDocumentsSectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [entities, setEntities] = useState<EmploymentEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<{ entityId: number; formType: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleUploadClick = (entityId: number, formType: string) => {
    setUploadingFor({ entityId, formType })
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingFor) return

    const { entityId, formType } = uploadingFor
    setUploadingFor(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    try {
      const fileHash = await computeFileSHA256(file)

      const uploadRequest = await fetchWrapper.post('/api/finance/tax-documents/request-upload', {
        filename: file.name,
        content_type: file.type || 'application/pdf',
        file_size: file.size,
      }) as { upload_url: string; s3_key: string; expires_in: number }

      const putResponse = await fetch(uploadRequest.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/pdf' },
      })

      if (!putResponse.ok) {
        throw new Error('Failed to upload file to storage')
      }

      await fetchWrapper.post('/api/finance/tax-documents', {
        s3_key: uploadRequest.s3_key,
        original_filename: file.name,
        form_type: formType,
        tax_year: typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear(),
        file_size_bytes: file.size,
        file_hash: fileHash,
        mime_type: file.type || 'application/pdf',
        employment_entity_id: entityId,
      })

      toast.success('Document uploaded successfully')
      await fetchDocuments()
    } catch (err) {
      toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleDownload = async (doc: TaxDocument) => {
    try {
      const result = await fetchWrapper.get(`/api/finance/tax-documents/${doc.id}/download`) as {
        download_url: string
      }
      window.open(result.download_url, '_blank')
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

  const entityHasW2 = (entityId: number) =>
    documents.some(d => d.employment_entity_id === entityId && d.form_type === 'w2')

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
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {w2Entities.length === 0 && (
        <p className="text-sm text-muted-foreground">No W-2 employers found.</p>
      )}

      {w2Entities.map(entity => {
        const entityDocs = getDocsForEntity(entity.id)
        const hasW2 = entityHasW2(entity.id)
        return (
          <div key={entity.id} className="mb-4 border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <span className="font-medium text-sm">{entity.display_name}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleUploadClick(entity.id, 'w2')}>
                  <Upload className="h-3 w-3 mr-1" />
                  W-2
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUploadClick(entity.id, 'w2c')}
                  disabled={!hasW2}
                  title={hasW2 ? 'Upload W-2c' : 'Upload a W-2 first before uploading W-2c'}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  W-2c
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
                    <TableHead>Reconciled</TableHead>
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
                          variant="ghost"
                          onClick={() => handleToggleReconciled(doc)}
                          aria-label={doc.is_reconciled ? 'Mark as unreconciled' : 'Mark as reconciled'}
                          aria-pressed={doc.is_reconciled}
                          title={doc.is_reconciled ? 'Mark as unreconciled' : 'Mark as reconciled'}
                        >
                          <CheckCircle
                            className={`h-4 w-4 ${doc.is_reconciled ? 'text-green-600' : 'text-muted-foreground/40'}`}
                          />
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)} title="Download">
                            <Download className="h-3 w-3" />
                          </Button>
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
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )
      })}
    </div>
  )
}
