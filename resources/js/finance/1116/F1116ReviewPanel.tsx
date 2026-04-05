'use client'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { K1FieldSpec } from '@/components/finance/k1/k1-types'
import { F1116_SPEC } from './F1116_SPEC'
import type { F1116Data } from './types'

interface F1116ReviewPanelProps {
  data: F1116Data
  onChange: (updated: F1116Data) => void
  readOnly?: boolean
}

/** Renders a single field based on its spec. Copied from K1ReviewPanel for autonomy. */
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
        <Label htmlFor={`f1116-field-${spec.box}`} className="text-xs cursor-pointer">
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

  // Default: text
  return (
    <Input
      className={inputClass}
      value={stringVal}
      onChange={(e) => onChangeValue(e.target.value || null)}
      readOnly={readOnly}
    />
  )
}

function F1116FieldRow({
  spec,
  data,
  readOnly,
  onUpdate,
}: {
  spec: K1FieldSpec
  data: F1116Data
  readOnly: boolean
  onUpdate: (box: string, value: string | null) => void
}) {
  const fieldValue = data.fields[spec.box]
  const lowConfidence = !readOnly && fieldValue?.confidence != null && fieldValue.confidence < 0.85 && !fieldValue.manualOverride

  return (
    <div className={`flex items-start gap-2 group min-h-[28px] rounded-sm transition-colors ${lowConfidence ? 'bg-amber-50/50 ring-1 ring-amber-200/50 p-0.5 -m-0.5' : ''}`}>
      <div className="flex items-center gap-1 w-12 shrink-0 pt-0.5">
        <span className={`text-[10px] font-mono font-semibold ${lowConfidence ? 'text-amber-700' : 'text-muted-foreground'}`}>{spec.box}</span>
        {fieldValue?.manualOverride && (
          <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3.5 border-amber-400 text-amber-600">
            M
          </Badge>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <label className={`text-[10px] leading-tight block mb-0.5 truncate ${lowConfidence ? 'text-amber-800 font-medium' : 'text-muted-foreground'}`} title={spec.label}>
          {spec.concise}
          {lowConfidence && <span className="ml-1 text-[8px] uppercase tracking-tighter">(Needs Review)</span>}
        </label>
        <F1116Field spec={spec} value={fieldValue?.value} readOnly={readOnly} onChangeValue={(v) => onUpdate(spec.box, v)} />
      </div>
    </div>
  )
}

export default function F1116ReviewPanel({ data, onChange, readOnly = false }: F1116ReviewPanelProps) {
  const leftSpec = F1116_SPEC.filter((s) => s.side === 'left').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))
  const rightSpec = F1116_SPEC.filter((s) => s.side === 'right').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))

  const updateField = (box: string, value: string | null) => {
    onChange({
      ...data,
      fields: {
        ...data.fields,
        [box]: {
          ...(data.fields[box] ?? {}),
          value,
          manualOverride: true,
        },
      },
    })
  }

  const renderPanel = (specs: K1FieldSpec[]) => (
    <div className="space-y-2">
      {specs.map((spec) => (
        <F1116FieldRow key={spec.box} spec={spec} data={data} readOnly={readOnly} onUpdate={updateField} />
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 pb-2">Classification</div>
          {renderPanel(leftSpec)}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 pb-2">Financials</div>
          {renderPanel(rightSpec)}
        </div>
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="mt-2 border border-amber-200 rounded p-2 bg-amber-50">
          <div className="text-xs font-semibold text-amber-700 mb-1">Warnings</div>
          {data.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600">
              {w}
            </div>
          ))}
        </div>
      )}

      {data.raw_text && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none">Raw extracted text</summary>
          <pre className="text-[10px] font-mono whitespace-pre-wrap mt-1 p-2 bg-muted/30 rounded max-h-40 overflow-y-auto">{data.raw_text}</pre>
        </details>
      )}
    </div>
  )
}
