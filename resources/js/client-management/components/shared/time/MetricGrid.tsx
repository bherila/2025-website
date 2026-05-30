import type { LucideIcon } from 'lucide-react'
import type React from 'react'

import SummaryTile from '@/components/ui/summary-tile'

export type MetricTone = 'default' | 'green' | 'red' | 'blue'

export interface SummaryMetric {
  key: string
  title: string
  value: React.ReactNode
  tone?: MetricTone | undefined
  icon?: LucideIcon | undefined
  helpText?: React.ReactNode
}

interface MetricGridProps {
  metrics: SummaryMetric[]
  className?: string | undefined
}

export function MetricGrid({ metrics, className }: MetricGridProps) {
  return (
    <div className={className ?? 'grid grid-cols-1 md:grid-cols-3 gap-4'}>
      {metrics.map((metric) => {
        const kind = metric.tone && metric.tone !== 'default' ? metric.tone : undefined

        return (
          <SummaryTile
            key={metric.key}
            title={metric.title}
            {...(metric.icon ? { icon: metric.icon } : {})}
            {...(kind ? { kind } : {})}
          >
            {metric.value}
            {metric.helpText}
          </SummaryTile>
        )
      })}
    </div>
  )
}
