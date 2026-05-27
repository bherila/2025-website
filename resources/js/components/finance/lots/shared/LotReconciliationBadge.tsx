import React from 'react'

const STATE_LABELS: Record<string, string> = {
  auto_matched: 'Auto matched',
  needs_review: 'Needs review',
  accepted_broker: 'Broker accepted',
  accepted_account_override: 'Account override',
  ignored_duplicate: 'Duplicate',
  unlinked: 'Unlinked',
  broker_only: 'Broker-only',
  account_only: 'Account-only',
}

const STATE_COLORS: Record<string, string> = {
  auto_matched: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  needs_review: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  accepted_broker: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted_account_override: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  ignored_duplicate: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  unlinked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  broker_only: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  account_only: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
}

interface LotReconciliationBadgeProps {
  state: string | null | undefined
  className?: string
}

export function LotReconciliationBadge({ state, className = '' }: LotReconciliationBadgeProps): React.ReactElement | null {
  if (!state) return null
  const label = STATE_LABELS[state] ?? state
  const color = STATE_COLORS[state] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  )
}
