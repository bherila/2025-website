'use client'

import currency from 'currency.js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { fmtAmt, parseFieldVal } from '../tax-preview-primitives'
import { BOX11_CODES, BOX13_CODES } from './k1-codes'
import { K1_SPEC } from './k1-spec'
import type { FK1StructuredData, K1CodeItem, K1FieldSpec, K3Section } from './k1-types'
import K1CodesModal from './K1CodesModal'

// ── Badge helpers ─────────────────────────────────────────────────────────────

type BadgeInfo = { label: string; className: string }

/**
 * Parses notes text for known tax treatment keywords and returns badge metadata.
 * Falls back to a generic "Note" badge if notes exist but no specific keyword is found.
 */
function parseBadges(notes?: string): BadgeInfo[] {
  if (!notes) return []
  const badges: BadgeInfo[] = []
  const lower = notes.toLowerCase()

  if (lower.includes('nii') || lower.includes('net investment income')) {
    badges.push({ label: 'NII', className: 'bg-blue-600 text-white dark:bg-blue-500' })
  }
  if (lower.includes('ordinary') && !lower.includes('ordinary dividend')) {
    badges.push({ label: 'ORDINARY', className: 'bg-amber-600 text-white dark:bg-amber-500' })
  }
  if (lower.includes('passive')) {
    badges.push({ label: 'PASSIVE', className: 'bg-purple-600 text-white dark:bg-purple-500' })
  }

  return badges
}

