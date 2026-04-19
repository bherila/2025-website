'use client'

import currency from 'currency.js'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { UserDeductionEntry } from '@/types/finance/tax-return'

const CATEGORY_LABELS: Record<string, string> = {
  real_estate_tax: 'Real estate / property tax',
  state_est_tax: 'State estimated tax paid',
  sales_tax: 'General sales tax',
  mortgage_interest: 'Mortgage interest',
  charitable_cash: 'Charitable — cash',
  charitable_noncash: 'Charitable — non-cash',
  other: 'Other deduction',
}

interface UserDeductionsSectionProps {
  year: number
  deductions: UserDeductionEntry[]
  onChange: (deductions: UserDeductionEntry[]) => void
}

interface FormState {
  category: string
  description: string
  amount: string
}

const EMPTY_FORM: FormState = { category: '', description: '', amount: '' }

export default function UserDeductionsSection({ year, deductions, onChange }: UserDeductionsSectionProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const amount = currency(form.amount).value
    if (!form.category || amount <= 0) return
    setSaving(true)
    try {
      if (editingId !== null) {
        const updated = await fetchWrapper.put(`/api/finance/user-deductions/${editingId}`, {
          category: form.category,
          description: form.description || null,
          amount,
        }) as UserDeductionEntry
        onChange(deductions.map(d => d.id === editingId ? updated : d))
        setEditingId(null)
      } else {
        const created = await fetchWrapper.post('/api/finance/user-deductions', {
          tax_year: year,
          category: form.category,
          description: form.description || null,
          amount,
        }) as UserDeductionEntry
        onChange([...deductions, created])
      }
      setForm(EMPTY_FORM)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(d: UserDeductionEntry) {
    setEditingId(d.id)
    setForm({ category: d.category, description: d.description ?? '', amount: String(d.amount) })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleDelete(id: number, label: string) {
    if (!window.confirm(`Remove "${label}"?`)) return
    await fetchWrapper.delete(`/api/finance/user-deductions/${id}`, undefined)
    onChange(deductions.filter(d => d.id !== id))
  }

  return (
    <div className="space-y-3">
      {deductions.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {deductions.map(d => (
              <TableRow key={d.id}>
                <TableCell className="text-sm">{CATEGORY_LABELS[d.category] ?? d.category}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.description ?? '—'}</TableCell>
                <TableCell className="text-right font-mono text-sm">{currency(d.amount).format()}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)} aria-label={`Edit ${CATEGORY_LABELS[d.category] ?? d.category}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id, CATEGORY_LABELS[d.category] ?? d.category)} aria-label={`Delete ${CATEGORY_LABELS[d.category] ?? d.category}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add / edit form */}
      <div className="flex gap-2 flex-wrap items-end">
        <div className="w-52">
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          className="h-8 text-xs w-44"
          placeholder="Description (optional)"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <Input
          className="h-8 text-xs w-28 font-mono"
          placeholder="Amount"
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
        />
        <Button size="sm" className="h-8 text-xs" disabled={saving || !form.category || !form.amount} onClick={handleSave}>
          {editingId !== null ? 'Save' : '+ Add'}
        </Button>
        {editingId !== null && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cancelEdit}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
