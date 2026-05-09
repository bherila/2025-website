import currency from 'currency.js'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import DateInput from '@/client-management/components/admin/DateInput'
import type { Agreement, ClientAgreementRecurringItem } from '@/client-management/types/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

const recurringItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  charge_cadence: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']),
  anchor_month: z.number().nullable(),
  anchor_day: z.number().nullable(),
  start_date: z.string().min(1),
  end_date: z.string().nullable(),
  is_taxable: z.boolean(),
  is_summarized: z.boolean(),
  notes: z.string().nullable(),
}).superRefine((value, context) => {
  if (['quarterly', 'semi_annual', 'annual'].includes(value.charge_cadence) && value.anchor_month === null) {
    context.addIssue({
      code: 'custom',
      path: ['anchor_month'],
      message: 'Anchor month is required for this cadence.',
    })
  }
})

type RecurringItemFormData = z.infer<typeof recurringItemSchema>

interface RecurringItemsEditorProps {
  companyId: number
  agreement: Agreement | null
  onChanged: () => Promise<void> | void
}

const defaultForm: RecurringItemFormData = {
  description: '',
  amount: 0,
  charge_cadence: 'monthly',
  anchor_month: null,
  anchor_day: 1,
  start_date: '',
  end_date: null,
  is_taxable: false,
  is_summarized: false,
  notes: null,
}

function previewText(item: ClientAgreementRecurringItem): string {
  const cadence = item.charge_cadence.replace('_', ' ')
  const anchor = item.anchor_month ? `, month ${item.anchor_month}` : ''
  const end = item.end_date ? ` through ${item.end_date}` : ' ongoing'

  return `${item.description} - ${currency(item.amount).format()} ${cadence}${anchor}${end}`
}

export default function RecurringItemsEditor({ companyId, agreement, onChanged }: RecurringItemsEditorProps) {
  const [form, setForm] = useState<RecurringItemFormData>(() => ({
    ...defaultForm,
    start_date: agreement?.active_date?.split(/[ T]/)[0] ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const items = useMemo(() => agreement?.recurring_items ?? [], [agreement])

  if (!agreement) {
    return <p className="text-sm text-muted-foreground">No agreement is available for recurring items.</p>
  }

  const submit = async () => {
    setError(null)
    const parsed = recurringItemSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Recurring item is invalid.')
      return
    }

    setSaving(true)
    try {
      await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/agreements/${agreement.id}/recurring-items`, parsed.data)
      setForm({ ...defaultForm, start_date: agreement.active_date.split(/[ T]/)[0] ?? '' })
      await onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ClientAgreementRecurringItem) => {
    setSaving(true)
    try {
      await fetchWrapper.delete(`/api/client/mgmt/companies/${companyId}/agreements/${agreement.id}/recurring-items/${item.id}`, {})
      await onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No recurring items are attached to this agreement.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium">{item.description}</div>
                <div className="text-sm text-muted-foreground">{previewText(item)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void remove(item)} disabled={saving}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="font-medium">Add recurring item</div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="recurring-description">Description</Label>
          <Input
            id="recurring-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recurring-amount">Amount</Label>
            <CurrencyInput
              id="recurring-amount"
              value={form.amount}
              onValueChange={(value) => setForm({ ...form, amount: value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Cadence</Label>
            <Select value={form.charge_cadence} onValueChange={(value) => setForm({ ...form, charge_cadence: value as RecurringItemFormData['charge_cadence'] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="semi_annual">Semi-annual</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recurring-anchor-month">Anchor month</Label>
            <Input
              id="recurring-anchor-month"
              type="number"
              min={1}
              max={12}
              value={form.anchor_month ?? ''}
              onChange={(event) => setForm({ ...form, anchor_month: event.target.value ? Number(event.target.value) : null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-anchor-day">Anchor day</Label>
            <Input
              id="recurring-anchor-day"
              type="number"
              min={1}
              max={28}
              value={form.anchor_day ?? ''}
              onChange={(event) => setForm({ ...form, anchor_day: event.target.value ? Number(event.target.value) : null })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recurring-start">Start</Label>
            <DateInput id="recurring-start" value={form.start_date} onValueChange={(value) => setForm({ ...form, start_date: value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-end">End</Label>
            <DateInput id="recurring-end" value={form.end_date} onValueChange={(value) => setForm({ ...form, end_date: value || null })} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_taxable} onCheckedChange={(checked) => setForm({ ...form, is_taxable: Boolean(checked) })} />
            Taxable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_summarized} onCheckedChange={(checked) => setForm({ ...form, is_summarized: Boolean(checked) })} />
            Summarized
          </label>
        </div>
        <Textarea
          value={form.notes ?? ''}
          onChange={(event) => setForm({ ...form, notes: event.target.value || null })}
          placeholder="Notes"
        />
        <Button className="w-full" onClick={() => void submit()} disabled={saving}>
          <Plus className="mr-2 h-4 w-4" />
          Add item
        </Button>
      </div>
    </div>
  )
}
