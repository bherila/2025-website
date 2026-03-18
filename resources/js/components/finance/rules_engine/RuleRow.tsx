'use client'

import { Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { OrderControls } from './OrderControls'
import type { FinRule } from './types'

interface RuleRowProps {
  rule: FinRule
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function RuleRow({ rule, isFirst, isLast, onEdit, onDelete, onMoveUp, onMoveDown }: RuleRowProps) {
  const handleDelete = () => {
    if (window.confirm(`Delete rule "${rule.title}"? This cannot be undone.`)) {
      onDelete()
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <OrderControls isFirst={isFirst} isLast={isLast} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{rule.title}</span>
          {rule.is_disabled ? (
            <Badge variant="secondary">Disabled</Badge>
          ) : (
            <Badge variant="default">Active</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''} ·{' '}
          {rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit rule">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete rule">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
