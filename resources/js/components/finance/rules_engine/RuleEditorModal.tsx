'use client'

import { Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
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

import { ActionsEditor } from './ActionsEditor'
import { ConditionsEditor } from './ConditionsEditor'
import type { FinRule, FinRuleAction, FinRuleCondition, RuleFormData } from './types'

interface RuleEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: FinRule | null
  onSaved: () => void
  onDeleted?: () => void
}

interface PreviewTransaction {
  t_id: number
  t_date: string
  t_amt: string
  t_description: string | null
  t_comment: string | null
  t_symbol: string | null
  opt_type: string | null
}

function emptyFormData(): RuleFormData {
  return {
    title: '',
    is_disabled: false,
    stop_processing_if_match: false,
    conditions: [],
    actions: [],
  }
}

export function RuleEditorModal({ open, onOpenChange, rule, onSaved, onDeleted }: RuleEditorModalProps) {
  const [form, setForm] = useState<RuleFormData>(emptyFormData())
  const [runNow, setRunNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewTransaction[] | null>(null)
  const [previewCount, setPreviewCount] = useState<number>(0)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEditing = rule !== null

  useEffect(() => {
    if (open) {
      if (rule) {
        setForm({
          title: rule.title,
          is_disabled: rule.is_disabled,
          stop_processing_if_match: rule.stop_processing_if_match,
          conditions: rule.conditions.map((c) => ({ ...c })),
          actions: rule.actions.map((a) => ({ ...a })),
        })
      } else {
        setForm(emptyFormData())
      }
      setRunNow(false)
      setError(null)
      setPreviewData(null)
      setPreviewCount(0)
      setPreviewModalOpen(false)
      setDeleteConfirmOpen(false)
    }
  }, [open, rule])

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (isEditing) {
        await fetchWrapper.put(`/api/finance/rules/${rule!.id}`, form)
        if (runNow) {
          await fetchWrapper.post(`/api/finance/rules/${rule!.id}/run`, {})
        }
      } else {
        const created = (await fetchWrapper.post('/api/finance/rules', form)) as { data?: FinRule } | FinRule
        if (runNow) {
          const newId = (created as { data?: FinRule })?.data?.id ?? (created as FinRule)?.id
          if (newId) {
            await fetchWrapper.post(`/api/finance/rules/${newId}/run`, {})
          }
        }
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule.')
    } finally {
      setSaving(false)
    }
  }, [form, isEditing, rule, runNow, onSaved, onOpenChange])

  const handleDelete = useCallback(async () => {
    if (!rule) return
    setDeleting(true)
    setError(null)
    try {
      await fetchWrapper.delete(`/api/finance/rules/${rule.id}`, {})
      setDeleteConfirmOpen(false)
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule.')
      setDeleteConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }, [rule, onOpenChange, onDeleted])

  const handlePreview = useCallback(async () => {
    setPreviewing(true)
    setError(null)
    setPreviewData(null)

    try {
      const payload: Record<string, unknown> = isEditing && rule ? { rule_id: rule.id } : { conditions: form.conditions }
      const response = (await fetchWrapper.post('/api/finance/rules/preview-matches', payload)) as {
        success: boolean
        count: number
        transactions: PreviewTransaction[]
      }

      setPreviewCount(response.count)
      setPreviewData(response.transactions)
      setPreviewModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview matches.')
    } finally {
      setPreviewing(false)
    }
  }, [form.conditions, isEditing, rule])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleSave])

  const updateForm = (patch: Partial<RuleFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Rule' : 'New Rule'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the conditions and actions for this rule.'
                : 'Create a new rule to automate transaction processing.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {error && (
              <div className="rounded-md bg-destructive/15 px-4 py-2 text-sm text-destructive">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rule-title">Title</Label>
              <Input
                id="rule-title"
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                placeholder="Rule title"
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="rule-active"
                  checked={!form.is_disabled}
                  onCheckedChange={(checked) => updateForm({ is_disabled: !checked })}
                />
                <Label htmlFor="rule-active">Active</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="rule-stop"
                  checked={form.stop_processing_if_match}
                  onCheckedChange={(checked) => updateForm({ stop_processing_if_match: checked })}
                />
                <Label htmlFor="rule-stop">Stop processing if match</Label>
              </div>
            </div>

            <ConditionsEditor
              conditions={form.conditions}
              onChange={(conditions: FinRuleCondition[]) => updateForm({ conditions })}
            />

            <ActionsEditor
              actions={form.actions}
              onChange={(actions: FinRuleAction[]) => updateForm({ actions })}
            />

            <div className="flex items-center gap-2">
              <input
                id="run-now"
                type="checkbox"
                checked={runNow}
                onChange={(e) => setRunNow(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="run-now">Run this rule now against existing transactions</Label>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {isEditing && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={saving || deleting}
                className="mr-auto"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete Rule
              </Button>
            )}
            <Button variant="outline" onClick={handlePreview} disabled={saving || previewing}>
              {previewing && <Spinner size="small" className="mr-2" />}
              {previewing ? 'Loading…' : 'Preview Matches'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner size="small" className="mr-2" />}
              {saving ? 'Saving…' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview results modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Preview: {previewCount} matching transaction{previewCount !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {previewData && previewData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Symbol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((tx) => (
                  <TableRow key={tx.t_id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{tx.t_date}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-sm">${tx.t_amt}</TableCell>
                    <TableCell className="text-sm">{tx.t_description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{tx.t_symbol}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No matching transactions found.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the rule &ldquo;{rule?.title}&rdquo;? This action cannot be undone and
              deleted rules cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete Rule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
