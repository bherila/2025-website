'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

const entityYearSchema = z.object({
  tax_year: z.number().int(),
  accounting_method: z.enum(['cash', 'accrual', 'other']),
  materially_participated: z.boolean(),
  made_payments_requiring_1099: z.boolean(),
  filed_required_1099s: z.boolean().nullable(),
  started_or_acquired_this_year: z.boolean(),
  principal_product_service: z.string(),
  business_code: z.string(),
  notes: z.string(),
})

type EntityYearForm = z.infer<typeof entityYearSchema>

interface EmploymentEntityYearDialogProps {
  open: boolean
  entityId: number
  entityName: string
  taxYear: number
  onClose: () => void
  onSaved?: (() => Promise<void> | void) | undefined
}

function emptyForm(taxYear: number): EntityYearForm {
  return {
    tax_year: taxYear,
    accounting_method: 'cash',
    materially_participated: true,
    made_payments_requiring_1099: false,
    filed_required_1099s: null,
    started_or_acquired_this_year: false,
    principal_product_service: '',
    business_code: '',
    notes: '',
  }
}

export default function EmploymentEntityYearDialog({
  open,
  entityId,
  entityName,
  taxYear,
  onClose,
  onSaved,
}: EmploymentEntityYearDialogProps) {
  const [form, setForm] = useState<EntityYearForm>(() => emptyForm(taxYear))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await fetchWrapper.get(`/api/finance/employment-entities/${entityId}/years?year=${taxYear}`)
        const row = Array.isArray(rows) ? rows[0] : null
        if (!cancelled) {
          setForm(row ? {
            tax_year: Number(row.tax_year),
            accounting_method: row.accounting_method ?? 'cash',
            materially_participated: Boolean(row.materially_participated),
            made_payments_requiring_1099: Boolean(row.made_payments_requiring_1099),
            filed_required_1099s: row.filed_required_1099s === null ? null : Boolean(row.filed_required_1099s),
            started_or_acquired_this_year: Boolean(row.started_or_acquired_this_year),
            principal_product_service: row.principal_product_service ?? '',
            business_code: row.business_code ?? '',
            notes: row.notes ?? '',
          } : emptyForm(taxYear))
        }
      } catch (err) {
        if (!cancelled) setError(typeof err === 'string' ? err : 'Failed to load year details.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [entityId, open, taxYear])

  const save = async () => {
    const parsed = entityYearSchema.safeParse(form)
    if (!parsed.success) {
      setError('Check the year detail fields.')
      return
    }
    if (parsed.data.business_code && !/^\d{6}$/.test(parsed.data.business_code)) {
      setError('Business code must be six digits.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.put(`/api/finance/employment-entities/${entityId}/years/${taxYear}`, {
        ...parsed.data,
        principal_product_service: parsed.data.principal_product_service.trim() || null,
        business_code: parsed.data.business_code.trim() || null,
        notes: parsed.data.notes.trim() || null,
      })
      await onSaved?.()
      onClose()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save year details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entityName} · {taxYear} Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="entity-year-accounting">Accounting method</Label>
                  <Select
                    value={form.accounting_method}
                    onValueChange={(value) => setForm((current) => ({ ...current, accounting_method: value as EntityYearForm['accounting_method'] }))}
                  >
                    <SelectTrigger id="entity-year-accounting"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="accrual">Accrual</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entity-year-code">Business code</Label>
                  <Input
                    id="entity-year-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={form.business_code}
                    onChange={(event) => setForm((current) => ({ ...current, business_code: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="entity-year-service">Principal product or service</Label>
                <Input
                  id="entity-year-service"
                  value={form.principal_product_service}
                  onChange={(event) => setForm((current) => ({ ...current, principal_product_service: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.materially_participated} onCheckedChange={(checked) => setForm((current) => ({ ...current, materially_participated: checked }))} />
                  Material participation
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.started_or_acquired_this_year} onCheckedChange={(checked) => setForm((current) => ({ ...current, started_or_acquired_this_year: checked }))} />
                  Started or acquired this year
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.made_payments_requiring_1099} onCheckedChange={(checked) => setForm((current) => ({ ...current, made_payments_requiring_1099: checked }))} />
                  1099 payments made
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.filed_required_1099s === true}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, filed_required_1099s: checked }))}
                  />
                  Required 1099s filed
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="entity-year-notes">Notes</Label>
                <Textarea id="entity-year-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
