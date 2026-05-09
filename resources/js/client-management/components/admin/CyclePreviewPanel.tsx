import currency from 'currency.js'
import { CalendarDays, Clock, DollarSign } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CadenceBadge } from '@/client-management/components/admin/ClientBadges'
import type { Agreement, ClientCompany } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CyclePreviewPanelProps {
  company: ClientCompany
  agreement: Agreement | null
  onPreviewInvoice?: () => void
}

function cadenceMonths(cadence: string | undefined): number {
  if (cadence === 'annual') return 12
  if (cadence === 'quarterly') return 3
  return 1
}

function currentCycleWindow(agreement: Agreement | null): string {
  if (!agreement) {
    return 'No active cycle'
  }

  const activeDate = new Date(agreement.active_date)
  const cadence = agreement.billing_cadence ?? 'monthly'
  const months = cadenceMonths(cadence)
  const now = new Date()
  let startMonth = now.getMonth()

  if (cadence === 'quarterly') {
    startMonth = Math.floor(now.getMonth() / 3) * 3
  } else if (cadence === 'annual') {
    startMonth = 0
  }

  const start = new Date(now.getFullYear(), startMonth, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + months, 0)
  const clippedStart = start < activeDate ? activeDate : start

  return `${clippedStart.toLocaleDateString()} - ${end.toLocaleDateString()}`
}

export default function CyclePreviewPanel({ company, agreement, onPreviewInvoice }: CyclePreviewPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const monthsInCycle = cadenceMonths(agreement?.billing_cadence)
  const retainerHours = Number(agreement?.monthly_retainer_hours ?? 0) * monthsInCycle
  const retainerFee = currency(agreement?.monthly_retainer_fee ?? 0).multiply(monthsInCycle).value
  const hoursLogged = Number(company.uninvoiced_hours ?? 0)
  const remaining = Math.max(0, retainerHours - hoursLogged)
  const overage = Math.max(0, hoursLogged - retainerHours)
  const projectedOverage = currency(agreement?.hourly_rate ?? 0).multiply(overage).value
  const recurringTotal = useMemo(() => {
    return (agreement?.recurring_items ?? []).reduce((total, item) => total.add(item.amount), currency(0)).value
  }, [agreement?.recurring_items])
  const projectedTotal = currency(retainerFee).add(projectedOverage).add(recurringTotal)

  const openPreview = () => {
    setPreviewOpen(true)
    onPreviewInvoice?.()
  }

  return (
    <>
      <div className="rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Current cycle</h3>
              <CadenceBadge value={agreement?.billing_cadence ?? 'monthly'} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {currentCycleWindow(agreement)}
            </div>
          </div>
          {agreement && (
            <Button variant="outline" size="sm" onClick={openPreview}>
              Preview next invoice
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Hours logged
            </div>
            <div className="mt-1 text-xl font-semibold">{hoursLogged.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-sm text-muted-foreground">Retainer remaining</div>
            <div className="mt-1 text-xl font-semibold">{remaining.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Projected overage
            </div>
            <div className="mt-1 text-xl font-semibold">{currency(projectedOverage).format()}</div>
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview next invoice</DialogTitle>
            <DialogDescription>{currentCycleWindow(agreement)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3 border-b pb-2">
              <span>Retainer ({retainerHours.toFixed(2)} hours)</span>
              <span>{currency(retainerFee).format()}</span>
            </div>
            <div className="flex justify-between gap-3 border-b pb-2">
              <span>Projected overage ({overage.toFixed(2)} hours)</span>
              <span>{currency(projectedOverage).format()}</span>
            </div>
            <div className="flex justify-between gap-3 border-b pb-2">
              <span>Recurring items</span>
              <span>{currency(recurringTotal).format()}</span>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <span>Projected total</span>
              <span>{projectedTotal.format()}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
