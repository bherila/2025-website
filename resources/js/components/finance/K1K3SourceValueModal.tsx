'use client'

import { AlertTriangle, ExternalLink, RotateCcw, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { AmountCell, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { K1SourceValueOverride } from '@/types/finance/k1-data'

const numericOverrideSchema = z.object({
  value: z.string().trim().refine((value) => parseFieldVal(value) !== null, 'Enter a numeric amount.'),
})

type NumericOverrideForm = z.infer<typeof numericOverrideSchema>

export interface ShadowedSourceValue {
  label: string
  value: number | string | null
}

export interface K1K3SourceValue {
  title: string
  subtitle: string
  label: string
  kind: 'money' | 'text'
  sourceValue: number | string | null
  effectiveValue: number | string | null
  override: K1SourceValueOverride | null
  canOverride?: boolean
  shadowedValues?: ShadowedSourceValue[]
}

interface K1K3SourceValueModalProps {
  value: K1K3SourceValue | null
  onOpenChange: (open: boolean) => void
  onGoToSource: () => void
  onSaveOverride: (value: string | null) => Promise<void>
}

function displayText(value: number | string | null): string {
  if (value === null || value === '') {
    return '—'
  }
  return typeof value === 'number' ? String(value) : value
}

function initialOverrideValue(value: K1K3SourceValue | null): string {
  if (!value) {
    return ''
  }
  if (value.override?.value !== undefined) {
    return value.override.value
  }
  return value.effectiveValue === null ? '' : String(value.effectiveValue)
}

export default function K1K3SourceValueModal({
  value,
  onOpenChange,
  onGoToSource,
  onSaveOverride,
}: K1K3SourceValueModalProps): React.ReactElement {
  if (!value) {
    return <Dialog open={false} onOpenChange={onOpenChange} />
  }

  const key = `${value.title}:${value.subtitle}:${value.label}:${value.override?.value ?? ''}`

  return (
    <K1K3SourceValueModalContent
      key={key}
      value={value}
      onOpenChange={onOpenChange}
      onGoToSource={onGoToSource}
      onSaveOverride={onSaveOverride}
    />
  )
}

function K1K3SourceValueModalContent({
  value,
  onOpenChange,
  onGoToSource,
  onSaveOverride,
}: {
  value: K1K3SourceValue
  onOpenChange: (open: boolean) => void
  onGoToSource: () => void
  onSaveOverride: (value: string | null) => Promise<void>
}): React.ReactElement {
  const [overrideValue, setOverrideValue] = useState(() => initialOverrideValue(value))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const parsedForm = useMemo<NumericOverrideForm | null>(() => {
    if (value.kind !== 'money') {
      return null
    }
    const parsed = numericOverrideSchema.safeParse({ value: overrideValue })
    return parsed.success ? parsed.data : null
  }, [overrideValue, value])

  const canEditOverride = value.kind === 'money' && value.canOverride !== false
  const canSave = canEditOverride && parsedForm !== null && !isSaving

  async function saveOverride(): Promise<void> {
    if (!canEditOverride) {
      return
    }

    const parsed = numericOverrideSchema.safeParse({ value: overrideValue })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a numeric amount.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSaveOverride(parsed.data.value)
    } finally {
      setIsSaving(false)
    }
  }

  async function clearOverride(): Promise<void> {
    if (!value?.override) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSaveOverride(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{value.title}</DialogTitle>
          <DialogDescription>{value.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Source line</Label>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">{value.label}</div>
          </div>

          {value.kind === 'text' ? (
            <div className="space-y-1.5">
              <Label>Full value</Label>
              <Textarea value={displayText(value.sourceValue)} readOnly className="min-h-28 resize-y text-sm" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Extracted value</Label>
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-right text-sm">
                    <AmountCell val={value.sourceValue} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Effective value</Label>
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-right text-sm">
                    <AmountCell val={value.effectiveValue} />
                  </div>
                </div>
              </div>

              {canEditOverride ? (
                <div className="space-y-1.5">
                  <Label htmlFor="k1-source-override">Override source value</Label>
                  <Input
                    id="k1-source-override"
                    value={overrideValue}
                    onChange={(event) => {
                      setOverrideValue(event.target.value)
                      setError(null)
                    }}
                    inputMode="decimal"
                    className="text-right font-currency tabular-nums"
                  />
                  {error ? <p className="text-xs text-destructive">{error}</p> : null}
                </div>
              ) : null}

              {value.override ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>This source value is overridden. Tax calculations use the effective value above.</span>
                </div>
              ) : null}

              {(value.shadowedValues ?? []).length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Excluded source values</Label>
                  <div className="rounded-md border border-border bg-muted/20">
                    {(value.shadowedValues ?? []).map((shadowed) => (
                      <div key={shadowed.label} className="flex items-center justify-between gap-3 border-b border-dashed border-border/50 px-3 py-1.5 last:border-b-0">
                        <span className="text-xs text-muted-foreground line-through">{shadowed.label}</span>
                        <span className="text-xs line-through">
                          {typeof shadowed.value === 'number' ? <AmountCell val={shadowed.value} /> : displayText(shadowed.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          {canEditOverride && value.override ? (
            <Button type="button" variant="outline" onClick={() => { void clearOverride() }} disabled={isSaving}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Clear override
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onGoToSource}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Go to source
          </Button>
          {canEditOverride ? (
            <Button type="button" onClick={() => { void saveOverride() }} disabled={!canSave}>
              <Save className="h-4 w-4" aria-hidden />
              Save override
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
