'use client'

import { CheckCircle, Clock, Download, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'
import type { TaxDocument } from '@/types/finance/tax-document'
import { ACCOUNT_FORM_TYPES_1099, FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxDocuments1099SectionProps {
  selectedYear: number
  onTotalsChange?: (totals: { interestIncome: number; dividendIncome: number; qualifiedDividends: number }) => void
}

export default function TaxDocuments1099Section({ selectedYear, onTotalsChange }: TaxDocuments1099SectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFormType, setUploadingFormType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        form_type: '1099_int,1099_int_c,1099_div,1099_div_c',
        year: String(selectedYear),
      })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      const docs = data as TaxDocument[]
      setDocuments(docs)

      // Compute totals from confirmed parsed data
      let interestIncome = 0
      let dividendIncome = 0
      let qualifiedDividends = 0
      for (const doc of docs) {
        if (!doc.parsed_data || !doc.is_confirmed) continue
        const pd = doc.parsed_data
        if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
          interestIncome += Number(pd.box1_interest ?? 0)
        }
        if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
          dividendIncome += Number(pd.box1a_ordinary ?? 0)
          qualifiedDividends += Number(pd.box1b_qualified ?? 0)
        }
      }
      onTotalsChange?.({ interestIncome, dividendIncome, qualifiedDividends })
    } catch {
      setError('Failed to load 1099 documents')
    }
  }, [selectedYear, onTotalsChange])

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
        tax_year: selectedYear,
        file_size_bytes: file.size,
        file_hash: fileHash,
        mime_type: file.type || 'application/pdf',
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

  return (
    <div>
      <h3 className="text-base font-semibold mb-2">1099 Documents</h3>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex flex-wrap gap-2 mb-3">
        {ACCOUNT_FORM_TYPES_1099.map(ft => (
          <Button key={ft} size="sm" variant="outline" onClick={() => handleUploadClick(ft)}>
            <Upload className="h-3 w-3 mr-1" />
            {FORM_TYPE_LABELS[ft]}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => handleUploadClick('1099_int')}>
          <Plus className="h-3 w-3 mr-1" />
          Other 1099-INT
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleUploadClick('1099_div')}>
          <Plus className="h-3 w-3 mr-1" />
          Other 1099-DIV
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">{error}</div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No 1099 documents for {selectedYear}.</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
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
              {documents.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Badge variant="secondary">{FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{doc.original_filename}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{doc.human_file_size}</TableCell>
                  <TableCell>{renderProcessingBadge(doc)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleReconciled(doc)}
                      className="h-auto p-1"
                      aria-label={
                        doc.is_reconciled
                          ? `Mark ${doc.original_filename} as unreconciled`
                          : `Mark ${doc.original_filename} as reconciled`
                      }
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
        </div>
      )}
    </div>
  )
}
