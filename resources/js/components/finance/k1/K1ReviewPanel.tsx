'use client'

import currency from 'currency.js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import { BOX11_CODES, BOX13_CODES } from './k1-codes'
import { K1_SPEC } from './k1-spec'
import type { FK1StructuredData, K1CodeItem, K1FieldSpec, K3Section } from './k1-types'
import K1CodesModal from './K1CodesModal'

// ── Value helpers ─────────────────────────────────────────────────────────────

function parseFieldVal(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '' || v === 'null') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function fmtAmt(n: number, precision = 0): string {
  const abs = currency(Math.abs(n), { precision }).format()
  return n < 0 ? `(${abs})` : abs
}

function AmountCell({ val, className = '' }: { val: string | number | null | undefined; className?: string }) {
  const n = typeof val === 'number' ? val : parseFieldVal(val as string | null | undefined)
  if (n === null) return <span className={`font-mono text-muted-foreground ${className}`}>—</span>
  if (n === 0) return <span className={`font-mono text-foreground ${className}`}>$0</span>
  const cls = n < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return <span className={`font-mono tabular-nums ${cls} ${className}`}>{fmtAmt(n)}</span>
}

// ── Form-block card primitives ────────────────────────────────────────────────

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b">{title}</div>
      <div className="divide-y divide-dashed divide-border/50">{children}</div>
    </div>
  )
}

function FormLine({
  boxRef,
  label,
  value,
  onClick,
}: {
  boxRef?: string
  label: React.ReactNode
  value: string | number | null | undefined
  onClick?: () => void
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${onClick ? 'cursor-pointer hover:bg-muted/20 transition-colors' : ''}`}
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 select-none">{boxRef ?? ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <AmountCell val={value} className="text-[13px] shrink-0" />
    </div>
  )
}

function FormSubLine({ text }: { text: string }) {
  return (
    <div className="px-3 py-0.5 pl-[4.5rem]">
      <span className="text-[11px] text-muted-foreground leading-tight">{text}</span>
    </div>
  )
}

function FormTotalLine({ label, value, double }: { label: string; value: number | null; double?: boolean }) {
  const cls =
    value === null ? 'text-muted-foreground' : value < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return (
    <div className={`flex items-center gap-2 px-3 py-2 font-semibold ${double ? 'border-t-2 border-double border-border' : 'border-t border-border'} bg-muted/20`}>
      <span className="w-14 shrink-0" />
      <span className="flex-1 text-[13px]">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums ${cls}`}>
        {value === null ? '—' : fmtAmt(value)}
      </span>
    </div>
  )
}

// ── Entity / Partner info (collapsible) ───────────────────────────────────────

