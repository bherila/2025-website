'use client'

import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { FinRuleAction } from './types'
import { ACTION_TYPES } from './types'

interface ActionsEditorProps {
  actions: FinRuleAction[]
  onChange: (actions: FinRuleAction[]) => void
}

interface ActionFieldConfig {
  targetLabel?: string
  targetPlaceholder?: string
  payloadLabel?: string
  payloadPlaceholder?: string
  showTarget: boolean
  showPayload: boolean
}

function getFieldConfig(type: string): ActionFieldConfig {
  switch (type) {
    case 'add_tag':
    case 'remove_tag':
      return { targetLabel: 'Tag ID', targetPlaceholder: 'Tag ID', showTarget: true, showPayload: false }
    case 'find_replace':
      return {
        targetLabel: 'Search',
        targetPlaceholder: 'Find text',
        payloadLabel: 'Replace',
        payloadPlaceholder: 'Replace with',
        showTarget: true,
        showPayload: true,
      }
    case 'set_description':
      return { targetLabel: 'Description', targetPlaceholder: 'New description', showTarget: true, showPayload: false }
    case 'set_memo':
      return { targetLabel: 'Memo', targetPlaceholder: 'New memo', showTarget: true, showPayload: false }
    case 'remove_all_tags':
    case 'negate_amount':
    case 'stop_processing_if_match':
      return { showTarget: false, showPayload: false }
    default:
      return { targetLabel: 'Target', targetPlaceholder: 'Target', showTarget: true, showPayload: false }
  }
}

export function ActionsEditor({ actions, onChange }: ActionsEditorProps) {
  const addAction = () => {
    onChange([
      ...actions,
      { type: 'add_tag', target: '', payload: null, order: actions.length },
    ])
  }

  const updateAction = (index: number, patch: Partial<FinRuleAction>) => {
    const updated = actions.map((a, i) => (i === index ? { ...a, ...patch } : a))
    onChange(updated)
  }

  const removeAction = (index: number) => {
    const updated = actions.filter((_, i) => i !== index).map((a, i) => ({ ...a, order: i }))
    onChange(updated)
  }

  const handleTypeChange = (index: number, newType: string) => {
    updateAction(index, { type: newType, target: null, payload: null })
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Actions</Label>
      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">No actions configured.</p>
      )}
      {actions.map((action, index) => {
        const config = getFieldConfig(action.type)

        return (
          <div key={index} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={action.type} onValueChange={(v) => handleTypeChange(index, v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>
                      {at.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {config.showTarget && (
              <div className="min-w-[140px] flex-1">
                <Label className="text-xs text-muted-foreground">{config.targetLabel}</Label>
                <Input
                  value={action.target ?? ''}
                  onChange={(e) => updateAction(index, { target: e.target.value })}
                  placeholder={config.targetPlaceholder}
                />
              </div>
            )}

            {config.showPayload && (
              <div className="min-w-[140px] flex-1">
                <Label className="text-xs text-muted-foreground">{config.payloadLabel}</Label>
                <Input
                  value={action.payload ?? ''}
                  onChange={(e) => updateAction(index, { payload: e.target.value })}
                  placeholder={config.payloadPlaceholder}
                />
              </div>
            )}

            <Button variant="ghost" size="icon-sm" onClick={() => removeAction(index)} title="Remove action">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm" onClick={addAction}>
        <Plus className="mr-1 h-4 w-4" />
        Add Action
      </Button>
    </div>
  )
}
