import React from 'react'
import type { LucideIcon } from 'lucide-react'

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
  green: 'bg-green-50/50 border-green-100 text-green-700 dark:bg-green-900/10 dark:border-green-800/50 dark:text-green-400',
  blue: 'bg-blue-50/50 border-blue-100 text-blue-700 dark:bg-blue-900/10 dark:border-blue-800/50 dark:text-blue-400',
  red: 'bg-red-50/50 border-red-100 text-red-700 dark:bg-red-900/10 dark:border-red-800/50 dark:text-red-400',
  yellow: 'bg-yellow-50/50 border-yellow-101 text-yellow-700 dark:bg-yellow-900/10 dark:border-yellow-800/50 dark:text-yellow-400'
}

export default function SummaryTile({ title, children, className, kind = 'default', size = 'default', icon: Icon }: SummaryTileProps) {
  const styles = themeStyles[kind]
  const isSmall = size === 'small'

  return (
    <div className={`rounded-lg border transition-colors shadow-sm ${styles} ${isSmall ? 'p-3 rounded-lg shadow-none' : 'p-4 rounded-xl'} ${className ?? ''}`}>
      <div className={`flex items-center gap-2 uppercase tracking-wider font-bold ${isSmall ? 'text-[10px] tracking-tighter' : 'text-xs tracking-wider opacity-90'}`}>
        {Icon && <Icon className={`${isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />}
        {title}
      </div>
      <div className={`font-bold transition-all ${isSmall ? 'text-base mt-0.5' : 'text-3xl mt-2'}`}>
        {children}
      </div>
    </div>
  )
}
