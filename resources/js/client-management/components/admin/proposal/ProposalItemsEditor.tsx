import { Plus, Trash2 } from 'lucide-react'

import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import type { ProposalItemKind } from '@/client-management/types/proposal'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface EditableItem {
  /** Local-only React key; stable across edits. */
  key: string
  id?: number
  kind: ProposalItemKind
  description: string
  amount: string
  charge_cadence: 'one_time' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  is_optional: boolean
}

interface ProposalItemsEditorProps {
  items: EditableItem[]
  onChange: (items: EditableItem[]) => void
  disabled?: boolean
}

let keySeq = 0
export function newItem(): EditableItem {
  keySeq += 1
  return {
    key: `new-${keySeq}-${Date.now()}`,
    kind: 'add_on',
    description: '',
    amount: '',
    charge_cadence: 'one_time',
    is_optional: false,
  }
}

/**
 * Editor for a proposal's scope/add-on line items. Scope items are unpriced
 * deliverables (→ tasks); add-ons carry an amount and a charge cadence.
 */
export default function ProposalItemsEditor({ items, onChange, disabled = false }: ProposalItemsEditorProps) {
  const update = (index: number, patch: Partial<EditableItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No line items yet. Add scope deliverables or priced add-ons.</p>
      )}

      {items.map((item, index) => (
        <div key={item.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-12">
          <div className="space-y-1 sm:col-span-3">
            <Label>Kind</Label>
            <Select
              value={item.kind}
              onValueChange={(value) =>
                update(index, {
                  kind: value as ProposalItemKind,
                  amount: value === 'scope' ? '' : item.amount,
                  charge_cadence: value === 'scope' ? 'one_time' : item.charge_cadence,
                })
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scope">Scope (deliverable)</SelectItem>
                <SelectItem value="add_on">Add-on (priced)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-4">
            <Label>Description</Label>
            <Input
              value={item.description}
              onChange={(e) => update(index, { description: e.target.value })}
              disabled={disabled}
              placeholder={item.kind === 'scope' ? 'e.g. Homepage' : 'e.g. SEO setup'}
            />
          </div>

          {item.kind === 'add_on' && (
            <>
              <div className="space-y-1 sm:col-span-2">
                <Label>Amount ($)</Label>
                <CurrencyInput
                  value={item.amount}
                  onValueChange={(value) => update(index, { amount: String(value) })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label>Cadence</Label>
                <Select
                  value={item.charge_cadence}
                  onValueChange={(value) => update(index, { charge_cadence: value as EditableItem['charge_cadence'] })}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi_annual">Semiannual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 sm:col-span-9">
            <Checkbox
              id={`optional-${item.key}`}
              checked={item.is_optional}
              onCheckedChange={(checked) => update(index, { is_optional: Boolean(checked) })}
              disabled={disabled}
            />
            <Label htmlFor={`optional-${item.key}`} className="text-sm font-normal">
              Optional (client can opt in/out at acceptance)
            </Label>
          </div>

          {!disabled && (
            <div className="flex items-end justify-end sm:col-span-3">
              <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <Button variant="outline" size="sm" onClick={() => onChange([...items, newItem()])}>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      )}
    </div>
  )
}
