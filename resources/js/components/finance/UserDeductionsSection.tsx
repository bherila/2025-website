'use client'

import currency from 'currency.js'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import { DEDUCTION_CATEGORY_LABELS as CATEGORY_LABELS, labelForCategory } from '@/lib/tax/deductionCategories'
import type { UserDeductionEntry } from '@/types/finance/tax-return'

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
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const amount = currency(form.amount).value
    if (!form.category || amount <= 0) return
    setSaving(true)
    try {
      setError(null)
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
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save deduction.')
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
    try {
      setError(null)
      await fetchWrapper.delete(`/api/finance/user-deductions/${id}`, undefined)
      onChange(deductions.filter(d => d.id !== id))
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to delete deduction.')
    }
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
                <TableCell className="text-sm">{labelForCategory(d.category)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.description ?? '—'}</TableCell>
                <TableCell className="text-right font-mono text-sm">{currency(d.amount).format()}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)} aria-label={`Edit ${labelForCategory(d.category)}`}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id, labelForCategory(d.category))} aria-label={`Delete ${labelForCategory(d.category)}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

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
        <Button type="button" size="sm" className="h-8 text-xs" disabled={saving || !form.category || !form.amount} onClick={handleSave}>
          {editingId !== null ? 'Save' : '+ Add'}
        </Button>
        {editingId !== null && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={cancelEdit}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
