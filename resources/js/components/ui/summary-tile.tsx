import type { LucideIcon } from 'lucide-react'
import React from 'react'

type SummaryTileKind = 'default' | 'green' | 'blue' | 'red' | 'yellow'

interface SummaryTileProps {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
  kind?: SummaryTileKind
  size?: 'default' | 'small'
  icon?: LucideIcon
}

const themeStyles: Record<SummaryTileKind, string> = {
  default: 'bg-muted/30 border-border',

  // Option A: darker text colors in light mode
  green:
    'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/10 dark:border-green-800/50 dark:text-green-400',

  blue:
    'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/10 dark:border-blue-800/50 dark:text-blue-400',

  red:
    'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/10 dark:border-red-800/50 dark:text-red-400',

  yellow:
    'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/10 dark:border-yellow-800/50 dark:text-yellow-400'
}

export default function SummaryTile({
  title,
  children,
  className,
  kind = 'default',
  size = 'default',
  icon: Icon
}: SummaryTileProps) {
  const styles = themeStyles[kind]
  const isSmall = size === 'small'

  return (
    <div
      className={`rounded-lg border transition-colors shadow-sm ${styles} ${isSmall ? 'p-3 rounded-lg shadow-none' : 'p-4 rounded-xl'
        } ${className ?? ''}`}
    >
      <div
        className={`flex items-center gap-2 uppercase tracking-wider font-bold ${isSmall ? 'text-[10px] tracking-tighter' : 'text-xs tracking-wider'
          }`}
      >
        {Icon && (
          <Icon className={`${isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
        )}
        {title}
      </div>

      <div
        className={`font-bold transition-all ${isSmall ? 'text-base mt-0.5' : 'text-3xl mt-2'
          }`}
      >
        {children}
      </div>
    </div>
  )
}
