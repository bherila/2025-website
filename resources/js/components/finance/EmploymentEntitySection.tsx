'use client'

import { Building2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

interface EmploymentEntity {
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

interface FormData {
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

const TYPE_LABELS: Record<EmploymentEntity['type'], string> = {
  w2: 'W-2',
  sch_c: 'Schedule C',
  hobby: 'Hobby',
}

const emptyForm: FormData = {
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

function formatDate(dateStr: string): string {
  return dateStr.split(/[ T]/)[0] ?? dateStr
}

export default function EmploymentEntitySection() {
  const [entities, setEntities] = useState<EmploymentEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<EmploymentEntity | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<EmploymentEntity | null>(null)
  const [deleting, setDeleting] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)

  const fetchEntities = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchWrapper.get('/api/finance/employment-entities')
      setEntities(Array.isArray(data) ? data : data.data ?? [])
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to load employment entities')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  const openCreate = useCallback(() => {
    setEditingEntity(null)
    setForm(emptyForm)
    setFormError(null)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((entity: EmploymentEntity) => {
    setEditingEntity(entity)
    setForm({
      display_name: entity.display_name,
      type: entity.type,
      start_date: formatDate(entity.start_date),
      is_current: entity.is_current,
      end_date: entity.end_date ? formatDate(entity.end_date) : '',
      ein: entity.ein ?? '',
      address: entity.address ?? '',
      sic_code: entity.sic_code != null ? String(entity.sic_code) : '',
      is_spouse: entity.is_spouse,
    })
    setFormError(null)
    setFormOpen(true)
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingEntity(null)
    setFormError(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.display_name.trim()) {
      setFormError('Display name is required')
      return
    }
    if (!form.start_date) {
      setFormError('Start date is required')
      return
    }
    if (!form.is_current && form.end_date && form.end_date < form.start_date) {
      setFormError('End date must be on or after start date')
      return
    }

    setSaving(true)
    setFormError(null)

    const body = {
      display_name: form.display_name.trim(),
      type: form.type,
      start_date: form.start_date,
      is_current: form.is_current,
      end_date: form.is_current ? null : form.end_date || null,
      ein: form.ein.trim() || null,
      address: form.address.trim() || null,
      sic_code: form.type === 'sch_c' && form.sic_code ? Number(form.sic_code) : null,
      is_spouse: form.is_spouse,
    }

    try {
      if (editingEntity) {
        await fetchWrapper.put(`/api/finance/employment-entities/${editingEntity.id}`, body)
      } else {
        await fetchWrapper.post('/api/finance/employment-entities', body)
      }
      closeForm()
      await fetchEntities()
    } catch (err) {
      setFormError(typeof err === 'string' ? err : 'Failed to save')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [form, editingEntity, closeForm, fetchEntities])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetchWrapper.delete(`/api/finance/employment-entities/${deleteTarget.id}`, {})
      setDeleteTarget(null)
      await fetchEntities()
    } catch (err) {
      console.error('Failed to delete employment entity', err)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchEntities])

  // Keyboard shortcut for save (Ctrl/Cmd+Enter) handled via onKeyDown on Dialog
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !saving) {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave, saving],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Employment and Self-Employment</h2>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No employment entities yet. Add your W-2 jobs, Schedule C businesses, or hobbies.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Start</TableHead>
                <TableHead className="hidden sm:table-cell">End</TableHead>
                {entities.some(e => e.is_spouse) && (
                  <TableHead className="hidden md:table-cell">Spouse</TableHead>
                )}
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell className="font-medium">{entity.display_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[entity.type]}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatDate(entity.start_date)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {entity.is_current ? (
                      <Badge variant="secondary">Current</Badge>
                    ) : entity.end_date ? (
                      formatDate(entity.end_date)
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  {entities.some(e => e.is_spouse) && (
                    <TableCell className="hidden md:table-cell">
                      {entity.is_spouse && <Badge variant="secondary">Spouse</Badge>}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(entity)}
                        aria-label={`Edit ${entity.display_name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(entity)}
                        aria-label={`Delete ${entity.display_name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg" onKeyDown={handleDialogKeyDown}>
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
              handleSave()
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
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
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
                  setForm((f) => ({ ...f, type: val as FormData['type'] }))
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
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
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
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="ee-is-current"
                checked={form.is_current}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, is_current: checked, end_date: checked ? '' : f.end_date }))
                }
              />
              <Label htmlFor="ee-is-current">Currently active</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ee-ein">EIN</Label>
              <Input
                id="ee-ein"
                value={form.ein}
                onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))}
                placeholder="XX-XXXXXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ee-address">Address</Label>
              <textarea
                id="ee-address"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, sic_code: e.target.value }))}
                  placeholder="e.g. 7372"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="ee-is-spouse"
                checked={form.is_spouse}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_spouse: checked }))}
              />
              <Label htmlFor="ee-is-spouse">Spouse</Label>
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingEntity ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employment Entity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.display_name}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
