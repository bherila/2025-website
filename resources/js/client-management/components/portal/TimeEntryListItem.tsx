import { Pencil } from 'lucide-react'

import type { TimeEntry } from '@/client-management/types/time-entry'
import { Button } from '@/components/ui/button'
import {
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { useIsUserAdmin } from '@/hooks/useAppInitialData'
import { abbreviateName } from '@/lib/nameUtils'

import DisabledEditButton from './DisabledEditButton'
import { BillabilityBadge, DeferredBadge, InvoicedBadge, ProjectBadge } from './PortalBadges'

interface TimeEntryListItemProps {
  entry: TimeEntry
  slug: string
  showDate?: boolean
  onEdit?: (entry: TimeEntry) => void
}

export default function TimeEntryListItem({ 
  entry, 
  slug, 
  showDate = true,
  onEdit 
}: TimeEntryListItemProps) {
  const isAdmin = useIsUserAdmin()
  const handleClick = () => {
    if (isAdmin && !entry.is_invoiced && onEdit) {
      onEdit(entry)
    }
  }

  return (
    <TableRow
      className={`group ${isAdmin && !entry.is_invoiced ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
    >
      <TableCell className="py-2 align-top">
        {showDate && (
          <span className="text-sm font-medium">
            {new Date(entry.date_worked).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </TableCell>
      <TableCell className="py-2 align-top">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none mb-1">{entry.job_type}</span>
          <span className="text-sm leading-tight mb-2">{entry.name || '--'}</span>
          <div className="flex items-center gap-2 flex-wrap">
            {entry.is_billable && entry.is_invoiced ? (
              <InvoicedBadge href={entry.client_invoice ? `/client/portal/${slug}/invoices/${entry.client_invoice.client_invoice_id}` : undefined} />
            ) : (
              <BillabilityBadge isBillable={entry.is_billable} />
            )}
            {entry.project && <ProjectBadge name={entry.project.name} />}
            {isAdmin && entry.is_deferred_billing && !entry.is_invoiced && (
              <DeferredBadge title="Deferred: will be billed on a future invoice when retainer capacity is available." />
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2 align-top">
        <span className="text-sm whitespace-nowrap text-muted-foreground">{abbreviateName(entry.user?.name)}</span>
      </TableCell>
      <TableCell className="text-right py-2 align-top text-sm">
        {entry.formatted_time}
      </TableCell>
      {isAdmin && (
        <TableCell className="py-1 align-top text-right">
          {entry.is_invoiced ? (
            <DisabledEditButton />
          ) : (
            onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(entry)
                }}
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            )
          )}
        </TableCell>
      )}
    </TableRow>
  )
}
