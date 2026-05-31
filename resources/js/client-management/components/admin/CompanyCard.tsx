import currency from 'currency.js'
import { AlertCircle, Clock, DollarSign, ExternalLink, Package, Plus, TrendingUp, Wrench } from 'lucide-react'

import { CadenceBadge } from '@/client-management/components/admin/ClientBadges'
import Metric from '@/client-management/components/admin/Metric'
import UnpaidInvoicesList from '@/client-management/components/admin/UnpaidInvoicesList'
import type { ClientCompany } from '@/client-management/types/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

function formatLastActivity(value: string | null | undefined): string {
  if (!value) {
    return 'never'
  }

  return new Date(value).toLocaleDateString()
}

interface CompanyCardProps {
  company: ClientCompany
  onAddUser: (companyId: number) => void
}

/** A single active-company card on the Client Management index. */
export default function CompanyCard({ company, onAddUser }: CompanyCardProps) {
  const stripeOff = company.stripe_billing_enabled === false
  const balanceDue = company.total_balance_due ?? 0
  const uninvoicedHours = company.uninvoiced_hours ?? 0
  const taskTotal = company.uninvoiced_task_total ?? 0
  const completeTotal = company.uninvoiced_task_complete_total ?? 0
  const incompleteTotal = company.uninvoiced_task_incomplete_total ?? 0
  const lifetimeValue = company.lifetime_value ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl">{company.company_name}</CardTitle>
              <CadenceBadge value={company.current_billing_cadence} />
              <Badge
                variant="outline"
                className={stripeOff ? 'border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-400' : 'text-muted-foreground'}
              >
                {stripeOff ? 'Stripe Off' : 'Stripe On'}
              </Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {company.needs_attention && (
                <span className="inline-flex items-center gap-1 font-medium text-warning">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Needs attention
                </span>
              )}
              {company.needs_attention && <span aria-hidden="true">·</span>}
              <span>
                {company.users.length} {company.users.length === 1 ? 'user' : 'users'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Last activity {formatLastActivity(company.last_activity)}</span>
            </div>

            <div className="mt-2 space-y-1">
              {balanceDue > 0 && (
                <Metric icon={DollarSign} tone="balance" label="Balance due" value={currency(balanceDue).format()} />
              )}
              {uninvoicedHours > 0 && (
                <Metric icon={Clock} tone="hours" label="Uninvoiced" value={`${uninvoicedHours.toFixed(2)}h`} />
              )}
              {taskTotal > 0 && (
                <Metric icon={Package} tone="tasks" label="Tasks" value={currency(taskTotal).format()}>
                  {completeTotal > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({currency(completeTotal).format()} complete, {currency(incompleteTotal).format()} incomplete)
                    </span>
                  )}
                </Metric>
              )}
              {lifetimeValue > 0 && (
                <Metric icon={TrendingUp} tone="lifetime" label="Lifetime value" value={currency(lifetimeValue).format()} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button asChild variant="secondary" size="sm">
              <a href={`/client/mgmt/${company.id}`}>
                <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Manage
              </a>
            </Button>
            {company.slug && (
              <Button asChild variant="default" size="sm">
                <a href={`/client/portal/${company.slug}`}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Portal
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {company.current_cycle_progress !== null && company.current_cycle_progress !== undefined && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cycle progress</span>
              <span>{company.current_cycle_progress.toFixed(1)}%</span>
            </div>
            <Progress value={company.current_cycle_progress} />
          </div>
        )}

        <UnpaidInvoicesList invoices={company.unpaid_invoices ?? []} companyId={company.id} />

        <div className="flex flex-wrap items-center gap-2">
          {company.users.map((user) => (
            <Badge key={user.id} variant="secondary" className="py-1">
              <span>{user.name}</span>
              {user.last_login_date ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (last login {new Date(user.last_login_date).toLocaleDateString()})
                </span>
              ) : (
                <span className="ml-1 text-xs font-medium text-amber-600 dark:text-amber-400">(never logged in)</span>
              )}
            </Badge>
          ))}
          <Button variant="outline" size="sm" onClick={() => onAddUser(company.id)} className="h-7">
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add User
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
