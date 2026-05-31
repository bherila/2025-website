import { Activity } from 'lucide-react'

import ActivityTimeline from '@/client-management/components/shared/activity/ActivityTimeline'
import type { ClientCompany } from '@/client-management/types/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Notes / activity log tab. */
export default function ActivityTab({ company }: { company: ClientCompany }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Notes / Activity log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityTimeline activities={company.activities ?? []} />
      </CardContent>
    </Card>
  )
}
