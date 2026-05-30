import { Users } from 'lucide-react'

import { MetricGrid } from '@/client-management/components/shared/time/MetricGrid'
import type { ClientCompany } from '@/client-management/types/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { buildTimeExpenseMetrics } from './companyMetrics'

/** Time & Expenses tab — uninvoiced work and balance snapshot. */
export default function TimeExpensesTab({ company }: { company: ClientCompany }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Time & Expenses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MetricGrid metrics={buildTimeExpenseMetrics(company)} className="grid grid-cols-2 gap-3 md:grid-cols-4" />
      </CardContent>
    </Card>
  )
}
