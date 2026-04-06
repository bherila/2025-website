'use client'

import currency from 'currency.js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { K1FieldSpec } from '@/components/finance/k1/k1-types'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { F1116_SPEC } from './F1116_SPEC'
import type { F1116Data } from './types'

interface F1116ReviewPanelProps {
  data: F1116Data
  onChange: (updated: F1116Data) => void
  readOnly?: boolean
}

// ── Value helpers ─────────────────────────────────────────────────────────────

function parseVal(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '' || v === 'null') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function fmtAmt(n: number, precision = 2): string {
  const abs = currency(Math.abs(n), { precision }).format()
  return n < 0 ? `(${abs})` : abs
}

function AmountCell({ val, className = '' }: { val: string | number | null | undefined; className?: string }) {
  const n = typeof val === 'number' ? val : parseVal(val as string | null | undefined)
  if (n === null) return <span className={`font-mono text-muted-foreground ${className}`}>—</span>
  if (n === 0) return <span className={`font-mono ${className}`}>$0</span>
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
  lineRef,
  label,
  value,
  approx,
}: {
  lineRef?: string
  label: React.ReactNode
  value: string | number | null | undefined
  approx?: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[10px] font-mono text-muted-foreground w-14 shrink-0 select-none">{lineRef ?? ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      {approx ? (
        <span className="font-mono tabular-nums text-[13px] text-muted-foreground shrink-0">
          {typeof value === 'string' ? value : value !== null && value !== undefined ? `~${fmtAmt(Number(value))}` : '—'}
        </span>
      ) : (
        <AmountCell val={value} className="text-[13px] shrink-0" />
      )}
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

// ── Field editor (for classification collapsible) ─────────────────────────────

