'use client'

import { Building2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

import EmploymentEntityEditDialog, {
  type EmploymentEntity,
  type EmploymentEntityFormData,
  emptyEmploymentEntityForm,
} from './config/EmploymentEntityEditDialog'

const TYPE_LABELS: Record<EmploymentEntity['type'], string> = {
  w2: 'W-2',
  sch_c: 'Schedule C',
  hobby: 'Hobby',
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
  const [form, setForm] = useState<EmploymentEntityFormData>(emptyEmploymentEntityForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<EmploymentEntity | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    setForm(emptyEmploymentEntityForm)
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

  // Keyboard shortcut for save (Ctrl/Cmd+Enter) is handled inside EmploymentEntityEditDialog

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
      <EmploymentEntityEditDialog
        open={formOpen}
        editingEntity={editingEntity}
        form={form}
        formError={formError}
        saving={saving}
        onClose={closeForm}
        onFormChange={setForm}
        onSave={handleSave}
      />

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
