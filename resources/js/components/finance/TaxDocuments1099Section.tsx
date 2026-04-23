'use client'

import currency from 'currency.js'
import { CheckCircle, ChevronDown, Clock, Eye, FileText, Loader2, Plus, Sigma, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'
import type { ForeignTaxSummary } from '@/finance/1116'
import { useReviewModal } from '@/hooks/useReviewModal'
import type { DocAmounts } from '@/lib/finance/taxDocumentUtils'
import { getDocAmounts, getPayerName, hasReviewedContent } from '@/lib/finance/taxDocumentUtils'
import type { F1099DivParsedData, F1099IntParsedData, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

import { TAX_TABS } from './tax-tab-ids'

export interface FinAccount {
  acct_id: number
  acct_name: string
}

type MoneyKey = keyof DocAmounts

interface MoneyColumnDef {
  key: MoneyKey
  label: string
  tab?: string | undefined
  tooltip?: string | undefined
}

/**
 * Canonical column config for the Account Documents money columns.
 * Drives the table header, totals row, and per-row amount cells so a
 * future column (e.g. Cap Gain, Sch-C — see issue #292) is a 1-line add.
 */
const MONEY_COLUMNS: MoneyColumnDef[] = [
  { key: 'interest', label: 'Interest', tab: TAX_TABS.schedules, tooltip: 'Go to Schedule B details' },
  { key: 'dividend', label: 'Dividends', tab: TAX_TABS.schedules, tooltip: 'Go to Schedule B details' },
  { key: 'other', label: 'Other' },
  { key: 'foreignTax', label: 'Foreign Tax', tab: TAX_TABS.form1116, tooltip: 'Go to form 1116 details' },
]

/** Column header that optionally renders a small drill-down button linking to a detail tab. */
function MoneyHeader({
  label,
  tab,
  tooltip,
  onNavigate,
}: {
  label: string
  tab?: string | undefined
  tooltip?: string | undefined
  onNavigate?: ((tab: string) => void) | undefined
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <span>{label}</span>
      {tab && tooltip && onNavigate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0"
              onClick={() => onNavigate(tab)}
              aria-label={tooltip}
              title={tooltip}
            >
              <FileText className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Money amount cell — shared by data rows and the totals row. */
function MoneyCell({ value, isTotal }: { value: number | null; isTotal?: boolean }) {
  const formatted = value === null ? '' : currency(value).format()
  return (
    <TableCell className={`text-right font-mono text-xs tabular-nums ${isTotal ? 'font-semibold' : ''}`}>
      {isTotal && formatted ? (
        <span className="inline-flex items-center justify-end gap-1">
          <Sigma className="h-3 w-3 text-muted-foreground" />
          {formatted}
        </span>
      ) : formatted}
    </TableCell>
  )
}

interface TaxDocuments1099SectionProps {
  selectedYear: number
  documents?: TaxDocument[] | undefined
  accounts?: FinAccount[] | undefined
  activeAccountIds?: number[] | undefined
  isLoading?: boolean | undefined
  onDocumentsReload?: (() => void | Promise<void>) | undefined
  /** Called whenever reviewed documents change (for Form 1040 data source drill-down). */
  onDocumentsChange?: (docs: TaxDocument[]) => void
  /** Navigate to another Tax Preview tab (used by column-header drill-down buttons). */
  onNavigate?: (tab: string) => void
  foreignTaxSummaries?: ForeignTaxSummary[] | undefined
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
  onDocumentsChange,
  onNavigate,
  foreignTaxSummaries = [],
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

  useEffect(() => {
    onDocumentsChange?.(documents.filter(hasReviewedContent))
  }, [documents, onDocumentsChange])

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
        {effectiveReviewed ? (
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

  type DocRow = {
    key: string
    doc: TaxDocument
    link?: TaxDocumentAccountLink | undefined
    payerName: string | null
    amounts: ReturnType<typeof getDocAmounts>
  }

  type AccountGroup = {
    account: FinAccount
    rows: DocRow[]
    uploadedFormTypes: Set<string>
    isSecondary: boolean
  }

  /** Collect per-document rows and which form types have been uploaded for an account. */
  const buildDocRowsForAccount = (account: FinAccount): Omit<AccountGroup, 'account' | 'isSecondary'> => {
    const rows: DocRow[] = []
    const uploadedFormTypes = new Set<string>()
    for (const doc of documents) {
      const links = doc.account_links ?? []
      if (links.length > 0) {
        for (const link of links) {
          if (link.account_id !== account.acct_id) {
            continue
          }
          rows.push({
            key: `link-${link.id}`,
            doc,
            link,
            payerName: getPayerName(doc, link),
            amounts: getDocAmounts(doc, link, foreignTaxSummaries),
          })
          const baseType = link.form_type === '1099_int_c' ? '1099_int'
            : link.form_type === '1099_div_c' ? '1099_div'
            : link.form_type
          uploadedFormTypes.add(baseType)
          if (doc.form_type === 'broker_1099') {
            uploadedFormTypes.add('broker_1099')
          }
        }
      } else if (doc.account_id === account.acct_id) {
        rows.push({
          key: `doc-${doc.id}`,
          doc,
          payerName: getPayerName(doc),
          amounts: getDocAmounts(doc, undefined, foreignTaxSummaries),
        })
        const baseType = doc.form_type === '1099_int_c' ? '1099_int'
          : doc.form_type === '1099_div_c' ? '1099_div'
          : doc.form_type
        uploadedFormTypes.add(baseType)
      }
    }
    return { rows, uploadedFormTypes }
  }

  /** Render the Add dropdown for an account (shown inline next to the account name). */
  const renderAddDropdown = (account: FinAccount, uploadedFormTypes: Set<string>) => (
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
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">Account Documents</h3>
        <div className="flex items-center gap-2">
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
      ) : (() => {
        const activeGroups: AccountGroup[] = activeAccounts.map(a => ({ account: a, ...buildDocRowsForAccount(a), isSecondary: false }))
        const inactiveGroups: AccountGroup[] = inactiveAccounts.map(a => ({ account: a, ...buildDocRowsForAccount(a), isSecondary: true }))
        const allGroups = [...activeGroups, ...inactiveGroups]

        const totalsByKey: Record<MoneyKey, currency> = {
          interest: currency(0),
          dividend: currency(0),
          other: currency(0),
          foreignTax: currency(0),
        }
        const hasDataByKey: Record<MoneyKey, boolean> = {
          interest: false,
          dividend: false,
          other: false,
          foreignTax: false,
        }
        for (const g of allGroups) {
          for (const r of g.rows) {
            for (const col of MONEY_COLUMNS) {
              const v = r.amounts[col.key]
              if (v !== null) {
                hasDataByKey[col.key] = true
                totalsByKey[col.key] = totalsByKey[col.key].add(v)
              }
            }
          }
        }

        const visibleColumns = MONEY_COLUMNS.filter(c => hasDataByKey[c.key])
        const totalCols = 3 + visibleColumns.length

        const renderAmountCells = (a: DocAmounts) => (
          <>
            {visibleColumns.map(col => <MoneyCell key={col.key} value={a[col.key]} />)}
          </>
        )

        const renderGroup = (g: AccountGroup) => {
          const accountCell = (
            <TableCell
              rowSpan={Math.max(1, g.rows.length)}
              className={`font-medium text-sm align-top ${g.isSecondary ? 'text-muted-foreground' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{g.account.acct_name}</span>
                {renderAddDropdown(g.account, g.uploadedFormTypes)}
              </div>
            </TableCell>
          )
          if (g.rows.length === 0) {
            return [
              <TableRow key={`empty-${g.account.acct_id}`} className={g.isSecondary ? 'opacity-50' : ''}>
                {accountCell}
                <TableCell colSpan={totalCols - 1} />
              </TableRow>,
            ]
          }
          return g.rows.map((r, idx) => (
            <TableRow key={`${g.account.acct_id}-${r.key}`} className={g.isSecondary ? 'opacity-50' : ''}>
              {idx === 0 ? accountCell : null}
              <TableCell className="align-middle">{renderTaxDocumentButton(r.doc, r.link)}</TableCell>
              <TableCell className="text-xs text-muted-foreground align-middle">{r.payerName}</TableCell>
              {renderAmountCells(r.amounts)}
            </TableRow>
          ))
        }

        return (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Name</TableHead>
                  {visibleColumns.map(col => (
                    <TableHead key={col.key} className="text-right">
                      <MoneyHeader label={col.label} tab={col.tab} tooltip={col.tooltip} onNavigate={onNavigate} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleColumns.length > 0 && (
                  <TableRow className="bg-muted/40 hover:bg-muted/50 border-b-2">
                    <TableCell colSpan={3} className="font-semibold text-sm">Total</TableCell>
                    {visibleColumns.map(col => (
                      <MoneyCell key={col.key} value={totalsByKey[col.key].value} isTotal />
                    ))}
                  </TableRow>
                )}
                {activeGroups.flatMap(renderGroup)}
                {inactiveGroups.length > 0 && activeGroups.length > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={totalCols}
                      className="py-1 bg-muted/20 text-[10px] text-muted-foreground font-medium uppercase tracking-wider"
                    >
                      No transactions in {selectedYear}
                    </TableCell>
                  </TableRow>
                )}
                {inactiveGroups.flatMap(renderGroup)}
                {(pendingBrokerDocs.length > 0 || unresolvedBrokerDocs.length > 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={totalCols}
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
                    <TableCell colSpan={totalCols - 2} />
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
                    <TableCell colSpan={totalCols - 2} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      })()}

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

    </div>
  )
}