/** Shows a clickable "Note" badge that triggers an onClick handler. */
function NoteBadge({ notes, onClick }: { notes?: string | undefined; onClick?: (() => void) | undefined }) {
  if (!notes) return null
  const badges = parseBadges(notes)
  const hasBadges = badges.length > 0

  return (
    <span className="inline-flex items-center gap-1">
      {hasBadges
        ? badges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center px-1.5 py-0 text-[9px] font-bold rounded ${b.className} ${onClick ? 'cursor-pointer' : ''}`}
              onClick={onClick}
              title={notes}
            >
              {b.label}
            </span>
          ))
        : null}
      {!hasBadges && onClick && (
        <span
          className="inline-flex items-center px-1.5 py-0 text-[9px] font-bold rounded bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80"
          onClick={onClick}
          title={notes}
        >
          Note
        </span>
      )}
    </span>
  )
}

// ── Amount formatting helpers ─────────────────────────────────────────────────

function amtCls(n: number | null): string {
  if (n === null) return 'text-muted-foreground'
  return n < 0 ? 'text-destructive' : ''
}

function renderAmt(n: number | null): string {
  if (n === null) return '—'
  return fmtAmt(n)
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

  const partnerName = data.fields['F']?.value ?? data.fields['B']?.value ?? null
  const ein = data.fields['A']?.value ?? null
  const summary = [partnerName, ein ? `EIN ${ein}` : null].filter(Boolean).join(' · ')

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border hover:bg-muted/50 transition-colors text-left"
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

// ── Section header primitive ──────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-muted/40 px-3 py-1.5 border-b border-border">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
    </div>
  )
}

// ── Income / Deduction line item ──────────────────────────────────────────────

function LineItem({
  boxRef,
  label,
  value,
  raw,
  notes,
  onClick,
  onNoteClick,
}: {
  boxRef?: string | undefined
  label: string
  value?: number | null | undefined
  raw?: string | undefined
  notes?: string | undefined
  onClick?: (() => void) | undefined
  onNoteClick?: (() => void) | undefined
}) {
  const n = value ?? null
  return (
    <div
      className={`flex items-baseline gap-2 px-3 py-1 min-h-[24px] ${onClick ? 'cursor-pointer hover:bg-muted/20 transition-colors' : ''}`}
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0 select-none">{boxRef ?? ''}</span>
      <span className="flex items-center gap-1.5 flex-1 text-xs">
        <span>{label}</span>
        <NoteBadge notes={notes} onClick={onNoteClick} />
      </span>
      <span className={`font-mono tabular-nums text-xs shrink-0 text-right min-w-[80px] ${amtCls(n)}`}>
        {raw ?? renderAmt(n)}
      </span>
    </div>
  )
}

function SubLine({ text }: { text: string }) {
  return (
    <div className="px-3 py-0.5 pl-[5.5rem]">
      <span className="text-[10px] text-muted-foreground leading-tight italic">{text}</span>
    </div>
  )
}

function TotalLine({ label, value, double }: { label: string; value: number | null; double?: boolean }) {
  return (
    <div
      className={`flex items-baseline gap-2 px-3 py-1.5 font-semibold ${double ? 'border-t-2 border-double border-border' : 'border-t border-border'} bg-muted/20`}
    >
      <span className="w-16 shrink-0" />
      <span className="flex-1 text-xs">{label}</span>
      <span className={`font-mono text-xs tabular-nums min-w-[80px] text-right ${amtCls(value)}`}>{renderAmt(value)}</span>
    </div>
  )
}

// ── Note detail popover (shown on click) ──────────────────────────────────────

function NoteDetail({ notes, onClose }: { notes: string; onClose: () => void }) {
  return (
    <div className="px-3 py-2 pl-[5.5rem] animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <div className="bg-muted/40 border border-border rounded-md p-2 text-[10px] text-muted-foreground leading-relaxed relative">
        <button
          type="button"
          className="absolute top-1 right-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          ✕
        </button>
        {notes}
      </div>
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
  const [openNote, setOpenNote] = useState<string | null>(null)

  const incomeFieldLines = INCOME_BOXES.map((box) => ({
    box,
    spec: specByBox[box],
    val: parseFieldVal(data.fields[box]?.value),
    notes: data.fields[box]?.notes,
  })).filter(({ val }) => val !== null && val !== 0)

  const box11Items = data.codes['11'] ?? []

  const fieldSum = incomeFieldLines.reduce((acc, { val }) => acc.add(val ?? 0), currency(0)).value
  const codeSum = box11Items.reduce((acc, item) => acc.add(parseFieldVal(item.value) ?? 0), currency(0)).value
  const subtotal = currency(fieldSum).add(codeSum).value

  if (incomeFieldLines.length === 0 && box11Items.length === 0) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <SectionHeader title="Income Items — Part III" />
      <div className="divide-y divide-dashed divide-border/50">
        {incomeFieldLines.map(({ box, spec, val, notes }) => {
          const noteKey = `field-${box}`
          return (
            <div key={box}>
              <LineItem
                boxRef={`Box ${box}`}
                label={spec?.concise ?? box}
                value={val}
                notes={notes}
                onNoteClick={notes ? () => setOpenNote(openNote === noteKey ? null : noteKey) : undefined}
              />
              {openNote === noteKey && notes && (
                <NoteDetail notes={notes} onClose={() => setOpenNote(null)} />
              )}
              {notes && openNote !== noteKey && (
                <SubLine text={notes.length > 120 ? notes.substring(0, 120) + '…' : notes} />
              )}
            </div>
          )
        })}
        {box11Items.map((item, i) => {
          const noteKey = `11-${i}`
          return (
            <div key={i}>
              <LineItem
                boxRef={`Box 11${item.code}`}
                label={BOX11_CODES[item.code] ?? `Other income (code ${item.code})`}
                value={parseFieldVal(item.value)}
                notes={item.notes}
                onClick={() => onOpenCodes('11')}
                onNoteClick={() => setOpenNote(openNote === noteKey ? null : noteKey)}
              />
              {openNote === noteKey && item.notes && (
                <NoteDetail notes={item.notes} onClose={() => setOpenNote(null)} />
              )}
              {item.notes && openNote !== noteKey && (
                <SubLine text={item.notes.length > 100 ? item.notes.substring(0, 100) + '…' : item.notes} />
              )}
            </div>
          )
        })}
        <TotalLine label="Subtotal gross income items" value={subtotal} />
      </div>
    </div>
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
  const [openNote, setOpenNote] = useState<string | null>(null)

  const box12Val = parseFieldVal(data.fields['12']?.value)
  const box21Val = parseFieldVal(data.fields['21']?.value)
  const box13Items = data.codes['13'] ?? []

  const incomeTotal = INCOME_BOXES
    .reduce((acc, box) => acc.add(parseFieldVal(data.fields[box]?.value) ?? 0), currency(0))
    .add((data.codes['11'] ?? []).reduce((acc, item) => acc.add(parseFieldVal(item.value) ?? 0), currency(0)))
    .value

  const deductionTotal = currency(box12Val !== null ? -Math.abs(box12Val) : 0)
    .add(box13Items.reduce((acc, item) => acc.add(parseFieldVal(item.value) ?? 0), currency(0)))
    .add(box21Val !== null ? -Math.abs(box21Val) : 0)
    .value

  const totalBoxDeductions = box13Items.reduce((acc, item) => {
    const v = parseFieldVal(item.value) ?? 0
    return acc.add(-Math.abs(v))
  }, currency(0))
    .add(box21Val !== null ? -Math.abs(box21Val) : 0)
    .value

  const netK1 = currency(incomeTotal).add(deductionTotal).value

  const hasContent = box12Val !== null || box13Items.length > 0 || box21Val !== null

  if (!hasContent) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <SectionHeader title="Deduction Items — Part III" />
      <div className="divide-y divide-dashed divide-border/50">
        {box13Items.map((item, i) => {
          const noteKey = `13-${i}`
          return (
            <div key={i}>
              <LineItem
                boxRef={`Box 13${item.code}`}
                label={BOX13_CODES[item.code] ?? `Other deductions (code ${item.code})`}
                value={parseFieldVal(item.value) !== null ? -Math.abs(parseFieldVal(item.value)!) : null}
                notes={item.notes}
                onClick={() => onOpenCodes('13')}
                onNoteClick={() => setOpenNote(openNote === noteKey ? null : noteKey)}
              />
              {openNote === noteKey && item.notes && (
                <NoteDetail notes={item.notes} onClose={() => setOpenNote(null)} />
              )}
            </div>
          )
        })}
        {box12Val !== null && box12Val !== 0 && (
          <LineItem boxRef="Box 12" label="Section 179 deduction" value={-Math.abs(box12Val)} />
        )}
        {box21Val !== null && box21Val !== 0 && (
          <LineItem boxRef="Box 21" label="Foreign taxes (WHTD, all passive) → Form 1116" value={box21Val} />
        )}
        <TotalLine label="Total deductions" value={totalBoxDeductions} />
        <TotalLine label="Net K-1 income/(loss)" value={netK1} double />
      </div>
    </div>
  )
}

// ── Box 20 Supplemental block ─────────────────────────────────────────────────

const BOX20_LABELS: Record<string, string> = {
  A: 'Investment income (Form 4952 reference)',
  B: 'Investment expenses (informational)',
  AA: 'Sec. 704(c) — already embedded in K-1 boxes',
  AJ: '§461(l) excess business loss components',
}

function SupplementalBlock({
  data,
  onOpenCodes,
}: {
  data: FK1StructuredData
  onOpenCodes: (box: string) => void
}) {
  const [openNote, setOpenNote] = useState<string | null>(null)
  const box20Items = data.codes['20'] ?? []
  if (box20Items.length === 0) return null

  // Capital account fields (unused in this block but kept for reference)
  // const endingCapital = parseFieldVal(data.fields['L_ending_capital']?.value)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <SectionHeader title="Box 20 Supplemental" />
      <div className="divide-y divide-dashed divide-border/50">
        {box20Items.map((item, i) => {
          const noteKey = `20-${i}`
          return (
            <div key={i}>
              <LineItem
                boxRef={`20${item.code}`}
                label={BOX20_LABELS[item.code] ?? `Other information (code ${item.code})`}
                value={item.value === 'STMT' ? null : parseFieldVal(item.value)}
                raw={item.value === 'STMT' ? 'STMT' : undefined}
                notes={item.notes}
                onClick={() => onOpenCodes('20')}
                onNoteClick={() => setOpenNote(openNote === noteKey ? null : noteKey)}
              />
              {openNote === noteKey && item.notes && (
                <NoteDetail notes={item.notes} onClose={() => setOpenNote(null)} />
              )}
              {item.value === 'STMT' && item.notes && openNote !== noteKey && (
                <SubLine text={item.notes.length > 120 ? item.notes.substring(0, 120) + '…' : item.notes} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Capital Account & Liabilities block ───────────────────────────────────────

function CapitalAccountBlock({ data }: { data: FK1StructuredData }) {
  const endingCapital = parseFieldVal(data.fields['L_ending_capital']?.value)
  const capitalMethod = data.fields['L_capital_method']?.value ?? null
  // Support both 'K_recourse' (legacy) and 'K_recourse_ending' (current backend format)
  const recourseEnding = parseFieldVal(
    (data.fields['K_recourse_ending'] ?? data.fields['K_recourse'])?.value
  )

  if (endingCapital === null && recourseEnding === null) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="divide-y divide-dashed divide-border/50">
        {endingCapital !== null && (
          <LineItem
            boxRef="L"
            label={`Ending capital account${capitalMethod ? ` (${capitalMethod.replace(/_/g, ' ').toLowerCase()})` : ''}`}
            value={endingCapital}
          />
        )}
        {recourseEnding !== null && (
          <LineItem boxRef="K1" label="Recourse liabilities (ending)" value={recourseEnding} />
        )}
      </div>
    </div>
  )
}

// ── Box 11ZZ Callout ──────────────────────────────────────────────────────────

function Box11ZZCallout({ items }: { items: K1CodeItem[] }) {
  const zzItems = items.filter((i) => i.code === 'ZZ')
  if (zzItems.length === 0) return null

  return (
    <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden bg-amber-50/50 dark:bg-amber-950/30">
      <div className="px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
          ‼ Box 11ZZ — All three items are ordinary, not capital
        </div>
        <div className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
          All {zzItems.length} Box 11ZZ components report to Schedule E Part II as nonpassive ordinary income/loss.
          {zzItems.map((item, i) => {
            const val = parseFieldVal(item.value)
            const shortDesc = item.notes?.split('.')[0] ?? `Item ${i + 1}`
            return (
              <span key={i}>
                {i > 0 ? ' ' : ' '}
                ({i + 1}) {shortDesc} ({val !== null ? fmtAmt(val) : '—'})
                {i < zzItems.length - 1 ? '.' : '.'}
              </span>
            )
          })}
          {' '}None of these go to Schedule D.
        </div>
      </div>
    </div>
  )
}

// ── K-3 Gross Income Summary table ────────────────────────────────────────────

interface K3GrossIncomeRow {
  line: string
  description: string
  country?: string
  usSource: number
  passive: number
  sourcedByPartner: number
  total: number
  isTotal?: boolean
  subRows?: Array<{ country: string; a: number; c: number; f: number; g: number }>
}

function parseK3Part2GrossIncome(sections: K3Section[]): K3GrossIncomeRow[] {
  const sec1 = sections.find((s) => s.sectionId === 'part2_section1')
  if (!sec1) return []

  const d = sec1.data as Record<string, unknown>
  const rows: K3GrossIncomeRow[] = []

  const LINE_MAP: Record<string, { description: string; field: string }> = {
    '6': { description: 'Interest income', field: 'line6_interestIncome' },
    '7-8': { description: 'Dividends', field: 'line7_ordinaryDividends' },
    '12': { description: 'Net LT cap gain', field: 'line12_netLongTermCapitalGain' },
    '20': { description: 'Other income', field: 'line20_otherIncome' },
  }

  for (const [line, meta] of Object.entries(LINE_MAP)) {
    const lineData = d[meta.field] as Record<string, unknown> | undefined
    if (!lineData) continue

    const lineRows = (lineData.rows as Array<Record<string, number | string>> | undefined) ?? []
    if (lineRows.length === 0) continue

    // For lines with many countries (7-8), aggregate into summary
    const usRows = lineRows.filter((r) => r.country === 'US')
    const foreignRows = lineRows.filter((r) => r.country !== 'US' && r.country !== 'XX')
    const xxRows = lineRows.filter((r) => r.country === 'XX')

    const agg = (rows: Array<Record<string, number | string>>, col: string) =>
      rows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0)

    // US rows
    for (const r of usRows) {
      rows.push({
        line: `Line ${line}`,
        description: `${meta.description} (US)`,
        country: 'US',
        usSource: Number(r.a) || 0,
        passive: Number(r.c) || 0,
        sourcedByPartner: Number(r.f) || 0,
        total: Number(r.g) || 0,
      })
    }

    // Foreign rows: if many countries, collapse
    if (foreignRows.length > 3) {
      rows.push({
        line: `Lines ${line}`,
        description: `${meta.description} (${foreignRows.length} foreign countries)`,
        usSource: agg(foreignRows, 'a'),
        passive: agg(foreignRows, 'c'),
        sourcedByPartner: agg(foreignRows, 'f'),
        total: agg(foreignRows, 'g'),
        subRows: foreignRows.map((r) => ({
          country: String(r.country ?? ''),
          a: Number(r.a) || 0,
          c: Number(r.c) || 0,
          f: Number(r.f) || 0,
          g: Number(r.g) || 0,
        })),
      })
    } else {
      for (const r of foreignRows) {
        rows.push({
          line: `Line ${line}`,
          description: `${meta.description} (${r.country})`,
          country: String(r.country ?? ''),
          usSource: Number(r.a) || 0,
          passive: Number(r.c) || 0,
          sourcedByPartner: Number(r.f) || 0,
          total: Number(r.g) || 0,
        })
      }
    }

    // XX rows (sourced by partner)
    for (const r of xxRows) {
      rows.push({
        line: `Line ${line}`,
        description: `${meta.description} (XX)`,
        country: 'XX',
        usSource: Number(r.a) || 0,
        passive: Number(r.c) || 0,
        sourcedByPartner: Number(r.f) || 0,
        total: Number(r.g) || 0,
      })
    }
  }

  // Total line from line24
  const line24 = d['line24_totalGrossIncome'] as Record<string, unknown> | undefined
  if (line24) {
    const totals = line24.totals as Record<string, number> | undefined
    if (totals) {
      rows.push({
        line: 'Line 24',
        description: 'Total Gross Income',
        usSource: totals.a ?? 0,
        passive: totals.c ?? 0,
        sourcedByPartner: totals.f ?? 0,
        total: totals.g ?? 0,
        isTotal: true,
      })
    }
  }

  return rows
}

function K3GrossIncomeTable({ sections }: { sections: K3Section[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const rows = parseK3Part2GrossIncome(sections)
  if (rows.length === 0) return null

  const toggleExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const fmtK3 = (n: number) => (n === 0 ? '—' : fmtAmt(n))
  const k3Cls = (n: number) => (n === 0 ? 'text-muted-foreground' : n < 0 ? 'text-destructive' : '')


  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <SectionHeader title="K-3 Gross Income & Foreign Tax Summary" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              <th className="text-left px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">K-3 Line / Description</th>
              <th className="text-right px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">U.S. Source (A)</th>
              <th className="text-right px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Passive (C)</th>
              <th className="text-right px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Sourced by Partner (F)</th>
              <th className="text-right px-3 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Total (G)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-border/50">
            {rows.map((row, idx) => {
              const isExpandable = row.subRows && row.subRows.length > 0
              const isExpanded = expandedRows.has(idx)
              return (
                <tr key={idx} className="group">
                  <td colSpan={5} className="p-0">
                    <div
                      className={`flex items-baseline ${row.isTotal ? 'bg-muted/30 font-semibold border-t border-border' : ''} ${isExpandable ? 'cursor-pointer hover:bg-muted/20' : ''}`}
                      onClick={isExpandable ? () => toggleExpand(idx) : undefined}
                    >
                      <span className={`px-3 py-1.5 flex-1 flex items-center gap-1.5 ${row.isTotal ? 'text-xs font-semibold' : 'text-xs'}`}>
                        {isExpandable && (
                          isExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className={isExpandable ? 'underline decoration-dotted underline-offset-2' : ''}>
                          {row.description}
                        </span>
                      </span>
                      <span className={`px-3 py-1.5 text-right font-mono tabular-nums w-[100px] shrink-0 ${k3Cls(row.usSource)}`}>{fmtK3(row.usSource)}</span>
                      <span className={`px-3 py-1.5 text-right font-mono tabular-nums w-[100px] shrink-0 ${k3Cls(row.passive)}`}>{fmtK3(row.passive)}</span>
                      <span className={`px-3 py-1.5 text-right font-mono tabular-nums w-[120px] shrink-0 ${k3Cls(row.sourcedByPartner)}`}>{fmtK3(row.sourcedByPartner)}</span>
                      <span className={`px-3 py-1.5 text-right font-mono tabular-nums w-[100px] shrink-0 ${k3Cls(row.total)} ${row.isTotal ? 'font-semibold' : ''}`}>{fmtK3(row.total)}</span>
                    </div>
                    {/* Expanded sub-rows */}
                    {isExpandable && isExpanded && row.subRows && (
                      <div className="bg-muted/10 border-t border-dashed border-border/50">
                        {row.subRows.map((sub, si) => (
                          <div key={si} className="flex items-baseline border-b border-dashed border-border/30 last:border-b-0">
                            <span className="px-3 py-0.5 pl-10 flex-1 text-[11px] text-muted-foreground font-mono">{sub.country}</span>
                            <span className={`px-3 py-0.5 text-right font-mono tabular-nums w-[100px] shrink-0 text-[11px] ${k3Cls(sub.a)}`}>{fmtK3(sub.a)}</span>
                            <span className={`px-3 py-0.5 text-right font-mono tabular-nums w-[100px] shrink-0 text-[11px] ${k3Cls(sub.c)}`}>{fmtK3(sub.c)}</span>
                            <span className={`px-3 py-0.5 text-right font-mono tabular-nums w-[120px] shrink-0 text-[11px] ${k3Cls(sub.f)}`}>{fmtK3(sub.f)}</span>
                            <span className={`px-3 py-0.5 text-right font-mono tabular-nums w-[100px] shrink-0 text-[11px] ${k3Cls(sub.g)}`}>{fmtK3(sub.g)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-t border-border bg-muted/10">
        Column (d) General category = $0 for every row. XX rows are "Sourced by Partner" = U.S.-source for domestic partner not subject to a treaty.
      </div>
    </div>
  )
}

// ── K-3 Part III Section 4 — Foreign Taxes Country Grid ───────────────────────

interface K3ForeignTaxCountry {
  code: string
  usd: number
}

function parseK3ForeignTaxes(sections: K3Section[]): { countries: K3ForeignTaxCountry[]; total: number; countryCount: number; allPassive: boolean } | null {
  const sec = sections.find((s) => s.sectionId === 'part3_section4')
  if (!sec) return null

  const d = sec.data as Record<string, unknown>
  const taxData = d.line1_foreignTaxesPaid as Record<string, unknown> | undefined
  if (!taxData) return null

  const countries = (taxData.countries as Array<Record<string, unknown>> | undefined) ?? []
  if (countries.length === 0) return null

  const allPassive = (taxData.allPassiveCategory as boolean) ?? true

  const parsed = countries.map((c) => ({
    code: String(c.code ?? ''),
    usd: Number(c.total ?? c.passiveForeign ?? 0),
  }))

  return {
    countries: parsed,
    total: Number(taxData.grandTotalUSD ?? parsed.reduce((acc, c) => acc + c.usd, 0)),
    countryCount: parsed.length,
    allPassive,
  }
}

/** Country name lookup for common IRS country codes. */
const COUNTRY_NAMES: Record<string, string> = {
  AS: 'Australia', BE: 'Belgium', CA: 'Canada', DA: 'Denmark', EI: 'Ireland',
  FI: 'Finland', FR: 'France', GM: 'Germany', IT: 'Italy', JA: 'Japan',
  NL: 'Netherlands', NO: 'Norway', RQ: 'Qatar', SP: 'Spain', SW: 'Sweden',
  SZ: 'Switzerland', UK: 'United Kingdom', HK: 'Hong Kong', SN: 'Singapore',
  BD: 'Bermuda', CJ: 'Cayman Islands', GK: 'Greece', JE: 'Jersey', LU: 'Luxembourg',
}

function K3ForeignTaxGrid({ sections }: { sections: K3Section[] }) {
  const taxInfo = parseK3ForeignTaxes(sections)
  if (!taxInfo) return null

  const { countries, total, countryCount, allPassive } = taxInfo

  // Arrange into a 4-column grid
  const colCount = 4
  const rowCount = Math.ceil(countries.length / colCount)
  const columns: K3ForeignTaxCountry[][] = Array.from({ length: colCount }, (_, col) =>
    countries.slice(col * rowCount, (col + 1) * rowCount)
  )

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <SectionHeader title={`K-3 Part III Section 4 — Foreign Taxes (${countryCount} Countries, All WHTD${allPassive ? ', All Passive' : ''})`} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              {Array.from({ length: colCount }).map((_, ci) => (
                <th key={`ch-${ci}`} className="text-left px-2 py-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground" colSpan={1}>
                  Country
                </th>
              )).flatMap((th, ci) => [
                th,
                <th key={`ca-${ci}`} className="text-right px-2 py-1 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">USD</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, ri) => (
              <tr key={ri} className="border-b border-dashed border-border/50">
                {columns.map((col, ci) => {
                  const entry = col[ri]
                  if (!entry) {
                    return [
                      <td key={`e-${ci}-name`} className="px-2 py-1" />,
                      <td key={`e-${ci}-amt`} className="px-2 py-1" />,
                    ]
                  }
                  return [
                    <td key={`${ci}-name`} className="px-2 py-1 font-mono">
                      <span className="font-semibold">{entry.code}</span>
                      <span className="text-muted-foreground ml-1">({COUNTRY_NAMES[entry.code] ?? entry.code})</span>
                    </td>,
                    <td key={`${ci}-amt`} className="px-2 py-1 text-right font-mono tabular-nums">${entry.usd.toLocaleString()}</td>,
                  ]
                })}
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold border-t border-border">
              <td colSpan={colCount * 2 - 1} className="px-2 py-1.5 text-xs">Total (equals Box 21)</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-xs">${total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── K-3 generic section fallback ──────────────────────────────────────────────

function K3SectionFallback({ section }: { section: K3Section }) {
  // Skip sections handled by dedicated components
  if (['header', 'part2_section1', 'part2_section2', 'part3_section4'].includes(section.sectionId)) return null

  return (
    <div className="border border-border rounded-lg px-3 py-2">
      <div className="text-xs font-semibold">{section.title}</div>
      {section.notes && <p className="text-xs text-muted-foreground mt-1 italic">{section.notes}</p>}
    </div>
  )
}

// ── Main K-1 header ───────────────────────────────────────────────────────────

function K1Header({ data }: { data: FK1StructuredData }) {
  const fundName = data.fields['B']?.value?.split('\n')[0] ?? 'Partnership'
  const ein = data.fields['A']?.value ?? '—'
  const partnerNumber = data.fields['partnerNumber']?.value ?? null
  const endingPct = data.fields['J_capitalPctEnding']?.value ?? data.fields['J_capital_ending']?.value ?? null
  const partnerType = data.fields['G']?.value ?? data.fields['G_partnerType']?.value ?? null
  const isTrader = data.fields['partnershipPosition_traderInSecurities']?.value === 'true'

  const subtitleParts = [
    ein ? `EIN ${ein}` : null,
    partnerNumber ? `Partner #${partnerNumber}` : null,
    endingPct ? `${endingPct}% ending interest` : null,
    partnerType ? partnerType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    isTrader ? 'Trader in securities' : null,
  ].filter(Boolean)

  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{fundName} — K-1 & K-3 Detail</h2>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {subtitleParts.join(' · ')}
      </div>
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
  const box11Items = data.codes['11'] ?? []

  return (
    <div className="space-y-4">
      {/* K-1 Header */}
      <K1Header data={data} />

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

      {/* Box 11ZZ Callout */}
      <Box11ZZCallout items={box11Items} />

      {/* Box 20 Supplemental */}
      <SupplementalBlock data={data} onOpenCodes={(box) => setCodesModal({ box })} />

      {/* Capital Account & Liabilities */}
      <CapitalAccountBlock data={data} />

      {/* K-3 sections */}
      {k3Sections.length > 0 && (
        <div className="space-y-4">
          <K3GrossIncomeTable sections={k3Sections} />
          <K3ForeignTaxGrid sections={k3Sections} />
          {/* Generic fallback for other K-3 sections */}
          {k3Sections.map((section) => (
            <K3SectionFallback key={section.sectionId} section={section} />
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
