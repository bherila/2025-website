import currency from 'currency.js'
import { Clock, ListChecks, Receipt, Wallet } from 'lucide-react'

import type { SummaryMetric } from '@/client-management/components/shared/time/MetricGrid'
import type { ClientCompany } from '@/client-management/types/common'

function usd(value: number | null | undefined): string {
  return currency(value ?? 0).format()
}

/** Top-of-overview snapshot tiles. */
export function buildOverviewMetrics(company: ClientCompany): SummaryMetric[] {
  const balanceDue = company.total_balance_due ?? 0

  return [
    {
      key: 'balance_due',
      title: 'Outstanding balance',
      value: usd(balanceDue),
      tone: balanceDue > 0 ? 'red' : 'green',
      icon: Wallet,
      helpText: company.unpaid_invoices?.length
        ? `${company.unpaid_invoices.length} unpaid invoice${company.unpaid_invoices.length === 1 ? '' : 's'}`
        : 'All invoices settled',
    },
    {
      key: 'uninvoiced_hours',
      title: 'Uninvoiced hours',
      value: (company.uninvoiced_hours ?? 0).toFixed(2),
      icon: Clock,
    },
    {
      key: 'uninvoiced_task_total',
      title: 'Uninvoiced task value',
      value: usd(company.uninvoiced_task_total),
      icon: Receipt,
    },
  ]
}

/** Tiles for the Time & Expenses tab. */
export function buildTimeExpenseMetrics(company: ClientCompany): SummaryMetric[] {
  return [
    {
      key: 'uninvoiced_hours',
      title: 'Uninvoiced hours',
      value: (company.uninvoiced_hours ?? 0).toFixed(2),
      icon: Clock,
    },
    {
      key: 'task_complete',
      title: 'Complete task value',
      value: usd(company.uninvoiced_task_complete_total),
      tone: 'green',
      icon: ListChecks,
    },
    {
      key: 'task_incomplete',
      title: 'Incomplete task value',
      value: usd(company.uninvoiced_task_incomplete_total),
      icon: ListChecks,
    },
    {
      key: 'balance_due',
      title: 'Outstanding balance',
      value: usd(company.total_balance_due),
      tone: (company.total_balance_due ?? 0) > 0 ? 'red' : 'green',
      icon: Wallet,
    },
  ]
}
