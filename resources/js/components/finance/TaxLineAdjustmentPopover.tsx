'use client'

import { Loader2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

const adjustmentSchema = z.object({
  kind: z.enum(['adjustment', 'override', 'supporting_detail', 'follow_up_flag']),
  amount: z.string(),
  description: z.string(),
})

type AdjustmentForm = z.infer<typeof adjustmentSchema>

interface TaxLineAdjustmentPopoverProps {
  taxYear: number
  form: 'schedule_c' | 'form_8829'
  lineRef: string
  entityId: number | null
  onSaved?: (() => Promise<void> | void) | undefined
}

const KIND_LABELS: Record<AdjustmentForm['kind'], string> = {
  adjustment: 'Adjustment',
  override: 'Override',
  supporting_detail: 'Supporting detail',
  follow_up_flag: 'Follow-up flag',
}

export default function TaxLineAdjustmentPopover({
  taxYear,
  form,
  lineRef,
  entityId,
  onSaved,
}: TaxLineAdjustmentPopoverProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<AdjustmentForm>({
    kind: 'adjustment',
    amount: '',
    description: '',
  })
  const needsAmount = state.kind === 'adjustment' || state.kind === 'override'
  const title = useMemo(() => `${KIND_LABELS[state.kind]} · ${lineRef.replace('line_', 'L')}`, [lineRef, state.kind])

  const save = async () => {
    const parsed = adjustmentSchema.safeParse(state)
    if (!parsed.success) {
      setError('Check the line adjustment fields.')
      return
    }

    if (needsAmount && parsed.data.amount.trim() === '') {
      setError('Amount is required.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.post('/api/finance/tax-line-adjustments', {
        tax_year: taxYear,
        form,
        entity_id: entityId,
        line_ref: lineRef,
        kind: parsed.data.kind,
        amount: needsAmount ? Number(parsed.data.amount) : null,
        description: parsed.data.description.trim() || null,
      })
      setState({ kind: 'adjustment', amount: '', description: '' })
      setOpen(false)
      await onSaved?.()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save adjustment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Add adjustment for ${lineRef}`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-semibold">{title}</div>
        {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</div>}
        <div className="space-y-1.5">
          <Label htmlFor={`${form}-${lineRef}-kind`}>Type</Label>
          <Select
            value={state.kind}
            onValueChange={(kind) => setState((current) => ({ ...current, kind: kind as AdjustmentForm['kind'] }))}
          >
            <SelectTrigger id={`${form}-${lineRef}-kind`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsAmount && (
          <div className="space-y-1.5">
            <Label htmlFor={`${form}-${lineRef}-amount`}>Amount</Label>
            <Input
              id={`${form}-${lineRef}-amount`}
              type="number"
              step="0.01"
              value={state.amount}
              onChange={(event) => setState((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${form}-${lineRef}-description`}>Details</Label>
          <Textarea
            id={`${form}-${lineRef}-description`}
            value={state.description}
            onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
