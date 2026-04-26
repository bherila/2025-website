import {
  type ActionItemConditionsInput,
  type ActionItemSeverityCounts,
  classifyOutstanding,
  computeActionItemConditions,
  countBySeverity,
} from '@/components/finance/actionItemsLogic'

export type { ActionItemSeverityCounts } from '@/components/finance/actionItemsLogic'

/**
 * Thin wrapper that classifies the same conditions `ActionItemsTab` consumes
 * and returns severity counts for the dock home view's badge.
 */
export function computeActionItemSeverityCounts(input: ActionItemConditionsInput): ActionItemSeverityCounts {
  const conditions = computeActionItemConditions(input)
  return countBySeverity(classifyOutstanding(conditions))
}
