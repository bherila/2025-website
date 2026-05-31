import { useMemo, useState } from 'react'

import type { ClientCompanyActivity } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'

import { type ActivityTone, formatActivity, type FormattedActivity } from './activityFormatters'

interface ActivityTimelineProps {
  activities: ClientCompanyActivity[]
  emptyMessage?: string
}

const TONE_DOT: Record<ActivityTone, string> = {
  default: 'bg-muted-foreground/40',
  green: 'bg-green-600',
  red: 'bg-destructive',
  blue: 'bg-blue-600',
}

function ActivityRow({ activity }: { activity: FormattedActivity }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[activity.tone]}`} />
          <span className="font-medium">{activity.title}</span>
        </div>
        <div className="text-xs text-muted-foreground">{activity.timestamp}</div>
      </div>
      {activity.subtitle && <div className="mt-1 text-sm">{activity.subtitle}</div>}
      <div className="mt-1 text-sm text-muted-foreground">{activity.actorLabel}</div>
    </div>
  )
}

/**
 * Renders a company's activity log, surfacing meaningful events and tucking
 * low-signal system events behind a toggle.
 */
export default function ActivityTimeline({
  activities,
  emptyMessage = 'No activity has been logged for this company yet.',
}: ActivityTimelineProps) {
  const [showSystem, setShowSystem] = useState(false)

  const { meaningful, system } = useMemo(() => {
    const formatted = activities.map(formatActivity)

    return {
      meaningful: formatted.filter((activity) => !activity.isSystemNoise),
      system: formatted.filter((activity) => activity.isSystemNoise),
    }
  }, [activities])

  if (activities.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {meaningful.length === 0 && !showSystem && (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No notable activity. {system.length} system event{system.length === 1 ? '' : 's'} hidden.
        </div>
      )}

      {meaningful.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} />
      ))}

      {system.length > 0 && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setShowSystem((value) => !value)}>
            {showSystem ? 'Hide' : 'Show'} system activity ({system.length})
          </Button>
          {showSystem && system.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  )
}