function F1116Field({
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
          id={`f1116-field-${spec.box}`}
          checked={checked}
          onCheckedChange={readOnly ? () => {} : (c) => onChangeValue(c ? 'true' : 'false')}
          disabled={readOnly}
        />
        <Label htmlFor={`f1116-field-${spec.box}`} className="text-xs cursor-pointer">{checked ? 'Yes' : 'No'}</Label>
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
            <SelectItem key={item} value={item}>{item}</SelectItem>
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

// ── Classification collapsible ────────────────────────────────────────────────

function ClassificationSection({
  data,
  readOnly,
  onUpdate,
}: {
  data: F1116Data
  readOnly: boolean
  onUpdate: (box: string, value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const classSpecs = F1116_SPEC.filter((s) => s.side === 'left').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))

  const category = data.fields['Category']?.value ?? null
  const country = data.fields['Country']?.value ?? null
  const summary = [category ? `Category: ${category}` : null, country ? `Country: ${country}` : null].filter(Boolean).join(' · ')

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-semibold tracking-wide">Classification</span>
        {!open && summary && (
          <span className="text-[11px] text-muted-foreground truncate ml-1">{summary}</span>
        )}
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {classSpecs.map((spec) => {
            const fieldValue = data.fields[spec.box]
            const lowConfidence =
              !readOnly && fieldValue?.confidence != null && fieldValue.confidence < 0.85 && !fieldValue.manualOverride
            return (
              <div
                key={spec.box}
                className={`flex items-start gap-2 min-h-[28px] rounded-sm ${lowConfidence ? 'bg-amber-50/50 ring-1 ring-amber-200/50 p-0.5 -m-0.5' : ''}`}
              >
                <div className="flex items-center gap-1 w-16 shrink-0 pt-0.5">
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
                  <F1116Field spec={spec} value={fieldValue?.value} readOnly={readOnly} onChangeValue={(v) => onUpdate(spec.box, v)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Financial blocks ──────────────────────────────────────────────────────────

function PartIBlock({ data }: { data: F1116Data }) {
  const income1a = parseVal(data.fields['1a']?.value)
  const income1b = parseVal(data.fields['1b']?.value)
  const total = (income1a ?? 0) + (income1b ?? 0)

  if (income1a === null && income1b === null) return null

  return (
    <FormBlock title="Part I — Foreign Country &amp; Income">
      <FormLine lineRef="L.1a" label="Gross income — passive category" value={income1a} />
      {income1b !== null && <FormLine lineRef="L.1b" label="Gross income — general category" value={income1b} />}
      <FormTotalLine label="Total gross foreign income" value={total} />
    </FormBlock>
  )
}

function PartIIBlock({ data }: { data: F1116Data }) {
  const expenses = parseVal(data.fields['2']?.value)
  const income1a = parseVal(data.fields['1a']?.value)
  const income1b = parseVal(data.fields['1b']?.value)
  const grossIncome = (income1a ?? 0) + (income1b ?? 0)
  const netIncome = expenses !== null ? grossIncome - Math.abs(expenses) : null

  if (expenses === null) return null

  return (
    <FormBlock title="Part II — Apportioned Deductions">
      <FormLine lineRef="L.2" label="Pro-rata allocable expenses" value={expenses !== null ? -Math.abs(expenses) : null} />
      <FormTotalLine label="Foreign source taxable income" value={netIncome} />
    </FormBlock>
  )
}

function PartIIIBlock({ data }: { data: F1116Data }) {
  const taxesPaid = parseVal(data.fields['9']?.value)
  const carryover = parseVal(data.fields['10']?.value)
  const tentative = parseVal(data.fields['20']?.value)
  const ftcAdjustments = data.codes?.FTCAdjustments ?? []

  if (taxesPaid === null && tentative === null) return null

  const totalTaxes = (taxesPaid ?? 0) + (carryover ?? 0)
  const creditAllowed = tentative !== null ? Math.min(totalTaxes, tentative) : null

  return (
    <FormBlock title="Part III — Limitation Calculation">
      {taxesPaid !== null && <FormLine lineRef="L.9" label="Foreign taxes paid or accrued" value={taxesPaid} />}
      {carryover !== null && carryover !== 0 && <FormLine lineRef="L.10" label="Tax carryover from prior year" value={carryover} />}
      {ftcAdjustments.length > 0 && (
        ftcAdjustments.map((adj, i) => (
          <FormLine key={i} lineRef={adj.code} label={`FTC adjustment (${adj.code})`} value={adj.value} />
        ))
      )}
      {tentative !== null && <FormLine lineRef="L.21" label="FTC limitation (tentative credit)" value={tentative} />}
      <FormTotalLine
        label={creditAllowed !== null && tentative !== null && totalTaxes <= tentative ? 'Credit allowed — fully allowed ✓' : 'Credit allowed'}
        value={creditAllowed}
        double
      />
      {creditAllowed !== null && totalTaxes > (tentative ?? Infinity) && (
        <FormLine
          lineRef=""
          label="Excess taxes (carryforward to next year)"
          value={totalTaxes - (tentative ?? 0)}
        />
      )}
    </FormBlock>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function F1116ReviewPanel({ data, onChange, readOnly = false }: F1116ReviewPanelProps) {
  const financialSpecs = F1116_SPEC.filter((s) => s.side === 'right').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))

  const updateField = (box: string, value: string | null) => {
    onChange({
      ...data,
      fields: {
        ...data.fields,
        [box]: { ...(data.fields[box] ?? {}), value, manualOverride: true },
      },
    })
  }

  const category = data.fields['Category']?.value ?? data.category ?? 'passive'
  const country = data.fields['Country']?.value ?? null

  return (
    <div className="space-y-4">
      {/* Document sub-header */}
      <div className="text-[11px] text-muted-foreground">
        Form 1116 — Foreign Tax Credit
        {category && <span> · <span className="capitalize font-medium">{category}</span> category</span>}
        {country && <span> · {country}</span>}
      </div>

      {/* Classification (collapsible) */}
      <ClassificationSection data={data} readOnly={readOnly} onUpdate={updateField} />

      {/* Financial blocks — two column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PartIBlock data={data} />
        <PartIIBlock data={data} />
      </div>

      {/* Part III — full width */}
      <PartIIIBlock data={data} />

      {/* Direct financial field editor for any field not shown above */}
      {!readOnly && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Edit raw field values
          </summary>
          <div className="mt-2 space-y-2 p-3 border rounded-lg bg-muted/10">
            {financialSpecs.map((spec) => {
              const fieldValue = data.fields[spec.box]
              const lowConfidence =
                fieldValue?.confidence != null && fieldValue.confidence < 0.85 && !fieldValue.manualOverride
              return (
                <div
                  key={spec.box}
                  className={`flex items-start gap-2 min-h-[28px] rounded-sm ${lowConfidence ? 'bg-amber-50/50 ring-1 ring-amber-200/50 p-0.5 -m-0.5' : ''}`}
                >
                  <div className="flex items-center gap-1 w-12 shrink-0 pt-0.5">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground">{spec.box}</span>
                    {fieldValue?.manualOverride && (
                      <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3.5 border-amber-400 text-amber-600">M</Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] leading-tight block mb-0.5 text-muted-foreground">{spec.concise}</label>
                    <F1116Field spec={spec} value={fieldValue?.value} readOnly={readOnly} onChangeValue={(v) => updateField(spec.box, v)} />
                  </div>
                </div>
              )
            })}
          </div>
        </details>
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

      {/* Raw text */}
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
    </div>
  )
}
