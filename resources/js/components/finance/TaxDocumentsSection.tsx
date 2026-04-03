'use client'

import { CheckCircle, Download, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'

interface TaxDocument {
  id: number
  user_id: number
  tax_year: number
  form_type: string
  employment_entity_id: number | null
  account_id: number | null
  original_filename: string
  stored_filename: string
  s3_path: string
  mime_type: string
  file_size_bytes: number
  file_hash: string
  is_reconciled: boolean
  notes: string | null
  human_file_size: string
  uploader: { id: number; name: string } | null
  employment_entity: { id: number; display_name: string } | null
  created_at: string
}

interface EmploymentEntity {
  id: number
  display_name: string
  type: string
  is_hidden: boolean
}

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
      const entityList = (data as { employment_entities?: EmploymentEntity[]; data?: EmploymentEntity[] } | EmploymentEntity[])
      if (Array.isArray(entityList)) {
        setEntities(entityList)
      } else if ('employment_entities' in entityList && Array.isArray(entityList.employment_entities)) {
        setEntities(entityList.employment_entities)
      } else if ('data' in entityList && Array.isArray(entityList.data)) {
        setEntities(entityList.data)
      }
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

  if (loading) {
    return (
      <div className="px-4 pb-4 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tax documents...
      </div>
    )
  }

  if (error) {
    return <div className="px-4 pb-4 text-destructive text-sm">{error}</div>
  }

  return (
    <div className="px-4 pb-6">
      <h2 className="text-lg font-semibold mt-4 mb-2">W-2 Documents</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {w2Entities.length === 0 && (
        <p className="text-sm text-muted-foreground">No W-2 employers found for this year.</p>
      )}

      {w2Entities.map(entity => {
        const entityDocs = getDocsForEntity(entity.id)
        return (
          <div key={entity.id} className="mb-4 border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <span className="font-medium text-sm">{entity.display_name}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleUploadClick(entity.id, 'w2')}>
                  <Upload className="h-3 w-3 mr-1" />
                  W-2
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleUploadClick(entity.id, 'w2c')}>
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
                      <TableCell>
                        <button
                          onClick={() => handleToggleReconciled(doc)}
                          className="flex items-center gap-1 text-sm"
                          title="Toggle reconciled"
                        >
                          <CheckCircle
                            className={`h-4 w-4 ${doc.is_reconciled ? 'text-green-600' : 'text-muted-foreground/40'}`}
                          />
                        </button>
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
