interface InvoicePeriodProps {
  start: string | null | undefined
  end: string | null | undefined
  /** When true, renders with portal style (short start, long end). Defaults to admin style (toLocaleDateString). */
  variant?: 'admin' | 'portal'
}

/**
 * Renders a period/cycle date range.
 * Null/undefined dates render as "Open" (admin) or "-" (portal, only when both are missing).
 */
export function InvoicePeriod({ start, end, variant = 'admin' }: InvoicePeriodProps) {
  if (variant === 'portal') {
    if (!start && !end) {
      return <span className="text-xs text-muted-foreground">-</span>
    }

    const startLabel = start
      ? new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Open'
    const endLabel = end
      ? new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Open'

    return (
      <span className="text-xs text-muted-foreground">
        {startLabel} - {endLabel}
      </span>
    )
  }

  // admin variant
  const fmt = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString() : 'Open'

  return (
    <span className="whitespace-nowrap text-sm">
      {fmt(start)} - {fmt(end)}
    </span>
  )
}
