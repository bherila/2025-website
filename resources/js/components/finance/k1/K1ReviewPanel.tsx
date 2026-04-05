'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { K1_SPEC } from './k1-spec'
import type { FK1StructuredData, K1CodeItem, K1FieldSpec } from './k1-types'
import K1CodesModal from './K1CodesModal'

interface K1ReviewPanelProps {
  data: FK1StructuredData
  onChange: (updated: FK1StructuredData) => void
  readOnly?: boolean
}

/** Renders a single K-1 field based on its spec. */
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

/** One row in the spec-driven field grid. */
function K1FieldRow({
  spec,
  data,
  readOnly,
  onUpdate,
  onOpenCodes,
}: {
  spec: K1FieldSpec
  data: FK1StructuredData
  readOnly: boolean
  onUpdate: (box: string, value: string | null) => void
  onOpenCodes: (box: string) => void
}) {
  const fieldValue = data.fields[spec.box]
  const codeItems = data.codes[spec.box]
  const hasCodesData = Array.isArray(codeItems) && codeItems.length > 0

  return (
    <div className="flex items-start gap-2 group min-h-[28px]">
      <div className="flex items-center gap-1 w-12 shrink-0 pt-0.5">
        <span className="text-[10px] text-muted-foreground font-mono font-semibold">{spec.box}</span>
        {fieldValue?.manualOverride && (
          <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3.5 border-amber-400 text-amber-600">
            M
          </Badge>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <label className="text-[10px] text-muted-foreground leading-tight block mb-0.5 truncate" title={spec.label}>
          {spec.concise}
        </label>
        {spec.fieldType === 'buttonDetails' ? (
          <Button
            variant="outline"
            size="sm"
            className={`h-7 text-xs w-full justify-between ${hasCodesData ? 'border-primary/40 text-primary' : ''}`}
            onClick={() => onOpenCodes(spec.box)}
          >
            <span>{hasCodesData ? `${codeItems.length} code${codeItems.length !== 1 ? 's' : ''}` : 'No data'}</span>
            <span className="text-muted-foreground text-[10px]">Details →</span>
          </Button>
        ) : (
          <K1Field spec={spec} value={fieldValue?.value} readOnly={readOnly} onChangeValue={(v) => onUpdate(spec.box, v)} />
        )}
      </div>
    </div>
  )
}

/**
 * Spec-driven two-panel K-1 review/edit UI.
 *
 * Left panel: entity/partner identification fields (boxes A–O).
 * Right panel: income/deduction/credit fields (boxes 1–20).
 */
export default function K1ReviewPanel({ data, onChange, readOnly = false }: K1ReviewPanelProps) {
  const [codesModal, setCodesModal] = useState<{ box: string } | null>(null)

  const leftSpec = K1_SPEC.filter((s) => s.side === 'left').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))
  const rightSpec = K1_SPEC.filter((s) => s.side === 'right').sort((a, b) => (a.uiOrder ?? 99) - (b.uiOrder ?? 99))

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

  const updateCodes = (box: string, items: K1CodeItem[]) => {
    onChange({
      ...data,
      codes: {
        ...data.codes,
        [box]: items,
      },
    })
  }

  const activeCodesSpec = codesModal ? K1_SPEC.find((s) => s.box === codesModal.box) : null

  const renderPanel = (specs: K1FieldSpec[]) => (
    <div className="space-y-2">
      {specs.map((spec) => (
        <K1FieldRow key={spec.box} spec={spec} data={data} readOnly={readOnly} onUpdate={updateField} onOpenCodes={(box) => setCodesModal({ box })} />
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Extraction metadata badge */}
      {data.extraction?.model && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            Extracted by <span className="font-mono">{data.extraction.model}</span>
          </span>
          {data.extraction.confidence != null && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
              {Math.round(data.extraction.confidence * 100)}% conf.
            </Badge>
          )}
          {data.extraction.timestamp && <span>· {new Date(data.extraction.timestamp).toLocaleString()}</span>}
        </div>
      )}

      {/* Two-column field grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 pb-2">Entity / Partner Info</div>
          {renderPanel(leftSpec)}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 pb-2">Income / Deductions / Credits</div>
          {renderPanel(rightSpec)}
        </div>
      </div>

      {/* K-3 sections */}
      {data.k3 && data.k3.sections.length > 0 && (
        <div className="mt-4 border rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule K-3 Sections</div>
          {data.k3.sections.map((section) => (
            <div key={section.sectionId} className="border rounded p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold">{section.sectionId}</span>
                <span className="text-xs text-muted-foreground">{section.title}</span>
              </div>
              {section.notes && <p className="text-xs text-muted-foreground italic">{section.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
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

      {/* Supplemental text */}
      {data.raw_text && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none">Raw extracted text</summary>
          <pre className="text-[10px] font-mono whitespace-pre-wrap mt-1 p-2 bg-muted/30 rounded max-h-40 overflow-y-auto">{data.raw_text}</pre>
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
