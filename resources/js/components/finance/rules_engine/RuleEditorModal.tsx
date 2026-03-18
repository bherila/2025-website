'use client'

import { useCallback, useEffect, useState } from 'react'

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
import { fetchWrapper } from '@/fetchWrapper'

import { ActionsEditor } from './ActionsEditor'
import { ConditionsEditor } from './ConditionsEditor'
import type { FinRule, FinRuleAction, FinRuleCondition, RuleFormData } from './types'

interface RuleEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: FinRule | null
  onSaved: () => void
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

export function RuleEditorModal({ open, onOpenChange, rule, onSaved }: RuleEditorModalProps) {
  const [form, setForm] = useState<RuleFormData>(emptyFormData())
  const [runNow, setRunNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          if (window.confirm('Run this rule against all existing transactions now?')) {
            await fetchWrapper.post(`/api/finance/rules/${rule!.id}/run`, {})
          }
        }
      } else {
        await fetchWrapper.post('/api/finance/rules', form)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule.')
    } finally {
      setSaving(false)
    }
  }, [form, isEditing, rule, runNow, onSaved, onOpenChange])

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

          {isEditing && (
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
          )}
        </div>

        <DialogFooter>
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
  )
}
