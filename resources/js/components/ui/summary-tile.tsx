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

  green:
    'bg-success/10 border-success/30 text-success',

  blue:
    'bg-info/10 border-info/30 text-info',

  red:
    'bg-destructive/10 border-destructive/30 text-destructive',

  yellow:
    'bg-warning/10 border-warning/30 text-warning',
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
