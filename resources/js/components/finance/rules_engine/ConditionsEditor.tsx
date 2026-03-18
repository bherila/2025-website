'use client'

import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { FinRuleCondition } from './types'
import { CONDITION_OPERATORS, CONDITION_TYPES } from './types'

interface ConditionsEditorProps {
  conditions: FinRuleCondition[]
  onChange: (conditions: FinRuleCondition[]) => void
}

const VALUE_HIDDEN_CASES: Record<string, string[]> = {
  stock_symbol_presence: ['HAVE', 'DO_NOT_HAVE'],
  option_type: ['ANY'],
}

function isValueHidden(type: string, operator: string): boolean {
  return VALUE_HIDDEN_CASES[type]?.includes(operator) ?? false
}

export function ConditionsEditor({ conditions, onChange }: ConditionsEditorProps) {
  const addCondition = () => {
    onChange([
      ...conditions,
      { type: 'amount', operator: 'ABOVE', value: '', value_extra: null },
    ])
  }

  const updateCondition = (index: number, patch: Partial<FinRuleCondition>) => {
    const updated = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c))
    onChange(updated)
  }

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index))
  }

  const handleTypeChange = (index: number, newType: string) => {
    const operators = CONDITION_OPERATORS[newType] ?? []
    const firstOp = operators[0]?.value ?? ''
    updateCondition(index, {
      type: newType,
      operator: firstOp,
      value: null,
      value_extra: null,
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Conditions</Label>
        <p className="text-xs text-muted-foreground">ALL conditions must match for the rule to apply</p>
      </div>
      {conditions.length === 0 && (
        <p className="text-sm text-muted-foreground">No conditions — rule matches all transactions.</p>
      )}
      {conditions.map((condition, index) => {
        const operators = CONDITION_OPERATORS[condition.type] ?? []
        const hideValue = isValueHidden(condition.type, condition.operator)
        const showExtra = condition.type === 'amount' && condition.operator === 'BETWEEN'

        return (
          <div key={index} className="flex flex-wrap items-end gap-2 rounded-md border border-border/40 p-3">
            <div className="min-w-[150px] flex-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={condition.type} onValueChange={(v) => handleTypeChange(index, v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] flex-1">
              <Label className="text-xs text-muted-foreground">Operator</Label>
              <Select value={condition.operator} onValueChange={(v) => updateCondition(index, { operator: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!hideValue && (
              <div className="min-w-[120px] flex-1">
                <Label className="text-xs text-muted-foreground">Value</Label>
                <Input
                  value={condition.value ?? ''}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder="Value"
                />
              </div>
            )}

            {showExtra && (
              <div className="min-w-[120px] flex-1">
                <Label className="text-xs text-muted-foreground">Upper Bound</Label>
                <Input
                  value={condition.value_extra ?? ''}
                  onChange={(e) => updateCondition(index, { value_extra: e.target.value })}
                  placeholder="Upper bound"
                />
              </div>
            )}

            <Button variant="ghost" size="icon-sm" onClick={() => removeCondition(index)} title="Remove condition">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm" onClick={addCondition}>
        <Plus className="mr-1 h-4 w-4" />
        Add Condition
      </Button>
    </div>
  )
}
