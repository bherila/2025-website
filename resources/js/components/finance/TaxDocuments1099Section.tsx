'use client'

import currency from 'currency.js'
import { CheckCircle, Clock, Download, Eye, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import TaxDocumentUploadModal from '@/components/finance/TaxDocumentUploadModal'
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
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { F1099DivParsedData, F1099IntParsedData, TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface FinAccount {
  acct_id: number
  acct_name: string
}

interface TaxDocuments1099SectionProps {
  selectedYear: number
  onTotalsChange?: (totals: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }) => void
}

interface ManualEntryState {
  open: boolean
  formType: '1099_int' | '1099_div'
  accountId: number
  accountName: string
  payerName: string
  /** 1099-INT box 1 */
  interest: string
  /** 1099-DIV box 1a */
  ordinaryDividends: string
  /** 1099-DIV box 1b */
  qualifiedDividends: string
}

interface UploadModalState {
  open: boolean
  formType: string
  accountId: number
}

const DISPLAY_FORM_TYPES = ['1099_int', '1099_div', '1099_misc'] as const
type DisplayFormType = (typeof DISPLAY_FORM_TYPES)[number]

export default function TaxDocuments1099Section({ selectedYear, onTotalsChange }: TaxDocuments1099SectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadModal, setUploadModal] = useState<UploadModalState | null>(null)
  const [manualEntry, setManualEntry] = useState<ManualEntryState | null>(null)
  const [manualSaving, setManualSaving] = useState(false)

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        form_type: '1099_int,1099_int_c,1099_div,1099_div_c,1099_misc',
        year: String(selectedYear),
      })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      const docs = data as TaxDocument[]
      setDocuments(docs)
      setError(null)

      // Compute totals from confirmed parsed data using currency.js for precision
      let interestIncome = currency(0)
      let dividendIncome = currency(0)
      let qualifiedDividends = currency(0)
      for (const doc of docs) {
        if (!doc.parsed_data || !doc.is_reviewed) continue
        const pd = doc.parsed_data
        if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
          interestIncome = interestIncome.add((pd as F1099IntParsedData).box1_interest ?? 0)
        }
        if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
          dividendIncome = dividendIncome.add((pd as F1099DivParsedData).box1a_ordinary ?? 0)
          qualifiedDividends = qualifiedDividends.add((pd as F1099DivParsedData).box1b_qualified ?? 0)
        }
      }
      onTotalsChange?.({ interestIncome, dividendIncome, qualifiedDividends })
    } catch {
      setError('Failed to load 1099 documents')
    }
  }, [selectedYear, onTotalsChange])

  const fetchAccounts = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get('/api/finance/accounts')) as {
        assetAccounts: FinAccount[]
        liabilityAccounts: FinAccount[]
        retirementAccounts: FinAccount[]
      }
      const all: FinAccount[] = [
        ...(data.assetAccounts ?? []),
        ...(data.liabilityAccounts ?? []),
        ...(data.retirementAccounts ?? []),
      ]
      setAccounts(all)
    } catch {
      setError('Failed to load accounts')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchDocuments(), fetchAccounts()]).finally(() => setLoading(false))
  }, [fetchDocuments, fetchAccounts])

  /** Get docs for a specific account + form type (includes corrected variants). */
  const getDocsForSlot = (accountId: number, formType: DisplayFormType): TaxDocument[] =>
    documents.filter(d => {
      if (d.account_id !== accountId) return false
      if (formType === '1099_int') return d.form_type === '1099_int' || d.form_type === '1099_int_c'
      if (formType === '1099_div') return d.form_type === '1099_div' || d.form_type === '1099_div_c'
      return d.form_type === formType
    })

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


  const handleToggleReviewed = async (doc: TaxDocument) => {
    try {
      await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, {
        is_reviewed: !doc.is_reviewed,
      })
      await fetchDocuments()
    } catch {
      toast.error('Failed to update review status')
    }
  }

  const handleManualEntrySave = async () => {
    if (!manualEntry) return
    setManualSaving(true)
    try {
      const parsedData: F1099IntParsedData | F1099DivParsedData =
        manualEntry.formType === '1099_int'
          ? {
              payer_name: manualEntry.payerName || null,
              box1_interest: currency(manualEntry.interest || 0).value,
            }
          : {
              payer_name: manualEntry.payerName || null,
              box1a_ordinary: currency(manualEntry.ordinaryDividends || 0).value,
              box1b_qualified: currency(manualEntry.qualifiedDividends || 0).value,
            }

      await fetchWrapper.post('/api/finance/tax-documents/manual', {
        form_type: manualEntry.formType,
        tax_year: selectedYear,
        account_id: manualEntry.accountId,
        parsed_data: parsedData,
        is_reviewed: true,
      })

      toast.success('Manual entry saved successfully')
      setManualEntry(null)
      await fetchDocuments()
    } catch (err) {
      toast.error('Save failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setManualSaving(false)
    }
  }

  const renderStatusBadge = (doc: TaxDocument) => {
    if (doc.genai_status === 'pending' || doc.genai_status === 'processing') {
      return (
        <Badge variant="outline" className="border-orange-400 text-orange-600 gap-1 text-xs">
          <Clock className="h-2.5 w-2.5" />
          Processing
        </Badge>
      )
    }
    if (doc.genai_status === 'parsed' && doc.is_reviewed) {
      return (
        <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
          Reviewed
        </Badge>
      )
    }
    if (doc.genai_status === 'parsed') {
      return (
        <Badge variant="outline" className="border-blue-400 text-blue-600 text-xs">
          Review
        </Badge>
      )
    }
    if (doc.genai_status === 'failed') {
      return <Badge variant="destructive" className="text-xs">Failed</Badge>
    }
    if (doc.is_reviewed) {
      return (
        <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
          Reviewed
        </Badge>
      )
    }
    return null
  }

  /** Render the cell content for a given account + form type slot. */
  const renderSlot = (account: FinAccount, formType: DisplayFormType) => {
    const docs = getDocsForSlot(account.acct_id, formType)

    if (docs.length === 0) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setUploadModal({ open: true, formType, accountId: account.acct_id })}
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
      )
    }

    const doc = docs[0]
    if (!doc) return null
    return (
      <div className="flex flex-col gap-1">
        {renderStatusBadge(doc)}
        <div className="flex gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => {
              if (doc.s3_path) {
                handleView(doc)
              } else {
                setManualEntry({
                  open: true,
                  formType: doc.form_type as '1099_int' | '1099_div',
                  accountId: doc.account_id!,
                  accountName: doc.account?.acct_name ?? '',
                  payerName: (doc.parsed_data as any)?.payer_name ?? '',
                  interest: (doc.parsed_data as any)?.box1_interest ?? '',
                  ordinaryDividends: (doc.parsed_data as any)?.box1a_ordinary ?? '',
                  qualifiedDividends: (doc.parsed_data as any)?.box1b_qualified ?? '',
                })
              }
            }}
            title={doc.s3_path ? 'View PDF' : 'Edit entry'}
          >
            {doc.s3_path ? <Eye className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          </Button>
          {doc.s3_path && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => handleDownload(doc)}
              title="Download"
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => handleToggleReviewed(doc)}
            title={doc.is_reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
          >
            <CheckCircle
              className={`h-3 w-3 ${doc.is_reviewed ? 'text-green-600' : 'text-muted-foreground/40'}`}
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => handleDelete(doc)}
            title={doc.is_reviewed ? 'Uncheck Reviewed to enable delete' : 'Delete'}
            disabled={doc.is_reviewed}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-base font-semibold mb-2">1099 Documents</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">{error}</div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts found. Add an account to upload 1099 documents.
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                {DISPLAY_FORM_TYPES.map(ft => (
                  <TableHead key={ft}>{FORM_TYPE_LABELS[ft]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(account => (
                <TableRow key={account.acct_id}>
                  <TableCell className="font-medium text-sm">{account.acct_name}</TableCell>
                  {DISPLAY_FORM_TYPES.map(ft => (
                    <TableCell key={ft}>{renderSlot(account, ft)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload modal */}
      {uploadModal && (
        <TaxDocumentUploadModal
          open={uploadModal.open}
          formType={uploadModal.formType}
          taxYear={selectedYear}
          accountId={uploadModal.accountId}
          onSuccess={() => {
            setUploadModal(null)
            fetchDocuments()
          }}
          onCancel={() => setUploadModal(null)}
          {...(uploadModal.formType === '1099_int' || uploadModal.formType === '1099_div'
            ? {
                onCreateBlank: () => {
                  const ft = uploadModal.formType as '1099_int' | '1099_div'
                  const account = accounts.find(a => a.acct_id === uploadModal.accountId)
                  setManualEntry({
                    open: true,
                    formType: ft,
                    accountId: uploadModal.accountId,
                    accountName: account?.acct_name ?? '',
                    payerName: '',
                    interest: '',
                    ordinaryDividends: '',
                    qualifiedDividends: '',
                  })
                },
              }
            : {})}
        />
      )}

      {/* Manual entry dialog */}
      <Dialog open={manualEntry?.open ?? false} onOpenChange={open => !open && setManualEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Enter {manualEntry?.formType === '1099_int' ? '1099-INT' : '1099-DIV'} Data Manually
              {manualEntry?.accountName ? ` — ${manualEntry.accountName}` : ''}
            </DialogTitle>
          </DialogHeader>
          {manualEntry && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-1">
                <Label htmlFor="payer-name">Payer Name</Label>
                <Input
                  id="payer-name"
                  placeholder="Bank or institution name"
                  value={manualEntry.payerName}
                  onChange={e => setManualEntry({ ...manualEntry, payerName: e.target.value })}
                />
              </div>
              {manualEntry.formType === '1099_int' ? (
                <div className="grid gap-1">
                  <Label htmlFor="box1-interest">Box 1 — Interest Income ($)</Label>
                  <Input
                    id="box1-interest"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={manualEntry.interest}
                    onChange={e => setManualEntry({ ...manualEntry, interest: e.target.value })}
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-1">
                    <Label htmlFor="box1a-div">Box 1a — Total Ordinary Dividends ($)</Label>
                    <Input
                      id="box1a-div"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={manualEntry.ordinaryDividends}
                      onChange={e => setManualEntry({ ...manualEntry, ordinaryDividends: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="box1b-div">Box 1b — Qualified Dividends ($)</Label>
                    <Input
                      id="box1b-div"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={manualEntry.qualifiedDividends}
                      onChange={e => setManualEntry({ ...manualEntry, qualifiedDividends: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleManualEntrySave} disabled={manualSaving}>
              {manualSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
