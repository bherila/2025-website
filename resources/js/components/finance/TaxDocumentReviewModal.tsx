'use client'

import currency from 'currency.js'
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { isFK1StructuredData, K1ReviewPanel } from '@/components/finance/k1'
import ManualJsonAttachModal from '@/components/finance/ManualJsonAttachModal'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import { F1116ReviewPanel, isF1116Data } from '@/finance/1116'
import { getSbpElection } from '@/lib/finance/k1Utils'
import { extractLinkParsedData, patchLinkParsedDataInArray } from '@/lib/finance/taxDocumentUtils'
import type { MiscRouting, TaxDocument, TaxDocumentAccountLink, TaxDocumentParsedData, W2ParsedData } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxDocumentReviewModalProps {
  open: boolean
  taxYear: number
  /** If provided, review this specific document. If not, fetch all pending. */
  document?: TaxDocument
  /** Optional: specific account link being reviewed (for multi-account broker_1099 docs). */
  accountLink?: TaxDocumentAccountLink | undefined
  /** Optional payslips for comparison (specific to the entity/employer if possible) */
  payslips?: fin_payslip[]
  onClose: () => void
  /** Called when any document is reviewed so parent can refresh. */
  onDocumentReviewed?: () => void
}

type MiscRoutingSelectValue = MiscRouting | 'auto'

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
    currency((r.state_data?.[0]?.state_tax as number) ?? 0).add((r.state_data?.[0]?.state_tax_addl as number) ?? 0)

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

interface FormFieldDef {
  key: string
  label: string
  box: string
  frequency: 'common' | 'sometimes' | 'rarely'
}

const F1099_INT_FIELDS: FormFieldDef[] = [
  { key: 'box1_interest', label: 'Interest income', box: '1', frequency: 'common' },
  { key: 'box2_early_withdrawal', label: 'Early withdrawal penalty', box: '2', frequency: 'sometimes' },
  { key: 'box3_savings_bond', label: 'Interest on U.S. Savings Bonds and Treasury obligations', box: '3', frequency: 'sometimes' },
  { key: 'box4_fed_tax', label: 'Federal income tax withheld', box: '4', frequency: 'rarely' },
  { key: 'box5_investment_expense', label: 'Investment expenses', box: '5', frequency: 'rarely' },
  { key: 'box6_foreign_tax', label: 'Foreign tax paid', box: '6', frequency: 'rarely' },
  { key: 'box7_foreign_country', label: 'Foreign country or U.S. possession', box: '7', frequency: 'rarely' },
  { key: 'box8_tax_exempt', label: 'Tax-exempt interest', box: '8', frequency: 'sometimes' },
  { key: 'box9_private_activity', label: 'Specified private activity bond interest', box: '9', frequency: 'rarely' },
  { key: 'box10_market_discount', label: 'Market discount', box: '10', frequency: 'rarely' },
  { key: 'box11_bond_premium', label: 'Bond premium', box: '11', frequency: 'sometimes' },
  { key: 'box12_treasury_premium', label: 'Bond premium on Treasury obligations', box: '12', frequency: 'sometimes' },
  { key: 'box13_tax_exempt_premium', label: 'Bond premium on tax-exempt bond', box: '13', frequency: 'sometimes' },
]

