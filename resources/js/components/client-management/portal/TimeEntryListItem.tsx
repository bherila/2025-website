import { Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { useIsUserAdmin } from '@/hooks/useAppInitialData'
import { abbreviateName } from '@/lib/nameUtils'
import type { TimeEntry } from '@/types/client-management/time-entry'

import DisabledEditButton from './DisabledEditButton'

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
              entry.client_invoice ? (
                <a href={`/client/portal/${slug}/invoices/${entry.client_invoice.client_invoice_id}`} className="no-underline">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-green-600 text-green-600 font-bold shrink-0 uppercase hover:bg-green-50">
                    Invoiced
                  </Badge>
                </a>
              ) : (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-green-600 text-green-600 font-bold shrink-0 uppercase">
                  Invoiced
                </Badge>
              )
            ) : (
              <Badge variant={entry.is_billable ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-3.5 font-bold shrink-0">
                {entry.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}
              </Badge>
            )}
            {entry.project && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 font-medium border-muted-foreground/30 text-muted-foreground shrink-0"
              >
                {entry.project.name}
              </Badge>
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
