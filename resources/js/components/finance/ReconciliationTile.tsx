import type { LucideIcon } from 'lucide-react'

interface ReconciliationTileProps {
  href: string
  label: string
  count: number
  icon?: LucideIcon
  iconClassName?: string
}

export default function ReconciliationTile({ href, label, count, icon: Icon, iconClassName }: ReconciliationTileProps) {
  return (
    <a className="rounded-md border p-3 hover:bg-accent" href={href}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className={iconClassName ?? 'h-4 w-4'} />}
        {label}
      </div>
      <div className="text-2xl font-semibold">{count}</div>
    </a>
  )
}
