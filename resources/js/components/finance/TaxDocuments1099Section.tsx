'use client'

import currency from 'currency.js'
import { Calculator, CheckCircle, Clock, Eye, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import TaxDocumentUploadModal from '@/components/finance/TaxDocumentUploadModal'
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
import type { ForeignTaxSummary } from '@/finance/1116'
import {
  extractForeignTaxFrom1099Div,
  extractForeignTaxFrom1099Int,
  extractForeignTaxFromK1,
  WorksheetModal,
} from '@/finance/1116'
import type { F1099DivParsedData, F1099IntParsedData, FK1StructuredData, TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS, isFK1StructuredData } from '@/types/finance/tax-document'

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
  /** Called whenever reviewed documents change (for Form 1040 data source drill-down). */
  onDocumentsChange?: (docs: TaxDocument[]) => void
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

const DISPLAY_FORM_TYPES = ['1099_int', '1099_div', '1099_misc', 'k1'] as const
type DisplayFormType = (typeof DISPLAY_FORM_TYPES)[number]

export default function TaxDocuments1099Section({ selectedYear, onTotalsChange, onDocumentsChange }: TaxDocuments1099SectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [activeAccountIds, setActiveAccountIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadModal, setUploadModal] = useState<UploadModalState | null>(null)
  const [manualEntry, setManualEntry] = useState<ManualEntryState | null>(null)
  const [manualSaving, setManualSaving] = useState(false)
  const [reviewModalDoc, setReviewModalDoc] = useState<TaxDocument | null>(null)
  const [worksheetOpen, setWorksheetOpen] = useState(false)

  /** Collect foreign tax summaries from all reviewed documents. */
  const foreignTaxSummaries = useMemo<ForeignTaxSummary[]>(() => {
    const summaries: ForeignTaxSummary[] = []
    for (const doc of documents) {
      if (!doc.is_reviewed || !doc.parsed_data) continue
      const pd = doc.parsed_data as Record<string, unknown>
      if (doc.form_type === 'k1' && isFK1StructuredData(pd)) {
        const s = extractForeignTaxFromK1(pd as FK1StructuredData, doc.account_id)
        if (s) summaries.push(s)
      } else if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
        const s = extractForeignTaxFrom1099Div(pd, doc.account_id)
        if (s) summaries.push(s)
      } else if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
        const s = extractForeignTaxFrom1099Int(pd, doc.account_id)
        if (s) summaries.push(s)
      }
    }
    return summaries
  }, [documents])

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        form_type: '1099_int,1099_int_c,1099_div,1099_div_c,1099_misc,k1',
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
      onDocumentsChange?.(docs.filter(d => d.is_reviewed))
    } catch {
      setError('Failed to load account documents')
    }
  }, [selectedYear, onTotalsChange, onDocumentsChange])

  const fetchAccounts = useCallback(async () => {
    try {
      const data = (await fetchWrapper.get(`/api/finance/accounts?active_year=${selectedYear}`)) as {
        assetAccounts: FinAccount[]
        liabilityAccounts: FinAccount[]
        retirementAccounts: FinAccount[]
        active_account_ids?: number[]
      }
      const all: FinAccount[] = [
        ...(data.assetAccounts ?? []),
        ...(data.liabilityAccounts ?? []),
        ...(data.retirementAccounts ?? []),
      ]
      setAccounts(all)
      setActiveAccountIds(data.active_account_ids ?? [])
    } catch {
      setError('Failed to load accounts')
    }
  }, [selectedYear])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchDocuments(), fetchAccounts()]).finally(() => setLoading(false))
  }, [fetchDocuments, fetchAccounts])

  // Auto-refetch every minute when any document is still processing
  useEffect(() => {
    const hasPending = documents.some(
      d => d.genai_status === 'pending' || d.genai_status === 'processing',
    )
    if (!hasPending) return
    const timer = setTimeout(() => {
      fetchDocuments()
    }, 60_000)
    return () => clearTimeout(timer)
  }, [documents, fetchDocuments])

  /** Get docs for a specific account + form type (includes corrected variants). */
  const getDocsForSlot = (accountId: number, formType: DisplayFormType): TaxDocument[] =>
    documents.filter(d => {
      if (d.account_id !== accountId) return false
      if (formType === '1099_int') return d.form_type === '1099_int' || d.form_type === '1099_int_c'
      if (formType === '1099_div') return d.form_type === '1099_div' || d.form_type === '1099_div_c'
      return d.form_type === formType
    })

  // Accounts with at least one 1099/k-1 document should be promoted to the active section
  const accountsWithDocs = new Set(documents.map(d => d.account_id).filter(Boolean) as number[])

  /** Split accounts: active = has transactions OR has 1099 docs; inactive = neither */
  const activeAccounts = accounts.filter(
    a => activeAccountIds.includes(a.acct_id) || accountsWithDocs.has(a.acct_id),
  )
  const inactiveAccounts = accounts.filter(
    a => !activeAccountIds.includes(a.acct_id) && !accountsWithDocs.has(a.acct_id),
  )

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

  /** Render the cell content for a given account + form type slot. */
  const renderSlot = (account: FinAccount, formType: DisplayFormType) => {
    const docs = getDocsForSlot(account.acct_id, formType)

    if (docs.length === 0) {
      // Hide upload button if an incompatible form type is already uploaded (but not both)
      const hasK1 = getDocsForSlot(account.acct_id, 'k1').length > 0
      const has1099Int = getDocsForSlot(account.acct_id, '1099_int').length > 0
      const has1099Div = getDocsForSlot(account.acct_id, '1099_div').length > 0
      const has1099 = has1099Int || has1099Div

      // If k-1 is uploaded but no 1099, hide 1099-int/1099-div upload buttons
      if ((formType === '1099_int' || formType === '1099_div') && hasK1 && !has1099) {
        return null
      }
      // If 1099-int or 1099-div is uploaded but no k-1, hide the k-1 upload button
      if (formType === 'k1' && has1099 && !hasK1) {
        return null
      }

      return (
        <Button
          size="sm"
          variant="ghost"
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

    const isProcessing = doc.genai_status === 'pending' || doc.genai_status === 'processing'
    const isFailed = doc.genai_status === 'failed'

    return (
      <div className="flex flex-col gap-1">
        {/* Combined Review/status button */}
        {isProcessing ? (
          <Button size="sm" variant="outline" disabled className="gap-1 h-7 text-xs border-orange-300 text-orange-600 px-2">
            <Clock className="h-3 w-3 animate-pulse" />
            Processing
          </Button>
        ) : isFailed ? (
          <Button size="sm" variant="outline" disabled className="gap-1 h-7 text-xs border-destructive text-destructive px-2">
            Failed
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className={`gap-1 h-7 text-xs px-2 ${doc.is_reviewed ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900'}`}
            onClick={() => setReviewModalDoc(doc)}
            title={doc.is_reviewed ? 'Reviewed' : 'Review document'}
          >
            {doc.is_reviewed ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Reviewed
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Needs Review
              </>
            )}
          </Button>
        )}
      </div>
    )
  }

  const renderAccountRows = (accountList: FinAccount[], isSecondary: boolean) =>
    accountList.map(account => {
      const accountForeignTax = foreignTaxSummaries
        .filter(s => s.accountId === account.acct_id)
        .reduce((sum, s) => currency(sum).add(s.totalForeignTaxPaid).value, 0)
      return (
        <TableRow
          key={account.acct_id}
          className={isSecondary ? 'opacity-50' : ''}
        >
          <TableCell className={`font-medium text-sm ${isSecondary ? 'text-muted-foreground' : ''}`}>
            {account.acct_name}
          </TableCell>
          {DISPLAY_FORM_TYPES.map(ft => (
            <TableCell key={ft}>{renderSlot(account, ft)}</TableCell>
          ))}
          <TableCell>
            {accountForeignTax > 0 && (
              <span className="text-xs text-amber-700 font-medium">
                {currency(accountForeignTax).format()}
              </span>
            )}
          </TableCell>
        </TableRow>
      )
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">Account Documents</h3>
        {foreignTaxSummaries.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setWorksheetOpen(true)}
          >
            <Calculator className="h-3 w-3" />
            1116 Worksheet
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">{error}</div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts found. Add an account to upload account documents.
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
                <TableHead>Foreign Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderAccountRows(activeAccounts, false)}
              {inactiveAccounts.length > 0 && activeAccounts.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={DISPLAY_FORM_TYPES.length + 2}
                    className="py-1 bg-muted/20 text-[10px] text-muted-foreground font-medium uppercase tracking-wider"
                  >
                    No transactions in {selectedYear}
                  </TableCell>
                </TableRow>
              )}
              {renderAccountRows(inactiveAccounts, true)}
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

      {/* Review modal (for individual 1099/K-1 documents) */}
      {reviewModalDoc && (
        <TaxDocumentReviewModal
          open
          taxYear={selectedYear}
          document={reviewModalDoc}
          onClose={() => setReviewModalDoc(null)}
          onDocumentReviewed={() => {
            setReviewModalDoc(null)
            fetchDocuments()
          }}
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

      {/* Inline image viewer */}

      {/* Form 1116 Worksheet modal */}
      <WorksheetModal
        open={worksheetOpen}
        onClose={() => setWorksheetOpen(false)}
        foreignTaxSummaries={foreignTaxSummaries}
        taxYear={selectedYear}
      />
    </div>
  )
}
