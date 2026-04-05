'use client'

import currency from 'currency.js'
import { CheckCircle, ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import PayslipDataSourceModal from '@/components/finance/PayslipDataSourceModal'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument, W2ParsedData } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxDocumentReviewModalProps {
  open: boolean
  taxYear: number
  /** If provided, review this specific document. If not, fetch all pending. */
  document?: TaxDocument
  /** Optional payslips for comparison (specific to the entity/employer if possible) */
  payslips?: fin_payslip[]
  onClose: () => void
  /** Called when any document is reviewed so parent can refresh. */
  onDocumentReviewed?: () => void
}

/**
 * Renders a comparison table for W-2 documents.
 */
function W2Comparison({ parsed, payslips }: { parsed: W2ParsedData; payslips: fin_payslip[] }) {
  const [dataSourceRow, setDataSourceRow] = useState<{
    label: string
    getter: (p: fin_payslip) => currency
  } | null>(null)

  const sum = (fn: (row: fin_payslip) => currency) =>
    payslips.reduce((acc, row) => acc.add(fn(row)), currency(0))

  const wagesGetter = (r: fin_payslip) =>
    currency(r.ps_salary ?? 0)
      .add(r.earnings_bonus ?? 0)
      .add(r.earnings_rsu ?? 0)
      .add(r.ps_vacation_payout ?? 0)
      .add(r.imp_ltd ?? 0)
      .add(r.imp_legal ?? 0)
      .add(r.imp_fitness ?? 0)
      .add(r.imp_other ?? 0)
      .subtract(r.ps_pretax_medical ?? 0)
      .subtract(r.ps_pretax_fsa ?? 0)
      .subtract(r.ps_401k_pretax ?? 0)
      .subtract(r.ps_pretax_dental ?? 0)
      .subtract(r.ps_pretax_vision ?? 0)

  const fedWHGetter = (r: fin_payslip) =>
    currency(r.ps_fed_tax ?? 0)
      .add(r.ps_fed_tax_addl ?? 0)
      .subtract(r.ps_fed_tax_refunded ?? 0)

  const stateWHGetter = (r: fin_payslip) =>
    currency(r.ps_state_tax ?? 0).add(r.ps_state_tax_addl ?? 0)

  const oasdiGetter = (r: fin_payslip) => currency(r.ps_oasdi ?? 0)
  const medicareGetter = (r: fin_payslip) => currency(r.ps_medicare ?? 0)

  const wages = sum(wagesGetter)
  const fedWH = sum(fedWHGetter)
  const stateWH = sum(stateWHGetter)
  const oasdi = sum(oasdiGetter)
  const medicare = sum(medicareGetter)

  const rows = [
    { label: 'Box 1: Wages, tips, other compensation', parsed: currency(parsed.box1_wages ?? 0), calculated: wages, getter: wagesGetter },
    { label: 'Box 2: Federal income tax withheld', parsed: currency(parsed.box2_fed_tax ?? 0), calculated: fedWH, getter: fedWHGetter },
    { label: 'Box 4: Social security tax withheld', parsed: currency(parsed.box4_ss_tax ?? 0), calculated: oasdi, getter: oasdiGetter },
    { label: 'Box 6: Medicare tax withheld', parsed: currency(parsed.box6_medicare_tax ?? 0), calculated: medicare, getter: medicareGetter },
    { label: 'Box 17: State income tax', parsed: currency(parsed.box17_state_tax ?? 0), calculated: stateWH, getter: stateWHGetter },
  ]

  return (
    <>
      <div className="mt-4 border rounded-lg overflow-hidden">
        <div className="bg-muted/30 px-3 py-1.5 text-xs font-semibold border-b">Comparison: W-2 vs. Payslips</div>
        <Table className="text-xs">
          <TableHeader className="bg-muted/10">
            <TableRow>
              <TableHead className="h-8">Field</TableHead>
              <TableHead className="text-right h-8">W-2 Form</TableHead>
              <TableHead className="text-right h-8">Payslips ({payslips.length})</TableHead>
              <TableHead className="text-right h-8">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const diff = row.parsed.subtract(row.calculated)
              const isError = Math.abs(diff.value) > 0.01
              return (
                <TableRow key={row.label} className="h-8">
                  <TableCell className="py-1 font-medium">{row.label}</TableCell>
                  <TableCell className="py-1 text-right font-mono">{row.parsed.format()}</TableCell>
                  <TableCell className="py-1 text-right font-mono">
                    <button
                      type="button"
                      className="underline decoration-dotted cursor-pointer hover:text-primary"
                      onClick={() => setDataSourceRow({ label: row.label, getter: row.getter })}
                      title="View data sources"
                    >
                      {row.calculated.format()}
                    </button>
                  </TableCell>
                  <TableCell className={`py-1 text-right font-mono ${isError ? 'text-destructive font-bold' : 'text-green-600'}`}>
                    {isError ? diff.format() : 'Match'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {dataSourceRow && (
        <PayslipDataSourceModal
          open
          label={dataSourceRow.label}
          payslips={payslips}
          valueGetter={dataSourceRow.getter}
          onClose={() => setDataSourceRow(null)}
        />
      )}
    </>
  )
}

/**
 * Editor for the parsed_data object.
 */
function ParsedDataEditor({ 
  data, 
  onChange,
  readOnly = false,
}: { 
  data: Record<string, unknown>, 
  onChange: (newData: Record<string, unknown>) => void
  readOnly?: boolean
}) {
  // Exclude nested objects/arrays, but include null (typeof null === 'object')
  const entries = Object.entries(data).filter(([, v]) => v === null || typeof v !== 'object')
  
  const handleFieldChange = (key: string, value: string) => {
    if (readOnly) return
    const isPossiblyNumeric = key.startsWith('box') || key.includes('wages') || key.includes('tax') || key.includes('amount') || key.includes('interest') || key.includes('dividend')
    let finalValue: any = value
    if (value === '') {
      finalValue = null
    } else if (isPossiblyNumeric) {
      const c = currency(value)
      // Check if it's actually numeric or something else
      if (!isNaN(c.value) && String(c.value) !== '0' || value.match(/[0-9]/)) {
        finalValue = c.value
      }
    }
    onChange({ ...data, [key]: finalValue })
  }

  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No parsed data available.</p>

  return (
    <div className="space-y-1.5 py-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 group">
          <label className="text-[10px] text-muted-foreground font-mono w-1/2 truncate select-none cursor-help" title={key}>
            {key.replace(/_/g, ' ')}
          </label>
          <div className="w-1/2">
            <Input 
              className={`h-6 text-[11px] font-mono px-1.5 text-right rounded-sm ${readOnly ? 'bg-muted/30 border-transparent text-muted-foreground cursor-default focus-visible:ring-0' : 'bg-background border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-primary/40'}`}
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              readOnly={readOnly}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TaxDocumentReviewModal({
  open,
  taxYear,
  document: propDocument,
  payslips = [],
  onClose,
  onDocumentReviewed,
}: TaxDocumentReviewModalProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // Local editor state for the active document
  const [notes, setNotes] = useState('')
  const [editData, setEditData] = useState<Record<string, any>>({})

  const activeDoc = documents[currentIndex]

  const fetchPending = useCallback(async () => {
    if (!open) return
    if (propDocument) {
      setDocuments([propDocument])
      setCurrentIndex(0)
      setNotes(propDocument.notes ?? '')
      setEditData((propDocument.parsed_data as Record<string, any>) || {})
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({ year: String(taxYear), genai_status: 'parsed', is_reviewed: '0' })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      const docs = data as TaxDocument[]
      setDocuments(docs)
      setCurrentIndex(0)
      if (docs.length > 0) {
        const d = docs[0];
        if (d) {
          setNotes(d.notes ?? '')
          setEditData((d.parsed_data as Record<string, any>) || {})
        }
      }
    } catch {
      toast.error('Failed to load documents for review')
    } finally {
      setLoading(false)
    }
  }, [open, propDocument, taxYear])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  // Navigation handlers for multi-doc mode
  const goToNext = () => {
    if (currentIndex < documents.length - 1) {
      const nextIdx = currentIndex + 1
      const doc = documents[nextIdx]
      if (doc) {
        setCurrentIndex(nextIdx)
        setNotes(doc.notes ?? '')
        setEditData((doc.parsed_data as Record<string, any>) || {})
      }
    }
  }

  const goToPrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1
      const doc = documents[prevIdx]
      if (doc) {
        setCurrentIndex(prevIdx)
        setNotes(doc.notes ?? '')
        setEditData((doc.parsed_data as Record<string, any>) || {})
      }
    }
  }

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

  const handleDelete = async (doc: TaxDocument) => {
    if (!confirm(`Delete "${doc.original_filename}"? This action cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetchWrapper.delete(`/api/finance/tax-documents/${doc.id}`, {})
      toast.success('Document deleted')
      // Remove from local list
      const newDocs = documents.filter(d => d.id !== doc.id)
      if (newDocs.length === 0) {
        onDocumentReviewed?.()
        onClose()
      } else {
        setDocuments(newDocs)
        const newIdx = Math.min(currentIndex, newDocs.length - 1)
        const nextDoc = newDocs[newIdx]
        if (nextDoc) {
          setCurrentIndex(newIdx)
          setNotes(nextDoc.notes ?? '')
          setEditData((nextDoc.parsed_data as Record<string, any>) || {})
        }
      }
    } catch {
      toast.error('Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }

  const handleUpdate = async (doc: TaxDocument, isReviewed: boolean) => {
    setSaving(true)
    try {
      const isReviewToggling = isReviewed !== doc.is_reviewed
      const payload: any = { notes, parsed_data: editData }
      
      // Only include is_reviewed if we are explicitly changing it
      if (isReviewToggling) {
        payload.is_reviewed = isReviewed
      }

      if (isReviewed && isReviewToggling) {
        // markReviewed endpoint handles marking as reviewed + optional notes/parsed_data
        await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}/mark-reviewed`, payload)
        toast.success('Document marked as reviewed')
      } else {
        // generic update
        await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, payload)
        toast.success(isReviewToggling ? 'Review status updated' : 'Changes saved')
      }

      // Update local state immutably
      setDocuments(prev => prev.map(d => d.id === doc.id ? { 
        ...d, 
        notes, 
        parsed_data: JSON.parse(JSON.stringify(editData)), // deep clone
        is_reviewed: isReviewed
      } : d))

      onDocumentReviewed?.()

      if (isReviewed && isReviewToggling) {
        if (propDocument) {
          onClose()
        } else if (currentIndex < documents.length - 1) {
          goToNext()
        }
      }
    } catch {
      toast.error('Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-4">
        <DialogHeader className="px-1">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>
              {propDocument ? 'Review Document' : `Review Documents (${currentIndex + 1} of ${documents.length})`}
            </DialogTitle>
            {!propDocument && documents.length > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrev} disabled={currentIndex === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNext} disabled={currentIndex === documents.length - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading...
            </div>
          ) : !activeDoc ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
              <p className="font-semibold text-foreground">All documents reviewed!</p>
              <p className="text-sm max-w-xs">No documents are currently waiting for your review.</p>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                {/* Header info */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-bold text-base leading-none">
                        {FORM_TYPE_LABELS[activeDoc.form_type] ?? activeDoc.form_type}
                      </h3>
                      {activeDoc.is_reviewed && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Reviewed</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      {activeDoc.employment_entity?.display_name && (
                        <span className="font-medium text-foreground">{activeDoc.employment_entity.display_name}</span>
                      )}
                      <span className="text-muted-foreground/30">•</span>
                      <span>{taxYear}</span>
                      <span className="text-muted-foreground/30">•</span>
                      <span className="truncate max-w-[200px]">{activeDoc.original_filename}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {activeDoc.s3_path && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => handleView(activeDoc)}>
                          <Eye className="h-3.5 w-3.5" />
                          View PDF
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(activeDoc)} title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left side: Parsed Data Detail */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extracted Data</div>
                      {activeDoc.is_reviewed ? (
                        <div className="text-[10px] text-muted-foreground/60 italic">Read-only (confirmed)</div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/60 italic">Mistakes? Correct them below</div>
                      )}
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 border border-muted-foreground/10 h-full max-h-[300px] overflow-y-auto">
                      <ParsedDataEditor data={editData} onChange={setEditData} readOnly={activeDoc.is_reviewed} />
                    </div>
                  </div>

                  {/* Right side: Notes */}
                  <div className="space-y-3 flex flex-col">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Review Notes</div>
                    <div className="flex-1 min-h-[140px]">
                      <Textarea 
                        className="h-full resize-none text-sm leading-relaxed" 
                        placeholder="Add notes about this document or discrepancies found..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        readOnly={activeDoc.is_reviewed}
                      />
                    </div>
                    {!activeDoc.is_reviewed && (
                      <div className="flex justify-end pt-1">
                        <Button
                          variant="ghost" 
                          size="sm" 
                          className="text-xs gap-1 h-8"
                          disabled={saving}
                          onClick={() => handleUpdate(activeDoc, activeDoc.is_reviewed)}
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save Changes
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comparison Table (for W-2s) */}
                {activeDoc.form_type.startsWith('w2') && editData && (
                  <W2Comparison 
                    parsed={editData as W2ParsedData} 
                    payslips={payslips}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 px-1">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>Close</Button>
              {activeDoc && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(activeDoc)}
                  disabled={deleting || activeDoc.is_reviewed}
                  title={activeDoc.is_reviewed ? 'Reopen for review before deleting' : 'Delete document'}
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </Button>
              )}
            </div>
            {activeDoc && (
               <Button
                size="default"
                onClick={() => handleUpdate(activeDoc, !activeDoc.is_reviewed)}
                disabled={saving}
                className={`gap-2 ${activeDoc.is_reviewed ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {activeDoc.is_reviewed ? 'Reopen for Review' : 'Mark as Reviewed'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
