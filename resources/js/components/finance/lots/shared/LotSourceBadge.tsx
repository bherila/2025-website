import React from 'react'

const SOURCE_LABELS: Record<string, string> = {
  broker_1099b: '1099-B',
  account_derived: 'Account',
  manual: 'Manual',
  synthetic_adjustment: 'Adjustment',
}

const SOURCE_COLORS: Record<string, string> = {
  broker_1099b: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  account_derived: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  manual: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  synthetic_adjustment: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

interface LotSourceBadgeProps {
  source: string | null | undefined
  className?: string
}

export function LotSourceBadge({ source, className = '' }: LotSourceBadgeProps): React.ReactElement | null {
  if (!source) return null
  const label = SOURCE_LABELS[source] ?? source
  const color = SOURCE_COLORS[source] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  )
}
