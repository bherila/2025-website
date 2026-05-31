import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type MetricTone = 'balance' | 'hours' | 'tasks' | 'lifetime'

/**
 * Dark-mode-safe colour pairs. The light `*-600` shades fail WCAG AA contrast
 * on the dark card background, so each tone carries an explicit `dark:` variant.
 */
const toneClasses: Record<MetricTone, string> = {
  balance: 'text-amber-600 dark:text-amber-400',
  hours: 'text-blue-600 dark:text-blue-400',
  tasks: 'text-purple-600 dark:text-purple-400',
  lifetime: 'text-emerald-600 dark:text-emerald-400',
}

interface MetricProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  tone: MetricTone
  children?: ReactNode
}

/**
 * A single labeled company metric (icon + text label + value). The text label
 * means colour is never the sole carrier of meaning.
 */
export default function Metric({ icon: Icon, label, value, tone, children }: MetricProps) {
  const color = toneClasses[tone]

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
      {children}
    </div>
  )
}
