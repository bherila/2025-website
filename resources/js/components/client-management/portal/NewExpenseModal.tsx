import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Project } from '@/types/client-management/common'
import type { ClientExpense, ClientExpenseFormData } from '@/types/client-management/expense'

interface NewExpenseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: number
  projects: Project[]
  onSuccess: () => void
  expense?: ClientExpense | null
}

const EXPENSE_CATEGORIES = [
  'Software & Tools',
  'Hardware',
  'Cloud Services',
  'Travel',
  'Meals & Entertainment',
  'Office Supplies',
  'Professional Services',
  'Marketing',
  'Training',
  'Other',
]

export default function NewExpenseModal({
  open,
  onOpenChange,
  companyId,
  projects,
  onSuccess,
  expense,
}: NewExpenseModalProps) {
  const isEditing = !!expense

  const [formData, setFormData] = useState<ClientExpenseFormData>({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    project_id: null,
    fin_line_item_id: null,
    is_reimbursable: false,
    is_reimbursed: false,
    reimbursed_date: null,
    category: null,
    notes: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (expense) {
      setFormData({
        description: expense.description,
        amount: expense.amount.toString(),
        expense_date: expense.expense_date.split('T')[0],
        project_id: expense.project_id,
        fin_line_item_id: expense.fin_line_item_id,
        is_reimbursable: expense.is_reimbursable,
        is_reimbursed: expense.is_reimbursed,
        reimbursed_date: expense.reimbursed_date,
        category: expense.category,
        notes: expense.notes,
      })
    } else {
      setFormData({
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        project_id: null,
        fin_line_item_id: null,
        is_reimbursable: false,
        is_reimbursed: false,
        reimbursed_date: null,
        category: null,
        notes: null,
      })
    }
    setError(null)
  }, [expense, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const url = isEditing
        ? `/api/client/mgmt/companies/${companyId}/expenses/${expense.id}`
        : `/api/client/mgmt/companies/${companyId}/expenses`

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount as string) || 0,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save expense')
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter expense description"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense_date">Date *</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category || ''}
              onValueChange={(value) => setFormData({ ...formData, category: value || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <Select
              value={formData.project_id?.toString() || ''}
              onValueChange={(value) => 
                setFormData({ ...formData, project_id: value ? parseInt(value) : null })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fin_line_item_id">Finance Line Item ID (optional)</Label>
            <Input
              id="fin_line_item_id"
              type="number"
              value={formData.fin_line_item_id || ''}
              onChange={(e) => 
                setFormData({ 
                  ...formData, 
                  fin_line_item_id: e.target.value ? parseInt(e.target.value) : null 
                })
              }
              placeholder="Enter t_id from finance transactions"
            />
            <p className="text-xs text-muted-foreground">
              Link to a FinAccount transaction by entering its t_id
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_reimbursable"
              checked={formData.is_reimbursable}
              onCheckedChange={(checked) => setFormData({ ...formData, is_reimbursable: checked })}
            />
            <Label htmlFor="is_reimbursable">Reimbursable expense</Label>
          </div>

          {formData.is_reimbursable && (
            <div className="flex items-center space-x-2 ml-6">
              <Switch
                id="is_reimbursed"
                checked={formData.is_reimbursed}
                onCheckedChange={(checked) => setFormData({ ...formData, is_reimbursed: checked })}
              />
              <Label htmlFor="is_reimbursed">Already reimbursed</Label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value || null })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
