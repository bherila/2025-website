import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import SummaryTile from '@/components/ui/summary-tile'

type KpiTileKind = 'default' | 'green' | 'blue' | 'red' | 'yellow'

interface KpiTileProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  kind?: KpiTileKind
  onClick?: () => void
  active?: boolean
}

/**
 * A KPI summary tile. When `onClick` is supplied the tile becomes a real
 * toggle button (keyboard-focusable, `aria-pressed` reflecting `active`);
 * otherwise it renders as a static stat.
 */
export default function KpiTile({ icon, label, value, kind = 'default', onClick, active = false }: KpiTileProps) {
  const tile = (
    <SummaryTile icon={icon} title={label} kind={kind}>
      {value}
    </SummaryTile>
  )

  if (!onClick) {
    return tile
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'ring-2 ring-ring' : 'hover:opacity-90'
      }`}
    >
      {tile}
    </button>
  )
}
