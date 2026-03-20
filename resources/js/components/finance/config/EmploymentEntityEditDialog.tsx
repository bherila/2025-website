'use client'

import { Loader2 } from 'lucide-react'
import React, { useRef } from 'react'

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

export interface EmploymentEntity {
  id: number
  display_name: string
  start_date: string
  end_date: string | null
  is_current: boolean
  ein: string | null
  address: string | null
  type: 'sch_c' | 'w2' | 'hobby'
  sic_code: number | null
  is_spouse: boolean
  created_at: string
  updated_at: string
}

export interface EmploymentEntityFormData {
  display_name: string
  type: 'sch_c' | 'w2' | 'hobby'
  start_date: string
  is_current: boolean
  end_date: string
  ein: string
  address: string
  sic_code: string
  is_spouse: boolean
}

export const emptyEmploymentEntityForm: EmploymentEntityFormData = {
  display_name: '',
  type: 'w2',
  start_date: '',
  is_current: true,
  end_date: '',
  ein: '',
  address: '',
  sic_code: '',
  is_spouse: false,
}

interface EmploymentEntityEditDialogProps {
  open: boolean
  editingEntity: EmploymentEntity | null
  form: EmploymentEntityFormData
  formError: string | null
  saving: boolean
  onClose: () => void
  onFormChange: React.Dispatch<React.SetStateAction<EmploymentEntityFormData>>
  onSave: () => void
}

export default function EmploymentEntityEditDialog({
  open,
  editingEntity,
  form,
  formError,
  saving,
  onClose,
  onFormChange,
  onSave,
}: EmploymentEntityEditDialogProps) {
  const formRef = useRef<HTMLFormElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !saving) {
      e.preventDefault()
      onSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {editingEntity ? 'Edit Employment Entity' : 'Add Employment Entity'}
          </DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSave()
          }}
        >
          {formError && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ee-display-name">
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ee-display-name"
              value={form.display_name}
              onChange={(e) => onFormChange((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="e.g. Acme Corp, Freelance Design"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ee-type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.type}
              onValueChange={(val) =>
                onFormChange((f) => ({ ...f, type: val as EmploymentEntityFormData['type'] }))
              }
              disabled={!!editingEntity}
            >
              <SelectTrigger id="ee-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="w2">W-2</SelectItem>
                <SelectItem value="sch_c">Schedule C</SelectItem>
                <SelectItem value="hobby">Hobby</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ee-start-date">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ee-start-date"
                type="date"
                value={form.start_date}
                onChange={(e) => onFormChange((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>

            {!form.is_current && (
              <div className="space-y-2">
                <Label htmlFor="ee-end-date">End Date</Label>
                <Input
                  id="ee-end-date"
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  onChange={(e) => onFormChange((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="ee-is-current"
              checked={form.is_current}
              onCheckedChange={(checked) =>
                onFormChange((f) => ({ ...f, is_current: checked, end_date: checked ? '' : f.end_date }))
              }
            />
            <Label htmlFor="ee-is-current">Currently active</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ee-ein">EIN</Label>
            <Input
              id="ee-ein"
              value={form.ein}
              onChange={(e) => onFormChange((f) => ({ ...f, ein: e.target.value }))}
              placeholder="XX-XXXXXXX"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ee-address">Address</Label>
            <Textarea
              id="ee-address"
              value={form.address}
              onChange={(e) => onFormChange((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, City, State ZIP"
            />
          </div>

          {form.type === 'sch_c' && (
            <div className="space-y-2">
              <Label htmlFor="ee-sic-code">SIC Code</Label>
              <Input
                id="ee-sic-code"
                type="number"
                value={form.sic_code}
                onChange={(e) => onFormChange((f) => ({ ...f, sic_code: e.target.value }))}
                placeholder="e.g. 7372"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="ee-is-spouse"
              checked={form.is_spouse}
              onCheckedChange={(checked) => onFormChange((f) => ({ ...f, is_spouse: checked }))}
            />
            <Label htmlFor="ee-is-spouse">Spouse</Label>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingEntity ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
