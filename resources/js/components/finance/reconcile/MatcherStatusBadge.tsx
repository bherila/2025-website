'use client'

import { AlertTriangle, CheckCircle2, Clock3, Loader2, MinusCircle } from 'lucide-react'
import type { ComponentType, ReactElement } from 'react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { LotMatchRun } from '@/types/finance/document-lot-reconciliation'

interface MatcherStatusBadgeProps {
  run: LotMatchRun | null | undefined
  lastMatchedAt?: string | null
}

const STATUS_META = {
  queued: {
    label: 'Queued',
    className: 'border-info/30 bg-info/10 text-info',
    icon: Clock3,
  },
  running: {
    label: 'Running',
    className: 'border-info/30 bg-info/10 text-info',
    icon: Loader2,
  },
  succeeded: {
    label: 'Matched',
    className: 'border-success/30 bg-success/10 text-success',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: AlertTriangle,
  },
  superseded: {
    label: 'Superseded',
    className: 'border-muted-foreground/25 bg-muted text-muted-foreground',
    icon: MinusCircle,
  },
} satisfies Record<LotMatchRun['status'], { label: string; className: string; icon: ComponentType<{ className?: string }> }>

export default function MatcherStatusBadge({ run, lastMatchedAt }: MatcherStatusBadgeProps): ReactElement {
  if (!run) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="border-muted-foreground/25 bg-muted text-muted-foreground">
            <MinusCircle className="h-3 w-3" />
            Never run
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{lastMatchedAt ? `Last matched ${formatDate(lastMatchedAt)}` : 'Matcher has not run for this document.'}</TooltipContent>
      </Tooltip>
    )
  }

  const meta = STATUS_META[run.status]
  const Icon = meta.icon
  const modeLabel = run.mode === 'force' ? 'force' : 'preserve'
  const time = run.finished_at ?? run.started_at ?? run.created_at

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn(meta.className, 'gap-1.5')}>
          <Icon className={cn('h-3 w-3', run.status === 'running' && 'animate-spin')} />
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {meta.label} ({modeLabel}){time ? ` at ${formatDate(time)}` : ''}
        {run.error ? `: ${run.error}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { timeZoneName: 'short' })
}
