'use client'

import currency from 'currency.js'
import { Calculator, CheckCircle, ChevronDown, Clock, Eye, Loader2, Plus, Upload } from 'lucide-react'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import MultiAccountImportModal from '@/components/finance/MultiAccountImportModal'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useReviewModal } from '@/hooks/useReviewModal'
import { k1NetIncome } from '@/lib/finance/k1Utils'
import { hasReviewedContent, iterateReviewedBrokerEntries } from '@/lib/finance/taxDocumentUtils'
import type { F1099DivParsedData, F1099IntParsedData, FK1StructuredData, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS, isFK1StructuredData } from '@/types/finance/tax-document'

export interface FinAccount {
  acct_id: number
  acct_name: string
}

interface TaxDocuments1099SectionProps {
  selectedYear: number
  documents?: TaxDocument[] | undefined
  accounts?: FinAccount[] | undefined
  activeAccountIds?: number[] | undefined
  isLoading?: boolean | undefined
  onDocumentsReload?: (() => void | Promise<void>) | undefined
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
// Form types shown as individual upload options in the per-account Add dropdown.
// 'broker_1099' is intentionally omitted here — it is handled by the "Consolidated 1099" entry
// which routes through the MultiAccountImportModal with a preselected account.
type DisplayFormType = (typeof DISPLAY_FORM_TYPES)[number]

export default function TaxDocuments1099Section({
  selectedYear,
  documents: controlledDocuments,
  accounts: controlledAccounts,
  activeAccountIds: controlledActiveAccountIds,
  isLoading: controlledLoading,
  onDocumentsReload,
  onTotalsChange,
  onDocumentsChange,
}: TaxDocuments1099SectionProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>(controlledDocuments ?? [])
  const [accounts, setAccounts] = useState<FinAccount[]>(controlledAccounts ?? [])
  const [activeAccountIds, setActiveAccountIds] = useState<number[]>(controlledActiveAccountIds ?? [])
  const [loading, setLoading] = useState(controlledLoading ?? true)
  const [error, setError] = useState<string | null>(null)
  const [uploadModal, setUploadModal] = useState<UploadModalState | null>(null)
  const [multiAccountImportOpen, setMultiAccountImportOpen] = useState(false)
  // When set, opens the multi-account import modal pre-seeded for a specific account.
  const [consolidatedUploadAccountId, setConsolidatedUploadAccountId] = useState<number | null>(null)
  // When set, opens MultiAccountImportModal in assign mode for an already-parsed unresolved doc.
  const [assignDocId, setAssignDocId] = useState<number | null>(null)
  const [manualEntry, setManualEntry] = useState<ManualEntryState | null>(null)
  const [manualSaving, setManualSaving] = useState(false)
  const { reviewDoc: reviewModalDoc, reviewLink: reviewModalLink, openReview: openReviewModal, closeReview: closeReviewModal } = useReviewModal()
  const [worksheetOpen, setWorksheetOpen] = useState(false)

  useEffect(() => {
    let interestIncome = currency(0)
    let dividendIncome = currency(0)
    let qualifiedDividends = currency(0)

    for (const doc of documents) {
      if (!doc.parsed_data) continue

      if (doc.form_type === 'broker_1099') {
        // Multi-account consolidated PDF: iterate per-entry, respect per-link review state.
        for (const [entry] of iterateReviewedBrokerEntries(doc)) {
          const pd = entry.parsed_data as Record<string, unknown>
          if (entry.form_type === '1099_int' || entry.form_type === '1099_int_c') {
            interestIncome = interestIncome.add((pd as F1099IntParsedData).box1_interest ?? 0)
          }
          if (entry.form_type === '1099_div' || entry.form_type === '1099_div_c') {
            dividendIncome = dividendIncome.add((pd as F1099DivParsedData).box1a_ordinary ?? 0)
            qualifiedDividends = qualifiedDividends.add((pd as F1099DivParsedData).box1b_qualified ?? 0)
          }
        }
      } else {
        // Single-form document: use parent-level review state.
        if (!doc.is_reviewed) continue
        const parsedData = doc.parsed_data
        if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
          interestIncome = interestIncome.add((parsedData as F1099IntParsedData).box1_interest ?? 0)
        }
        if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
          dividendIncome = dividendIncome.add((parsedData as F1099DivParsedData).box1a_ordinary ?? 0)
          qualifiedDividends = qualifiedDividends.add((parsedData as F1099DivParsedData).box1b_qualified ?? 0)
        }
      }
    }

    onTotalsChange?.({ interestIncome, dividendIncome, qualifiedDividends })
    onDocumentsChange?.(documents.filter(hasReviewedContent))
  }, [documents, onDocumentsChange, onTotalsChange])

  /** Collect foreign tax summaries from all reviewed documents. */
  const foreignTaxSummaries = useMemo<ForeignTaxSummary[]>(() => {
    const summaries: ForeignTaxSummary[] = []
    for (const doc of documents) {
      if (!doc.parsed_data) continue

      if (doc.form_type === 'broker_1099') {
        // Multi-account: iterate per-entry and respect per-link review state.
        for (const [entry, link] of iterateReviewedBrokerEntries(doc)) {
          const pd = entry.parsed_data as Record<string, unknown>
          if (entry.form_type === '1099_div' || entry.form_type === '1099_div_c') {
            const s = extractForeignTaxFrom1099Div(pd, link.account_id)
            if (s) summaries.push(s)
          } else if (entry.form_type === '1099_int' || entry.form_type === '1099_int_c') {
            const s = extractForeignTaxFrom1099Int(pd, link.account_id)
            if (s) summaries.push(s)
          }
        }
      } else {
        // Single-form document.
        if (!doc.is_reviewed) continue
        const pd = doc.parsed_data as Record<string, unknown>
        const accountId = doc.account_links?.find(l => l.account_id != null)?.account_id ?? doc.account_id
        if (doc.form_type === 'k1' && isFK1StructuredData(pd)) {
          const s = extractForeignTaxFromK1(pd as FK1StructuredData, accountId)
          if (s) summaries.push(s)
        } else if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
          const s = extractForeignTaxFrom1099Div(pd, accountId)
          if (s) summaries.push(s)
        } else if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
          const s = extractForeignTaxFrom1099Int(pd, accountId)
          if (s) summaries.push(s)
        }
      }
    }
    return summaries
  }, [documents])

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        form_type: '1099_int,1099_int_c,1099_div,1099_div_c,1099_misc,1099_b,broker_1099,k1',
        year: String(selectedYear),
      })
      const data = await fetchWrapper.get(`/api/finance/tax-documents?${params.toString()}`)
      const docs = data as TaxDocument[]
      setDocuments(docs)
      setError(null)

    } catch {
      setError('Failed to load account documents')
    }
  }, [selectedYear])

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
    if (controlledDocuments) setDocuments(controlledDocuments)
  }, [controlledDocuments])

  useEffect(() => {
    if (controlledAccounts) setAccounts(controlledAccounts)
  }, [controlledAccounts])

  useEffect(() => {
    if (controlledActiveAccountIds) setActiveAccountIds(controlledActiveAccountIds)
  }, [controlledActiveAccountIds])

  useEffect(() => {
    if (controlledLoading !== undefined) setLoading(controlledLoading)
  }, [controlledLoading])

  useEffect(() => {
    if (controlledDocuments || controlledAccounts || controlledActiveAccountIds) return
    setLoading(true)
    Promise.all([fetchDocuments(), fetchAccounts()]).finally(() => setLoading(false))
  }, [fetchDocuments, fetchAccounts, controlledDocuments, controlledAccounts, controlledActiveAccountIds])

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

  // broker_1099 docs that are still processing (no links yet) or have unresolved links (null account_id).
  const pendingBrokerDocs = documents.filter(
    d => d.form_type === 'broker_1099' &&
      (d.genai_status === 'pending' || d.genai_status === 'processing'),
  )
  const unresolvedBrokerDocs = documents.filter(
    d => d.form_type === 'broker_1099' &&
      d.genai_status === 'parsed' &&
      (d.account_links ?? []).some(l => l.account_id === null),
  )

  // Accounts with at least one 1099/k-1 document (via join table) should be promoted to active section.
  const accountsWithDocs = new Set(
    documents.flatMap(d => (d.account_links ?? []).map(l => l.account_id)).filter(Boolean) as number[],
  )

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
      if (onDocumentsReload) {
        await onDocumentsReload()
      } else {
        await fetchDocuments()
      }
    } catch (err) {
      toast.error('Save failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setManualSaving(false)
    }
  }

  /** Format the primary taxable amount from a document for display in the review button. */
  const formatDocumentAmount = (doc: TaxDocument): string | null => {
    if (!doc.parsed_data) return null
    const p = doc.parsed_data as Record<string, unknown>
    if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
      const amt = p.box1_interest as number | undefined
      return amt != null ? currency(amt).format() : null
    }
    if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
      const amt = (p.box1a_ordinary ?? p.box1_ordinary) as number | undefined
      return amt != null ? currency(amt).format() : null
    }
    if (doc.form_type === '1099_misc') {
      const amt = (p.box3_other_income ?? p.box3_other ?? p.box7_nonemployee ?? p.total_amount) as number | undefined
      return amt != null ? currency(amt).format() : null
    }
    return null
  }

  /** Extract payer/fund name and key amounts for display alongside the review button. */
  const getDocumentInfo = (doc: TaxDocument, link?: TaxDocumentAccountLink): { payerName: string | null; amountStr: string | null } => {
    const effectiveFormType = link ? link.form_type : doc.form_type
    const effectiveReviewed = link ? link.is_reviewed : doc.is_reviewed

    let payerName: string | null = null
    if (doc.parsed_data) {
      if (doc.form_type === 'k1' && isFK1StructuredData(doc.parsed_data)) {
        payerName = (doc.parsed_data as FK1StructuredData).fields['B']?.value?.split('\n')[0] ?? null
      } else {
        payerName = ((doc.parsed_data as Record<string, unknown>).payer_name as string | undefined) ?? null
      }
    }

    let amountStr: string | null = null
    if (effectiveReviewed && doc.parsed_data) {
      const p = doc.parsed_data as Record<string, unknown>
      if (doc.form_type === 'broker_1099') {
        // Consolidated broker PDF: amounts are in aggregate parent fields regardless of link form type.
        const interest = p.int_1_interest_income as number | undefined
        const ordDiv = p.div_1a_total_ordinary as number | undefined
        const parts: string[] = []
        if (interest && interest !== 0) parts.push(`Int ${currency(interest).format()}`)
        if (ordDiv && ordDiv !== 0) parts.push(`Div ${currency(ordDiv).format()}`)
        if (parts.length > 0) amountStr = parts.join(' · ')
      } else if (effectiveFormType === '1099_int' || effectiveFormType === '1099_int_c') {
        const amt = p.box1_interest as number | undefined
        if (amt != null) amountStr = `Int ${currency(amt).format()}`
      } else if (effectiveFormType === '1099_div' || effectiveFormType === '1099_div_c') {
        const amt = (p.box1a_ordinary ?? p.box1_ordinary) as number | undefined
        if (amt != null) amountStr = `Div ${currency(amt).format()}`
      } else if (effectiveFormType === '1099_misc') {
        const amt = (p.box3_other_income ?? p.box3_other ?? p.box7_nonemployee ?? p.total_amount) as number | undefined
        if (amt != null) amountStr = currency(amt).format()
      } else if (effectiveFormType === 'k1' && isFK1StructuredData(doc.parsed_data)) {
        const net = k1NetIncome(doc.parsed_data as FK1StructuredData)
        if (net !== 0) amountStr = `Net ${currency(net).format()}`
      }
    }

    return { payerName, amountStr }
  }

  /**
   * Render a review/status button for a tax document.
   *
   * When `link` is provided (canonical join-table row), its `form_type` and `is_reviewed`
   * override the parent document's values — this is the correct path for broker_1099 docs
   * that expose multiple per-form links (1099-DIV, 1099-INT, 1099-B) for the same account.
   * Clicking always opens the parent document's review modal.
   */
  const renderTaxDocumentButton = (doc: TaxDocument, link?: TaxDocumentAccountLink) => {
    const isProcessing = doc.genai_status === 'pending' || doc.genai_status === 'processing'
    const isFailed = doc.genai_status === 'failed'
    // Use per-link form_type and is_reviewed when a link is provided.
    const effectiveFormType = link ? link.form_type : doc.form_type
    const effectiveReviewed = link ? link.is_reviewed : doc.is_reviewed
    const displayValue = link ? null : formatDocumentAmount(doc) // amounts only for standalone docs
    const formLabel = FORM_TYPE_LABELS[effectiveFormType] ?? effectiveFormType
    const key = link ? `link-${link.id}` : `doc-${doc.id}`

    if (isProcessing) {
      // For K-1 documents, allow opening the modal even during processing (e.g., to delete)
      if (effectiveFormType === 'k1') {
        return (
          <Button
            key={key}
            size="sm"
            variant="outline"
            className="gap-1 h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50 px-2"
            onClick={() => openReviewModal(doc, link)}
            title="K-1 processing — click to open (e.g., to delete)"
          >
            <Clock className="h-3 w-3 animate-pulse" />
            {formLabel} — Processing
          </Button>
        )
      }
      return (
        <Button key={key} size="sm" variant="outline" disabled className="gap-1 h-7 text-xs border-orange-300 text-orange-600 px-2">
          <Clock className="h-3 w-3 animate-pulse" />
          {formLabel} — Processing
        </Button>
      )
    }
    if (isFailed) {
      return (
        <Button key={key} size="sm" variant="outline" disabled className="gap-1 h-7 text-xs border-destructive text-destructive px-2">
          {formLabel} — Failed
        </Button>
      )
    }
    // show value (or "Needs Review") in button; style based on reviewed status
    const btnClass = effectiveReviewed
      ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-400'
      : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-400'

    return (
      <Button
        key={key}
        size="sm"
        variant="outline"
        className={`gap-1 h-7 text-xs px-2 ${btnClass}`}
        onClick={() => openReviewModal(doc, link)}
        title={effectiveReviewed ? `${formLabel} — Reviewed` : `${formLabel} — Needs Review`}
      >
        {effectiveFormType !== 'k1' && displayValue != null ? (
          <>
            {effectiveReviewed && <CheckCircle className="h-3 w-3 shrink-0" />}
            <span className="font-mono tabular-nums">{formLabel}: {displayValue}</span>
          </>
        ) : effectiveReviewed ? (
          <>
            <CheckCircle className="h-3 w-3" />
            {formLabel}
          </>
        ) : (
          <>
            <Eye className="h-3 w-3" />
            {formLabel} — Review
          </>
        )}
      </Button>
    )
  }

  /** Render the full document section for an account row (existing docs + add dropdown). */
  const renderAccountDocuments = (account: FinAccount) => {
    // One entry per (document, account_link) pair for this account. Handles consolidated
    // broker_1099 docs that expose multiple per-form links for the same account.
    const docEntries: JSX.Element[] = []
    const uploadedFormTypes = new Set<string>()

    for (const doc of documents) {
      const links = doc.account_links ?? []
      if (links.length > 0) {
        for (const link of links) {
          if (link.account_id !== account.acct_id) continue
          const { payerName, amountStr } = getDocumentInfo(doc, link)
          docEntries.push(
            <div key={`link-${link.id}`} className="flex items-center gap-2 flex-wrap min-w-0">
              {renderTaxDocumentButton(doc, link)}
              {payerName && <span className="text-xs text-muted-foreground truncate max-w-40">{payerName}</span>}
              {amountStr && <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{amountStr}</span>}
            </div>,
          )
          // Normalize corrected forms back to their base type for the "already uploaded" check.
          const baseType = link.form_type === '1099_int_c' ? '1099_int'
            : link.form_type === '1099_div_c' ? '1099_div'
            : link.form_type
          uploadedFormTypes.add(baseType)
        }
      } else if (doc.account_id === account.acct_id) {
        // Legacy path: document predates the join table and has no account_links.
        const { payerName, amountStr } = getDocumentInfo(doc)
        docEntries.push(
          <div key={`doc-${doc.id}`} className="flex items-center gap-2 flex-wrap min-w-0">
            {renderTaxDocumentButton(doc)}
            {payerName && <span className="text-xs text-muted-foreground truncate max-w-40">{payerName}</span>}
            {amountStr && <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{amountStr}</span>}
          </div>,
        )
        const baseType = doc.form_type === '1099_int_c' ? '1099_int'
          : doc.form_type === '1099_div_c' ? '1099_div'
          : doc.form_type
        uploadedFormTypes.add(baseType)
      }
    }

    return (
      <div className="space-y-1.5">
        {docEntries}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2">
              <Plus className="h-3 w-3" />
              Add
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {DISPLAY_FORM_TYPES.map(ft => (
              <DropdownMenuItem
                key={ft}
                onClick={() => setUploadModal({ open: true, formType: ft, accountId: account.acct_id })}
              >
                <Upload className="h-3 w-3 mr-2" />
                {FORM_TYPE_LABELS[ft]}
                {uploadedFormTypes.has(ft) && <span className="ml-2 text-xs text-muted-foreground">(add another)</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => setConsolidatedUploadAccountId(account.acct_id)}
            >
              <Upload className="h-3 w-3 mr-2" />
              Consolidated 1099 (Broker)
              {uploadedFormTypes.has('broker_1099') && <span className="ml-2 text-xs text-muted-foreground">(add another)</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          <TableCell className={`font-medium text-sm align-middle ${isSecondary ? 'text-muted-foreground' : ''}`}>
            {account.acct_name}
          </TableCell>
          <TableCell>
            {renderAccountDocuments(account)}
          </TableCell>
          <TableCell className="align-middle">
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
        <div className="flex items-center gap-2">
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
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setMultiAccountImportOpen(true)}
            title="Import a consolidated brokerage PDF that covers multiple accounts"
          >
            <Upload className="h-3 w-3" />
            Multi-Account Import
          </Button>
        </div>
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
                <TableHead>Documents</TableHead>
                <TableHead>Foreign Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderAccountRows(activeAccounts, false)}
              {inactiveAccounts.length > 0 && activeAccounts.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-1 bg-muted/20 text-[10px] text-muted-foreground font-medium uppercase tracking-wider"
                  >
                    No transactions in {selectedYear}
                  </TableCell>
                </TableRow>
              )}
              {renderAccountRows(inactiveAccounts, true)}
              {(pendingBrokerDocs.length > 0 || unresolvedBrokerDocs.length > 0) && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-1 bg-orange-50 dark:bg-orange-950/20 text-[10px] text-orange-700 dark:text-orange-400 font-medium uppercase tracking-wider"
                  >
                    Pending imports — awaiting account assignment
                  </TableCell>
                </TableRow>
              )}
              {pendingBrokerDocs.map(doc => (
                <TableRow key={`pending-${doc.id}`}>
                  <TableCell className="text-sm text-muted-foreground italic">
                    {doc.original_filename ?? 'Consolidated 1099'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled className="gap-1 h-7 text-xs border-orange-300 text-orange-600 px-2">
                      <Clock className="h-3 w-3 animate-pulse" />
                      Processing…
                    </Button>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
              {unresolvedBrokerDocs.map(doc => (
                <TableRow key={`unresolved-${doc.id}`}>
                  <TableCell className="text-sm text-muted-foreground italic">
                    {doc.original_filename ?? 'Consolidated 1099'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-7 text-xs border-amber-300 text-amber-700 px-2"
                      onClick={() => setAssignDocId(doc.id)}
                    >
                      <Eye className="h-3 w-3" />
                      Assign accounts
                    </Button>
                  </TableCell>
                  <TableCell />
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

      {/* Review modal (for individual 1099/K-1 documents) */}
      {reviewModalDoc && (
        <TaxDocumentReviewModal
          open
          taxYear={selectedYear}
          document={reviewModalDoc}
          accountLink={reviewModalLink ?? undefined}
          onClose={closeReviewModal}
          onDocumentReviewed={() => {
            closeReviewModal()
            if (onDocumentsReload) {
              void onDocumentsReload()
            } else {
              void fetchDocuments()
            }
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

      {/* Multi-account consolidated PDF import (from header button) */}
      <MultiAccountImportModal
        open={multiAccountImportOpen}
        taxYear={selectedYear}
        accounts={accounts}
        onClose={() => setMultiAccountImportOpen(false)}
        onSuccess={() => {
          setMultiAccountImportOpen(false)
          if (onDocumentsReload) {
            onDocumentsReload()
          } else {
            fetchDocuments()
          }
        }}
      />

      {/* Consolidated 1099 import triggered from per-account Add dropdown */}
      {consolidatedUploadAccountId !== null && (
        <MultiAccountImportModal
          open
          taxYear={selectedYear}
          accounts={accounts}
          preselectedAccountId={consolidatedUploadAccountId}
          onClose={() => setConsolidatedUploadAccountId(null)}
          onSuccess={() => {
            setConsolidatedUploadAccountId(null)
            if (onDocumentsReload) {
              onDocumentsReload()
            } else {
              fetchDocuments()
            }
          }}
        />
      )}

      {/* Assign accounts modal for already-parsed unresolved broker_1099 docs */}
      {assignDocId !== null && (
        <MultiAccountImportModal
          open
          taxYear={selectedYear}
          accounts={accounts}
          existingTaxDocId={assignDocId}
          onClose={() => setAssignDocId(null)}
          onSuccess={() => {
            setAssignDocId(null)
            if (onDocumentsReload) {
              onDocumentsReload()
            } else {
              fetchDocuments()
            }
          }}
        />
      )}

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