const F1099_DIV_FIELDS: FormFieldDef[] = [
  { key: 'box1a_ordinary', label: 'Total ordinary dividends', box: '1a', frequency: 'common' },
  { key: 'box1b_qualified', label: 'Qualified dividends', box: '1b', frequency: 'common' },
  { key: 'box2a_cap_gain', label: 'Total capital gain distributions', box: '2a', frequency: 'common' },
  { key: 'box2b_unrecap_1250', label: 'Unrecaptured section 1250 gain', box: '2b', frequency: 'rarely' },
  { key: 'box2c_section_1202', label: 'Section 1202 gain', box: '2c', frequency: 'rarely' },
  { key: 'box2d_collectibles', label: 'Collectibles (28%) gain', box: '2d', frequency: 'rarely' },
  { key: 'box3_nondividend', label: 'Nondividend distributions', box: '3', frequency: 'sometimes' },
  { key: 'box4_fed_tax', label: 'Federal income tax withheld', box: '4', frequency: 'rarely' },
  { key: 'box5_section_199a', label: 'Section 199A dividends', box: '5', frequency: 'sometimes' },
  { key: 'box6_investment_expense', label: 'Investment expenses', box: '6', frequency: 'rarely' },
  { key: 'box7_foreign_tax', label: 'Foreign tax paid', box: '7', frequency: 'sometimes' },
  { key: 'box8_foreign_country', label: 'Foreign country or U.S. possession', box: '8', frequency: 'sometimes' },
  { key: 'box9_cash_liquidation', label: 'Cash liquidation distributions', box: '9', frequency: 'rarely' },
  { key: 'box10_noncash_liquidation', label: 'Noncash liquidation distributions', box: '10', frequency: 'rarely' },
  { key: 'box11_exempt_interest', label: 'Exempt-interest dividends', box: '11', frequency: 'sometimes' },
  { key: 'box12_private_activity', label: 'Specified private activity bond interest dividends', box: '12', frequency: 'rarely' },
  { key: 'box14_state_tax', label: 'Exempt-interest dividends from regulated investment company', box: '14', frequency: 'sometimes' },
]

/** Returns the list of addable fields for the given form type, excluding fields already in data. */
function getAddableFields(formType: string | undefined, data: Record<string, unknown>): FormFieldDef[] {
  let fields: FormFieldDef[] = []
  if (formType === '1099_int' || formType === '1099_int_c') fields = F1099_INT_FIELDS
  else if (formType === '1099_div' || formType === '1099_div_c') fields = F1099_DIV_FIELDS
  else return []

  return fields.filter(f => {
    const v = data[f.key]
    // Already present with a non-nullish value → not addable
    return v === null || v === undefined
  })
}