function K1Field({
  spec,
  value,
  readOnly,
  onChangeValue,
}: {
  spec: K1FieldSpec
  value: string | null | undefined
  readOnly: boolean
  onChangeValue: (val: string | null) => void
}) {
  const stringVal = value ?? ''
  const inputClass = readOnly
    ? 'h-7 text-xs font-mono bg-muted/30 border-transparent text-muted-foreground cursor-default focus-visible:ring-0'
    : 'h-7 text-xs font-mono bg-background border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-primary/40'

  if (spec.fieldType === 'check') {
    const checked = stringVal === 'true'
    return (
      <div className="flex items-center h-7 gap-2">
        <Checkbox
          id={`k1-field-${spec.box}`}
          checked={checked}
          onCheckedChange={readOnly ? () => {} : (c) => onChangeValue(c ? 'true' : 'false')}
          disabled={readOnly}
        />
        <Label htmlFor={`k1-field-${spec.box}`} className="text-xs cursor-pointer">
          {checked ? 'Yes' : 'No'}
        </Label>
      </div>
    )
  }

  if (spec.fieldType === 'dropdown') {
    const items = spec.dropdownItems ?? []
    if (readOnly) {
      return <span className="text-xs font-mono text-muted-foreground">{stringVal || '—'}</span>
    }
    return (
      <Select value={stringVal} onValueChange={(v) => onChangeValue(v || null)}>
        <SelectTrigger className={inputClass}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (spec.fieldType === 'multiLineText') {
    return (
      <Textarea
        className={`text-xs font-mono resize-none min-h-[56px] ${readOnly ? 'bg-muted/30 border-transparent text-muted-foreground cursor-default' : ''}`}
        value={stringVal}
        onChange={(e) => onChangeValue(e.target.value || null)}
        readOnly={readOnly}
        rows={3}
      />
    )
  }

  return (
    <Input
      className={inputClass}
      value={stringVal}
      onChange={(e) => onChangeValue(e.target.value || null)}
      readOnly={readOnly}
    />
  )
}

function EntityInfoSection({
  data,
  readOnly,
  onUpdate,
}: {
  data: FK1StructuredData
  readOnly: boolean
  onUpdate: (box: string, value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const leftSpec = K1_SPEC.filter((s) => s.side === 'left').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))

  // Build a one-line summary for the collapsed header
  const partnerName = data.fields['F']?.value ?? data.fields['B']?.value ?? null
  const ein = data.fields['A']?.value ?? null
  const summary = [partnerName, ein ? `EIN ${ein}` : null].filter(Boolean).join(' · ')

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 border-b hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-semibold tracking-wide">Entity / Partner Info</span>
        {!open && summary && (
          <span className="text-[11px] text-muted-foreground truncate ml-1">{summary}</span>
        )}
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {leftSpec.map((spec) => {
            const fieldValue = data.fields[spec.box]
            const lowConfidence =
              !readOnly && fieldValue?.confidence != null && fieldValue.confidence < 0.85 && !fieldValue.manualOverride
            return (
              <div
                key={spec.box}
                className={`flex items-start gap-2 min-h-[28px] rounded-sm transition-colors ${lowConfidence ? 'bg-amber-50/50 ring-1 ring-amber-200/50 p-0.5 -m-0.5' : ''}`}
              >
                <div className="flex items-center gap-1 w-12 shrink-0 pt-0.5">
                  <span className={`text-[10px] font-mono font-semibold ${lowConfidence ? 'text-amber-700' : 'text-muted-foreground'}`}>
                    {spec.box}
                  </span>
                  {fieldValue?.manualOverride && (
                    <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3.5 border-amber-400 text-amber-600">M</Badge>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <label className={`text-[10px] leading-tight block mb-0.5 truncate ${lowConfidence ? 'text-amber-800 font-medium' : 'text-muted-foreground'}`}>
                    {spec.concise}
                  </label>
                  <K1Field spec={spec} value={fieldValue?.value} readOnly={readOnly} onChangeValue={(v) => onUpdate(spec.box, v)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Income Items block ────────────────────────────────────────────────────────

const INCOME_BOXES = ['1', '2', '3', '4', '5', '6a', '6b', '6c', '7', '8', '9a', '9b', '9c', '10']
const specByBox = Object.fromEntries(K1_SPEC.map((s) => [s.box, s]))

function IncomeItemsBlock({
  data,
  onOpenCodes,
}: {
  data: FK1StructuredData
  onOpenCodes: (box: string) => void
}) {
  const incomeFieldLines = INCOME_BOXES.map((box) => ({
    box,
    spec: specByBox[box],
    val: parseFieldVal(data.fields[box]?.value),
  })).filter(({ val }) => val !== null && val !== 0)

  const box11Items = data.codes['11'] ?? []

  const fieldSum = incomeFieldLines.reduce((acc, { val }) => acc + (val ?? 0), 0)
  const codeSum = box11Items.reduce((acc, item) => acc + (parseFieldVal(item.value) ?? 0), 0)
  const subtotal = fieldSum + codeSum

  if (incomeFieldLines.length === 0 && box11Items.length === 0) return null

  return (
    <FormBlock title="Income Items — Part III">
      {incomeFieldLines.map(({ box, spec, val }) => (
        <FormLine key={box} boxRef={`Box ${box}`} label={spec?.concise ?? box} value={val} />
      ))}
      {box11Items.map((item, i) => (
        <div key={i}>
          <FormLine
            boxRef={`Box 11${item.code}`}
            label={BOX11_CODES[item.code] ?? `Other income (code ${item.code})`}
            value={item.value}
            onClick={() => onOpenCodes('11')}
          />
          {item.notes && <FormSubLine text={item.notes} />}
        </div>
      ))}
      <FormTotalLine label="Subtotal gross income items" value={subtotal} />
    </FormBlock>
  )
}

// ── Deduction Items block ─────────────────────────────────────────────────────

function DeductionItemsBlock({
  data,
  onOpenCodes,
}: {
  data: FK1StructuredData
  onOpenCodes: (box: string) => void
}) {
  const box12Val = parseFieldVal(data.fields['12']?.value)
  const box21Val = parseFieldVal(data.fields['21']?.value)
  const box13Items = data.codes['13'] ?? []

  const incomeTotal =
    INCOME_BOXES.reduce((acc, box) => acc + (parseFieldVal(data.fields[box]?.value) ?? 0), 0) +
    (data.codes['11'] ?? []).reduce((acc, item) => acc + (parseFieldVal(item.value) ?? 0), 0)

  const deductionTotal =
    (box12Val !== null ? -Math.abs(box12Val) : 0) +
    box13Items.reduce((acc, item) => acc + (parseFieldVal(item.value) ?? 0), 0) +
    (box21Val !== null ? -Math.abs(box21Val) : 0)

  const netK1 = incomeTotal + deductionTotal

  const hasContent = box12Val !== null || box13Items.length > 0 || box21Val !== null

  if (!hasContent) return null

  return (
    <FormBlock title="Deduction Items — Part III">
      {box12Val !== null && box12Val !== 0 && (
        <FormLine boxRef="Box 12" label="Section 179 deduction" value={-Math.abs(box12Val)} />
      )}
      {box13Items.map((item, i) => (
        <div key={i}>
          <FormLine
            boxRef={`Box 13${item.code}`}
            label={BOX13_CODES[item.code] ?? `Other deductions (code ${item.code})`}
            value={item.value}
            onClick={() => onOpenCodes('13')}
          />
          {item.notes && <FormSubLine text={item.notes} />}
        </div>
      ))}
      {box21Val !== null && box21Val !== 0 && (
        <FormLine boxRef="Box 21" label="Foreign taxes paid/accrued → Form 1116" value={box21Val} />
      )}
      <FormTotalLine label="Total deductions" value={deductionTotal} />
      <FormTotalLine label="Net K-1 income (loss)" value={netK1} double />
    </FormBlock>
  )
}

// ── Other / Supplemental block ────────────────────────────────────────────────

const OTHER_CODE_BOXES: Array<{ box: string; label: string }> = [
  { box: '14', label: 'Self-employment earnings' },
  { box: '15', label: 'Credits' },
  { box: '16', label: 'Foreign transactions' },
  { box: '17', label: 'AMT items' },
  { box: '18', label: 'Tax-exempt & nondeductible' },
  { box: '19', label: 'Distributions' },
  { box: '20', label: 'Other information' },
]

function OtherSupplementalBlock({
  data,
  onOpenCodes,
}: {
  data: FK1StructuredData
  onOpenCodes: (box: string) => void
}) {
  // Capital account / supplemental display fields from Item L / K
  const endingCapital = parseFieldVal(data.fields['L_ending_capital']?.value)
  const capitalMethod = data.fields['L_capital_method']?.value ?? null

  // Other code boxes with data
  const otherBoxesWithData = OTHER_CODE_BOXES.filter(({ box }) => {
    const items = data.codes[box]
    return Array.isArray(items) && items.length > 0
  })

  const hasContent = endingCapital !== null || otherBoxesWithData.length > 0
  if (!hasContent) return null

  return (
    <FormBlock title="Box 20 Supplemental / Other">
      {otherBoxesWithData.map(({ box, label }) => {
        const items = data.codes[box] ?? []
        return items.map((item, i) => (
          <div key={`${box}-${i}`}>
            <FormLine
              boxRef={`${box}${item.code}`}
              label={item.notes ? item.notes.split('·')[0]?.trim() || label : label}
              value={item.value}
              onClick={() => onOpenCodes(box)}
            />
          </div>
        ))
      })}
      {endingCapital !== null && (
        <FormLine
          boxRef="L"
          label={`Ending capital account${capitalMethod ? ` (${capitalMethod.replace('_', ' ')})` : ''}`}
          value={endingCapital}
        />
      )}
    </FormBlock>
  )
}

// ── K-3 tables ────────────────────────────────────────────────────────────────

type K3Part2Row = {
  line: string
  country?: string
  col_a_us_source?: number | null
  col_b_foreign_branch?: number | null
  col_c_passive?: number | null
  col_d_general?: number | null
  col_e_other_901j?: number | null
  col_f_sourced_by_partner?: number | null
  col_g_total?: number | null
  note?: string
}

function fmtK3(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return fmtAmt(n)
}

function k3Cls(n: number | null | undefined): string {
  if (!n) return 'text-muted-foreground'
  return n < 0 ? 'text-destructive' : ''
}

function K3Part2Table({ section }: { section: K3Section }) {
  const rows = (section.data as Record<string, unknown>)?.rows as K3Part2Row[] | undefined
  if (!rows?.length) return null

  const isTotalLine = (line: string) => ['24', '54', '55'].includes(line)

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-muted-foreground mb-1 px-0.5">{section.title}</div>
      <div className="border rounded-lg overflow-hidden">
        <Table className="text-xs">
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="h-8 text-xs">Line / Country</TableHead>
              <TableHead className="h-8 text-xs text-right">U.S. Source</TableHead>
              <TableHead className="h-8 text-xs text-right">Passive</TableHead>
              <TableHead className="h-8 text-xs text-right">General</TableHead>
              <TableHead className="h-8 text-xs text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className={isTotalLine(row.line) ? 'font-semibold bg-muted/20' : ''}>
                <TableCell className="py-1">
                  Line {row.line}
                  {row.country && row.country !== 'US' ? ` (${row.country})` : ''}
                  {row.note ? ` — ${row.note}` : ''}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_a_us_source)}`}>
                  {fmtK3(row.col_a_us_source)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_c_passive)}`}>
                  {fmtK3(row.col_c_passive)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_d_general)}`}>
                  {fmtK3(row.col_d_general)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_g_total)}`}>
                  {fmtK3(row.col_g_total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type K3ForeignTaxRow = {
  country: string
  tax_type?: string
  basket?: string
  amount_usd: number
  amount_foreign_currency?: number
  exchange_rate?: number
  date_paid?: string
}

function K3ForeignTaxesTable({ section }: { section: K3Section }) {
  const d = section.data as Record<string, unknown>
  const countries = d?.countries as K3ForeignTaxRow[] | undefined
  const grandTotal = d?.grandTotalUSD as number | undefined

  if (!countries?.length) return null

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-muted-foreground mb-1 px-0.5">{section.title}</div>
      <div className="border rounded-lg overflow-hidden">
        <Table className="text-xs">
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="h-8 text-xs">Country</TableHead>
              <TableHead className="h-8 text-xs">Type</TableHead>
              <TableHead className="h-8 text-xs">Basket</TableHead>
              <TableHead className="h-8 text-xs text-right">Amount USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="py-1 font-mono font-semibold">{row.country}</TableCell>
                <TableCell className="py-1">{row.tax_type ?? '—'}</TableCell>
                <TableCell className="py-1">{row.basket ?? '—'}</TableCell>
                <TableCell className="py-1 text-right font-mono tabular-nums">{fmtAmt(row.amount_usd)}</TableCell>
              </TableRow>
            ))}
            {grandTotal !== undefined && (
              <TableRow className="font-semibold bg-muted/20">
                <TableCell colSpan={3} className="py-1">Grand Total</TableCell>
                <TableCell className="py-1 text-right font-mono tabular-nums">{fmtAmt(grandTotal)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

type K3AssetRow = {
  line: string
  col_a_us_source?: number | null
  col_c_passive?: number | null
  col_d_general?: number | null
  col_g_total?: number | null
}

function K3AssetTable({ section }: { section: K3Section }) {
  const rows = (section.data as Record<string, unknown>)?.rows as K3AssetRow[] | undefined
  if (!rows?.length) return null

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-muted-foreground mb-1 px-0.5">{section.title}</div>
      <div className="border rounded-lg overflow-hidden">
        <Table className="text-xs">
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead className="h-8 text-xs">Asset Category (Line)</TableHead>
              <TableHead className="h-8 text-xs text-right">U.S. Source</TableHead>
              <TableHead className="h-8 text-xs text-right">Passive Foreign</TableHead>
              <TableHead className="h-8 text-xs text-right">General Foreign</TableHead>
              <TableHead className="h-8 text-xs text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="py-1 font-mono">{row.line}</TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_a_us_source)}`}>
                  {fmtK3(row.col_a_us_source)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_c_passive)}`}>
                  {fmtK3(row.col_c_passive)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_d_general)}`}>
                  {fmtK3(row.col_d_general)}
                </TableCell>
                <TableCell className={`py-1 text-right font-mono tabular-nums ${k3Cls(row.col_g_total)}`}>
                  {fmtK3(row.col_g_total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function K3Section_({ section }: { section: K3Section }) {
  if (section.sectionId === 'part2_section1' || section.sectionId === 'part2_section2') {
    return <K3Part2Table section={section} />
  }
  if (section.sectionId === 'part3_section4') {
    return <K3ForeignTaxesTable section={section} />
  }
  if (section.sectionId === 'part3_section2') {
    return <K3AssetTable section={section} />
  }
  // Generic fallback: show title + notes only
  return (
    <div className="mt-3 border rounded-lg px-3 py-2">
      <div className="text-xs font-semibold">{section.title}</div>
      {section.notes && <p className="text-xs text-muted-foreground mt-1 italic">{section.notes}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface K1ReviewPanelProps {
  data: FK1StructuredData
  onChange: (updated: FK1StructuredData) => void
  readOnly?: boolean
}

export default function K1ReviewPanel({ data, onChange, readOnly = false }: K1ReviewPanelProps) {
  const [codesModal, setCodesModal] = useState<{ box: string } | null>(null)

  const updateField = (box: string, value: string | null) => {
    onChange({
      ...data,
      fields: {
        ...data.fields,
        [box]: { ...(data.fields[box] ?? {}), value, manualOverride: true },
      },
    })
  }

  const updateCodes = (box: string, items: K1CodeItem[]) => {
    onChange({ ...data, codes: { ...data.codes, [box]: items } })
  }

  const activeCodesSpec = codesModal ? K1_SPEC.find((s) => s.box === codesModal.box) : null

  const k3Sections = data.k3?.sections ?? []

  return (
    <div className="space-y-4">
      {/* Extraction metadata */}
      {data.extraction?.model && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Extracted by <span className="font-mono">{data.extraction.model}</span></span>
          {data.extraction.confidence != null && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
              {Math.round(Math.min(1, Math.max(0, data.extraction.confidence)) * 100)}% conf.
            </Badge>
          )}
          {data.extraction.timestamp && <span>· {new Date(data.extraction.timestamp).toLocaleString()}</span>}
          {data.formId && <span>· ID: <span className="font-mono">{data.formId}</span></span>}
        </div>
      )}

      {/* Entity / Partner Info — collapsible */}
      <EntityInfoSection data={data} readOnly={readOnly} onUpdate={updateField} />

      {/* Income + Deduction blocks side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IncomeItemsBlock data={data} onOpenCodes={(box) => setCodesModal({ box })} />
        <DeductionItemsBlock data={data} onOpenCodes={(box) => setCodesModal({ box })} />
      </div>

      {/* Other / Supplemental */}
      <OtherSupplementalBlock data={data} onOpenCodes={(box) => setCodesModal({ box })} />

      {/* K-3 sections */}
      {k3Sections.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
            Schedule K-3
          </div>
          {k3Sections.map((section) => (
            <K3Section_ key={section.sectionId} section={section} />
          ))}
        </div>
      )}

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50 dark:bg-amber-950/30">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">Warnings</div>
          {data.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">{w}</div>
          ))}
        </div>
      )}

      {/* Raw extracted text */}
      {data.raw_text && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Raw extracted text
          </summary>
          <pre className="text-[10px] font-mono whitespace-pre-wrap mt-1 p-2 bg-muted/30 rounded-lg max-h-40 overflow-y-auto">
            {data.raw_text}
          </pre>
        </details>
      )}

      {/* Codes modal */}
      {codesModal && activeCodesSpec?.codes && (
        <K1CodesModal
          open
          boxLabel={`Box ${activeCodesSpec.box}: ${activeCodesSpec.label}`}
          codeDefinitions={activeCodesSpec.codes}
          items={data.codes[codesModal.box] ?? []}
          readOnly={readOnly}
          onClose={() => setCodesModal(null)}
          onChange={(items) => {
            updateCodes(codesModal.box, items)
            setCodesModal(null)
          }}
        />
      )}
    </div>
  )
}
