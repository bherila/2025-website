'use client'

import { useCallback, useEffect, useState } from 'react'
import { ListPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'

import { RuleEditorModal } from './RuleEditorModal'
import { RuleRow } from './RuleRow'
import type { FinRule } from './types'

export default function RulesList() {
  const [rules, setRules] = useState<FinRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<FinRule | null>(null)

  const fetchRules = useCallback(async () => {
    try {
      setError(null)
      const res = await fetchWrapper.get('/api/finance/rules')
      const list = res?.data ?? res
      setRules(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleCreate = () => {
    setEditingRule(null)
    setModalOpen(true)
  }

  const handleEdit = (rule: FinRule) => {
    setEditingRule(rule)
    setModalOpen(true)
  }

  const handleDelete = async (rule: FinRule) => {
    try {
      await fetchWrapper.delete(`/api/finance/rules/${rule.id}`, {})
      await fetchRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule.')
    }
  }

  const handleReorder = async (ruleId: number, direction: 'up' | 'down') => {
    try {
      await fetchWrapper.post('/api/finance/rules/reorder', { rule_id: ruleId, direction })
      await fetchRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder rule.')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-12">
        <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transaction Rules</h2>
        <Button onClick={handleCreate}>
          <ListPlus className="mr-2 h-4 w-4" />
          New Rule
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="mb-4 text-muted-foreground">
            No rules yet. Create your first rule to automate transaction processing.
          </p>
          <Button onClick={handleCreate}>
            <ListPlus className="mr-2 h-4 w-4" />
            New Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isFirst={index === 0}
              isLast={index === rules.length - 1}
              onEdit={() => handleEdit(rule)}
              onDelete={() => handleDelete(rule)}
              onMoveUp={() => handleReorder(rule.id, 'up')}
              onMoveDown={() => handleReorder(rule.id, 'down')}
            />
          ))}
        </div>
      )}

      <RuleEditorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        rule={editingRule}
        onSaved={fetchRules}
      />
    </div>
  )
}
