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
  account: { acct_id: number; acct_name: string } | null
  created_at: string
}

interface AccountTaxDocumentsSectionProps {
  accountId: number
  selectedYear?: number
}

const FORM_TYPES_1099 = ['1099_int', '1099_int_c', '1099_div', '1099_div_c'] as const
const FORM_TYPE_LABELS: Record<string, string> = {
  '1099_int': '1099-INT',
  '1099_int_c': '1099-INT-C',
  '1099_div': '1099-DIV',
  '1099_div_c': '1099-DIV-C',
}

export default function AccountTaxDocumentsSection({ accountId, selectedYear }: AccountTaxDocumentsSectionProps) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(selectedYear ?? currentYear)
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFormType, setUploadingFormType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setLoading(true)
    fetchDocuments().finally(() => setLoading(false))
  }, [fetchDocuments])

  const handleUploadClick = (formType: string) => {
    setUploadingFormType(formType)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingFormType) return

    const formType = uploadingFormType
    setUploadingFormType(null)
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
        tax_year: year,
        file_size_bytes: file.size,
        file_hash: fileHash,
        mime_type: file.type || 'application/pdf',
        account_id: accountId,
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

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex flex-wrap gap-2 mb-3">
        {FORM_TYPES_1099.map(ft => (
          <Button key={ft} size="sm" variant="outline" onClick={() => handleUploadClick(ft)}>
            <Upload className="h-3 w-3 mr-1" />
            {FORM_TYPE_LABELS[ft]}
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
                <TableHead>Size</TableHead>
                <TableHead>Reconciled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Badge variant="secondary">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</Badge>
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
        </div>
      )}
    </div>
  )
}