/** Dropdown button that lets the user add a field to the editor. */
function AddFieldDropdown({ fields, onAdd }: { fields: FormFieldDef[]; onAdd: (key: string) => void }) {
  const common = fields.filter(f => f.frequency === 'common')
  const sometimes = fields.filter(f => f.frequency === 'sometimes')
  const rarely = fields.filter(f => f.frequency === 'rarely')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add Field
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[320px] overflow-y-auto w-72">
        {common.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">Common</DropdownMenuLabel>
            {common.map(f => (
              <DropdownMenuItem key={f.key} onClick={() => onAdd(f.key)}>
                <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">Box {f.box}</span>
                <span className="truncate">{f.label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {sometimes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">Sometimes</DropdownMenuLabel>
            {sometimes.map(f => (
              <DropdownMenuItem key={f.key} onClick={() => onAdd(f.key)}>
                <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">Box {f.box}</span>
                <span className="truncate">{f.label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {rarely.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">Rarely</DropdownMenuLabel>
            {rarely.map(f => (
              <DropdownMenuItem key={f.key} onClick={() => onAdd(f.key)}>
                <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">Box {f.box}</span>
                <span className="truncate">{f.label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Editor for the parsed_data object.
 */
function ParsedDataEditor({ 
  data, 
  onChange,
  readOnly = false,
  formType,
}: { 
  data: Record<string, unknown>, 
  onChange: (newData: Record<string, unknown>) => void
  readOnly?: boolean
  formType?: string | undefined
}) {
  // A value is "nullish" for display purposes (string "null" counts as null; 0 is valid)
  const isNullish = (v: unknown): boolean =>
    v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === 'null')

  // Exclude nested objects/arrays; in readOnly mode also exclude nullish values
  const allEntries = Object.entries(data).filter(([, v]) => v === null || typeof v !== 'object')
  const entries = readOnly
    ? allEntries.filter(([, v]) => !isNullish(v))
    : allEntries

  const handleFieldChange = (key: string, value: string) => {
    if (readOnly) return
    const isPossiblyNumeric = key.startsWith('box') || key.startsWith('div_') || key.startsWith('int_') || key.startsWith('misc_') || key.startsWith('b_') || key.includes('wages') || key.includes('tax') || key.includes('amount') || key.includes('interest') || key.includes('dividend')
    let finalValue: unknown = value
    if (value === '') {
      finalValue = null
    } else if (isPossiblyNumeric) {
      const c = currency(value)
      // Store as a number if valid and non-zero, or if the input explicitly contains a digit (allows 0.00 / "0")
      if (!isNaN(c.value) && (c.value !== 0 || value.match(/[0-9]/))) {
        finalValue = c.value
      }
    }
    onChange({ ...data, [key]: finalValue })
  }

  // Split into non-tax (identifiers/names) vs tax (numeric field) columns.
  // Covers standard box_ prefixes and broker_1099 div_/int_/misc_/b_ prefixes.
  const isTaxField = (k: string) =>
    k.startsWith('box') || k.startsWith('div_') || k.startsWith('int_') || k.startsWith('misc_') || k.startsWith('b_')
  const nonTaxEntries = entries.filter(([k]) => !isTaxField(k))
  const taxEntries = entries.filter(([k]) => isTaxField(k))

  const [payerInfoOpen, setPayerInfoOpen] = useState(false)

  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No extracted data available.</p>

  const renderField = ([key, value]: [string, unknown]) => (
    <div key={key} className="flex items-center gap-2 group">
      <label className="text-[10px] text-muted-foreground font-mono w-1/2 truncate select-none cursor-help" title={key}>
        {key.replace(/_/g, ' ')}
      </label>
      <div className="w-1/2">
        <Input
          className={`h-6 text-[11px] font-mono px-1.5 text-right rounded-sm ${readOnly ? 'bg-muted/30 border-transparent text-muted-foreground cursor-default focus-visible:ring-0' : 'bg-background border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-primary/40'}`}
          value={isNullish(value) ? '' : String(value)}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          readOnly={readOnly}
        />
      </div>
    </div>
  )

  // Available fields for "Add Field" dropdown (not yet in data with a non-nullish value)
  const addableFields = getAddableFields(formType, data)

  return (
    <div className="space-y-3">
      {/* Payer / Recipient Info — collapsed by default */}
      {nonTaxEntries.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            onClick={() => setPayerInfoOpen((o) => !o)}
          >
            {payerInfoOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="text-xs font-semibold tracking-wide">Payer / Recipient Info</span>
            {!payerInfoOpen && (
              <span className="text-[11px] text-muted-foreground truncate ml-1">
                {String(nonTaxEntries.find(([k]) => k.includes('name') || k.includes('employer'))?.[1] ?? '')}
              </span>
            )}
          </button>
          {payerInfoOpen && (
            <div className="p-3 space-y-1.5">
              {nonTaxEntries.map(renderField)}
            </div>
          )}
        </div>
      )}

      {/* Tax Data — full width */}
      {taxEntries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Tax Data</div>
            {!readOnly && addableFields.length > 0 && (
              <AddFieldDropdown
                fields={addableFields}
                onAdd={(key) => {
                  if (!(key in data)) {
                    onChange({ ...data, [key]: null })
                  }
                }}
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {taxEntries.map(renderField)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TaxDocumentReviewModal({
  open,
  taxYear,
  document: propDocument,
  accountLink: propAccountLink,
  payslips = [],
  onClose,
  onDocumentReviewed,
}: TaxDocumentReviewModalProps) {
  const [documents, setDocuments] = useState<TaxDocument[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [jsonEditOpen, setJsonEditOpen] = useState(false)
  const [imageViewState, setImageViewState] = useState<{ url: string; filename: string } | null>(null)
  
  // Local editor state for the active document
  const [notes, setNotes] = useState('')
  const [editData, setEditData] = useState<TaxDocumentParsedData | Record<string, unknown>>({})
  const [miscRouting, setMiscRouting] = useState<MiscRoutingSelectValue>('auto')

  const activeDoc = documents[currentIndex]

  // When reviewing a specific link in a multi-account doc, determine the effective
  // form type and review state from the link rather than the parent document.
  const isLinkReview = propAccountLink != null && propDocument?.form_type === 'broker_1099'
  const effectiveFormType = isLinkReview ? propAccountLink!.form_type : activeDoc?.form_type
  const effectiveReviewed = isLinkReview ? propAccountLink!.is_reviewed : activeDoc?.is_reviewed ?? false

  // When a K-1 is already confirmed, every section is rendered read-only EXCEPT the K-3 SBP
  // election checkbox (it's a user tax-planning preference, not extracted data). Detect when
  // the checkbox has been toggled relative to the saved value so we can surface a save
  // affordance — otherwise the user would have to "Reopen for Review" just to persist the
  // toggle, which is confusing.
  const savedSbpElection = effectiveFormType === 'k1' ? getSbpElection(activeDoc?.parsed_data) : false
  const currentSbpElection = effectiveFormType === 'k1' ? getSbpElection(editData) : false
  const hasUnsavedSbpElectionChange = Boolean(savedSbpElection) !== Boolean(currentSbpElection)

  const fetchPending = useCallback(async () => {
    if (!open) return
    if (propDocument) {
      setDocuments([propDocument])
      setCurrentIndex(0)
      // For per-link review, extract only the matching entry's parsed_data.
      if (propAccountLink && propDocument.form_type === 'broker_1099') {
        const linkData = extractLinkParsedData(propDocument, propAccountLink)
        setEditData(linkData ?? {})
        setNotes(propAccountLink.notes ?? '')
        setMiscRouting('auto')
      } else {
        setNotes(propDocument.notes ?? '')
        setEditData(propDocument.parsed_data ?? {})
        setMiscRouting(propDocument.misc_routing ?? 'auto')
      }
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
          setEditData(d.parsed_data ?? {})
          setMiscRouting(d.misc_routing ?? 'auto')
        }
      }
    } catch {
      toast.error('Failed to load documents for review')
    } finally {
      setLoading(false)
    }
  }, [open, propDocument, propAccountLink, taxYear])

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
        setEditData(doc.parsed_data ?? {})
        setMiscRouting(doc.misc_routing ?? 'auto')
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
        setEditData(doc.parsed_data ?? {})
        setMiscRouting(doc.misc_routing ?? 'auto')
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
      if (doc.mime_type?.startsWith('image/')) {
        setImageViewState({ url: result.view_url, filename: doc.original_filename ?? '' })
      } else {
        window.open(result.view_url, '_blank', 'noopener,noreferrer')
      }
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

  const handleJsonEdit = useCallback(async (doc: TaxDocument, parsedData: unknown) => {
    setSaving(true)
    try {
      if (isLinkReview && propAccountLink) {
        // Per-link mode: patch only the specific array entry, not the whole parsed_data array.
        if (!Array.isArray(doc.parsed_data)) {
          toast.error('Unable to save: document parsed data is not an array')
          return
        }
        const existingLinkParsedData = extractLinkParsedData(doc, propAccountLink)
        if (existingLinkParsedData == null) {
          toast.error('Unable to save: account entry was not found in document parsed data')
          return
        }
        const updatedArray = patchLinkParsedDataInArray(doc, propAccountLink, parsedData as Record<string, unknown>)
        await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, { parsed_data: updatedArray })
        setEditData(parsedData as TaxDocumentParsedData | Record<string, unknown>)
        setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, parsed_data: updatedArray as typeof d.parsed_data } : d))
      } else {
        await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, { parsed_data: parsedData })
        setEditData(parsedData as TaxDocumentParsedData | Record<string, unknown>)
        setDocuments(prev => prev.map(d => d.id === doc.id ? {
          ...d,
          parsed_data: JSON.parse(JSON.stringify(parsedData)),
        } : d))
      }
      toast.success('JSON updated')
      onDocumentReviewed?.()
    } catch {
      toast.error('Failed to update JSON')
    } finally {
      setSaving(false)
      setJsonEditOpen(false)
    }
  }, [onDocumentReviewed, isLinkReview, propAccountLink])

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
          setEditData(nextDoc.parsed_data ?? {})
          setMiscRouting(nextDoc.misc_routing ?? 'auto')
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
      if (isLinkReview && propAccountLink) {
        // Per-link review: PATCH the individual account link.
        const linkPayload: Record<string, unknown> = { notes }
        const isReviewToggling = isReviewed !== propAccountLink.is_reviewed
        if (isReviewToggling) {
          linkPayload.is_reviewed = isReviewed
        }
        await fetchWrapper.patch(
          `/api/finance/tax-documents/${doc.id}/accounts/${propAccountLink.id}`,
          linkPayload,
        )

        // Also persist the edited parsed_data back into the parent's array,
        // but only when the parent parsed_data shape is valid and the target entry exists.
        if (!Array.isArray(doc.parsed_data)) {
          toast.error('Unable to save parent parsed data: document parsed data is not an array')
        } else {
          const existingLinkParsedData = extractLinkParsedData(doc, propAccountLink)

          if (existingLinkParsedData == null) {
            toast.error('Unable to save parent parsed data: account entry was not found in document parsed data')
          } else {
            const updatedArray = patchLinkParsedDataInArray(doc, propAccountLink, editData as Record<string, unknown>)
            await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, {
              parsed_data: updatedArray,
            })
          }
        }
        toast.success(isReviewToggling ? 'Account link marked as reviewed' : 'Changes saved')
        onDocumentReviewed?.()
        if (isReviewed && isReviewToggling && propDocument) {
          onClose()
        }
      } else {
        // Standard document-level review.
        const isReviewToggling = isReviewed !== doc.is_reviewed
        const payload: Record<string, unknown> = { notes, parsed_data: editData }
        if (effectiveFormType === '1099_misc') {
          payload.misc_routing = miscRouting === 'auto' ? null : miscRouting
        }

        if (isReviewToggling) {
          payload.is_reviewed = isReviewed
        }

        if (isReviewed && isReviewToggling) {
          await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}/mark-reviewed`, payload)
          toast.success('Document marked as reviewed')
        } else {
          await fetchWrapper.put(`/api/finance/tax-documents/${doc.id}`, payload)
          toast.success(isReviewToggling ? 'Review status updated' : 'Changes saved')
        }

        // Update local state immutably
        setDocuments(prev => prev.map(d => d.id === doc.id ? {
          ...d,
          notes,
          misc_routing: effectiveFormType === '1099_misc' ? (miscRouting === 'auto' ? null : miscRouting) : d.misc_routing,
          parsed_data: JSON.parse(JSON.stringify(editData)),
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
      }
    } catch {
      toast.error('Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[1800px] max-h-[90vh] flex flex-col p-4">
        <DialogHeader className="px-1">
          <div className="flex items-center justify-between gap-4 pr-8">
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
                        {FORM_TYPE_LABELS[effectiveFormType ?? ''] ?? effectiveFormType}
                      </h3>
                      {effectiveReviewed && (
                        <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Reviewed</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      {isLinkReview && propAccountLink && (
                        <>
                          <span className="font-medium text-foreground">
                            {propAccountLink.account?.acct_name ?? propAccountLink.ai_account_name ?? 'Unknown Account'}
                          </span>
                          {propAccountLink.ai_identifier && (
                            <span className="text-xs text-muted-foreground">({propAccountLink.ai_identifier})</span>
                          )}
                          <span className="text-muted-foreground/30">•</span>
                        </>
                      )}
                      {!isLinkReview && activeDoc.employment_entity?.display_name && (
                        <>
                          <span className="font-medium text-foreground">{activeDoc.employment_entity.display_name}</span>
                          <span className="text-muted-foreground/30">•</span>
                        </>
                      )}
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
                          {activeDoc.mime_type?.startsWith('image/') ? 'View Image' : 'View PDF'}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(activeDoc)} title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Extracted Data - full width with 2-column internal layout */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extracted Data</div>
                      {effectiveReviewed ? (
                        <div className="text-[10px] text-muted-foreground/60 italic">Read-only (confirmed)</div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/60 italic">Mistakes? Correct them below</div>
                      )}
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 border border-muted-foreground/10">
                      {effectiveFormType === 'k1' && isFK1StructuredData(editData) ? (
                        <K1ReviewPanel
                          data={editData}
                          onChange={(updated) => setEditData(updated)}
                          readOnly={effectiveReviewed}
                        />
                      ) : effectiveFormType === '1116' && isF1116Data(editData) ? (
                        <F1116ReviewPanel
                          data={editData}
                          onChange={(updated) => setEditData(updated)}
                          readOnly={effectiveReviewed}
                        />
                      ) : (
                        <ParsedDataEditor
                          data={editData as Record<string, unknown>}
                          onChange={(d) => setEditData(d)}
                          readOnly={effectiveReviewed}
                          formType={effectiveFormType}
                        />
                      )}
                    </div>
                  </div>

                  {/* Review Notes - full width below extracted data */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Review Notes</div>
                    {effectiveFormType === '1099_misc' && !isLinkReview && (
                      <div className="space-y-2 px-1">
                        <Label htmlFor="misc-routing" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          1099-MISC Routing
                        </Label>
                        <Select
                          value={miscRouting}
                          onValueChange={(value) => setMiscRouting(value as MiscRoutingSelectValue)}
                          disabled={effectiveReviewed}
                        >
                          <SelectTrigger id="misc-routing" className="w-full">
                            <SelectValue placeholder="Select routing" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto (infer from boxes)</SelectItem>
                            <SelectItem value="sch_c">Schedule C</SelectItem>
                            <SelectItem value="sch_e">Schedule E</SelectItem>
                            <SelectItem value="sch_1_line_8">Schedule 1 Line 8</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Textarea
                      className="resize-none text-sm leading-relaxed min-h-[80px]"
                      placeholder="Add notes about this document or discrepancies found..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      readOnly={effectiveReviewed}
                    />
                    {(!effectiveReviewed || hasUnsavedSbpElectionChange) && (
                      <div className="flex items-center justify-end gap-2">
                        {effectiveReviewed && hasUnsavedSbpElectionChange && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-500 italic">
                            SBP election has unsaved changes
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs gap-1 h-8"
                          disabled={saving}
                          onClick={() => handleUpdate(activeDoc, effectiveReviewed)}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {effectiveReviewed ? 'Save Election' : 'Save Changes'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comparison Table (for W-2s) */}
                {effectiveFormType?.startsWith('w2') && editData && (
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
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setJsonEditOpen(true)}
                    title="View / edit the raw JSON for this document"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(activeDoc)}
                    disabled={deleting || effectiveReviewed}
                    title={effectiveReviewed ? 'Reopen for review before deleting' : 'Delete document'}
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete
                  </Button>
                </>
              )}
            </div>
            {activeDoc && (
               <Button
                size="default"
                onClick={() => handleUpdate(activeDoc, !effectiveReviewed)}
                disabled={saving}
                className={`gap-2 ${effectiveReviewed ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {effectiveReviewed ? 'Reopen for Review' : 'Mark as Reviewed'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit JSON sub-modal */}
    {activeDoc && (
      <ManualJsonAttachModal
        open={jsonEditOpen}
        formType={activeDoc.form_type}
        taxYear={taxYear}
        accountId={activeDoc.account_id ?? undefined}
        employmentEntityId={activeDoc.employment_entity_id ?? undefined}
        initialJson={editData}
        onJsonReady={async (data) => {
          await handleJsonEdit(activeDoc, data)
        }}
        onSuccess={() => setJsonEditOpen(false)}
        onBack={() => setJsonEditOpen(false)}
      />
    )}

    {/* Inline image viewer */}
    <Dialog open={imageViewState !== null} onOpenChange={open => !open && setImageViewState(null)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{imageViewState?.filename}</DialogTitle>
        </DialogHeader>
        {imageViewState && (
          <div className="flex justify-center overflow-auto max-h-[70vh]">
            <img src={imageViewState.url} alt={imageViewState.filename} className="max-w-full object-contain" />
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
