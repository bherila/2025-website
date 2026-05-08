import { useEffect, useMemo, useState } from 'react'

import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import DateInput from '@/client-management/components/admin/DateInput'
import type { Agreement } from '@/client-management/types/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

interface TransitionPreview {
  effective_date: string
  outgoing_termination_date: string
  carried_rollover_hours: number
  recurring_items_affected: number
  successor_terms: {
    billing_cadence: 'monthly' | 'quarterly' | 'annual'
    monthly_retainer_hours: string | number
    monthly_retainer_fee: string | number
    hourly_rate: string | number
    rollover_months: string | number
    catch_up_threshold_hours: string | number
    bill_overage_interim: boolean
    first_cycle_proration: string
  }
}

interface CadenceTransitionModalProps {
  companyId: number
  agreement: Agreement
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (successorAgreementId: number) => void
}

function tomorrow(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)

  return date.toISOString().slice(0, 10)
}

export default function CadenceTransitionModal({
  companyId,
  agreement,
  open,
  onOpenChange,
  onSuccess,
}: CadenceTransitionModalProps) {
  const [step, setStep] = useState(1)
  const [effectiveDate, setEffectiveDate] = useState(tomorrow())
  const [billingCadence, setBillingCadence] = useState<'monthly' | 'quarterly' | 'annual'>(agreement.billing_cadence ?? 'monthly')
  const [monthlyRetainerHours, setMonthlyRetainerHours] = useState(Number(agreement.monthly_retainer_hours ?? 0))
  const [monthlyRetainerFee, setMonthlyRetainerFee] = useState(Number(agreement.monthly_retainer_fee ?? 0))
  const [hourlyRate, setHourlyRate] = useState(Number(agreement.hourly_rate ?? 0))
  const [rolloverMonths, setRolloverMonths] = useState(Number(agreement.rollover_months ?? 0))
  const [catchUpThresholdHours, setCatchUpThresholdHours] = useState(Number(agreement.catch_up_threshold_hours ?? 0))
  const [billOverageInterim, setBillOverageInterim] = useState(Boolean(agreement.bill_overage_interim))
  const [firstCycleProration, setFirstCycleProration] = useState(agreement.first_cycle_proration ?? 'prorate_hours')
  const [carryRollover, setCarryRollover] = useState(true)
  const [recurringItemHandling, setRecurringItemHandling] = useState<'clone' | 'migrate' | 'drop'>('clone')
  const [preview, setPreview] = useState<TransitionPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const payload = useMemo(() => ({
    effective_date: effectiveDate,
    billing_cadence: billingCadence,
    monthly_retainer_hours: monthlyRetainerHours,
    monthly_retainer_fee: monthlyRetainerFee,
    hourly_rate: hourlyRate,
    rollover_months: rolloverMonths,
    catch_up_threshold_hours: catchUpThresholdHours,
    bill_overage_interim: billOverageInterim,
    first_cycle_proration: firstCycleProration,
    carry_rollover: carryRollover,
    recurring_item_handling: recurringItemHandling,
  }), [
    billOverageInterim,
    billingCadence,
    carryRollover,
    catchUpThresholdHours,
    effectiveDate,
    firstCycleProration,
    hourlyRate,
    monthlyRetainerFee,
    monthlyRetainerHours,
    recurringItemHandling,
    rolloverMonths,
  ])

  useEffect(() => {
    if (!open || !effectiveDate) {
      return
    }

    const controller = new AbortController()

    const loadPreview = async () => {
      setError(null)
      try {
        const data = await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/agreements/${agreement.id}/transition/preview`, payload)
        setPreview((data as { preview: TransitionPreview }).preview)
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreview(null)
          setError(error instanceof Error ? error.message : String(error))
        }
      }
    }

    void loadPreview()

    return () => controller.abort()
  }, [
    agreement.id,
    companyId,
    effectiveDate,
    open,
    payload,
  ])

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const data = await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/agreements/${agreement.id}/transition`, payload)
      const successor = (data as { successor_agreement: { id: number } }).successor_agreement
      onOpenChange(false)
      onSuccess(successor.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change cadence</DialogTitle>
          <DialogDescription>Terminate this agreement and create a successor agreement.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((item) => (
              <Button
                key={item}
                size="sm"
                variant={step === item ? 'default' : 'outline'}
                onClick={() => setStep(item)}
              >
                {item}
              </Button>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <Label htmlFor="transition-effective-date">Effective date</Label>
              <DateInput id="transition-effective-date" value={effectiveDate} onValueChange={setEffectiveDate} />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cadence</Label>
                <Select value={billingCadence} onValueChange={(value) => setBillingCadence(value as typeof billingCadence)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition-hours">Retainer hours</Label>
                <Input id="transition-hours" type="number" value={monthlyRetainerHours} onChange={(event) => setMonthlyRetainerHours(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition-fee">Retainer fee</Label>
                <CurrencyInput id="transition-fee" value={monthlyRetainerFee} onValueChange={setMonthlyRetainerFee} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition-rate">Hourly rate</Label>
                <CurrencyInput id="transition-rate" value={hourlyRate} onValueChange={setHourlyRate} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition-rollover">Rollover months</Label>
                <Input id="transition-rollover" type="number" value={rolloverMonths} onChange={(event) => setRolloverMonths(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transition-threshold">Catch-up threshold</Label>
                <Input id="transition-threshold" type="number" value={catchUpThresholdHours} onChange={(event) => setCatchUpThresholdHours(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>First cycle</Label>
                <Select value={firstCycleProration} onValueChange={(value) => setFirstCycleProration(value as typeof firstCycleProration)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prorate_hours">Prorate hours</SelectItem>
                    <SelectItem value="full_period">Full period</SelectItem>
                    <SelectItem value="align_next_cycle">Align next cycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <Checkbox checked={billOverageInterim} disabled={billingCadence === 'monthly'} onCheckedChange={(checked) => setBillOverageInterim(Boolean(checked))} />
                Bill overage interim
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={carryRollover} onCheckedChange={(checked) => setCarryRollover(Boolean(checked))} />
                Carry rollover into successor
              </label>
              <div className="space-y-2">
                <Label>Recurring items</Label>
                <Select value={recurringItemHandling} onValueChange={(value) => setRecurringItemHandling(value as typeof recurringItemHandling)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clone">Clone active items</SelectItem>
                    <SelectItem value="migrate">Migrate active items</SelectItem>
                    <SelectItem value="drop">Drop active items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {preview && (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  Outgoing closes {preview.outgoing_termination_date}. Successor starts {preview.effective_date} with {preview.carried_rollover_hours.toFixed(2)} carried hours and {preview.recurring_items_affected} recurring item{preview.recurring_items_affected === 1 ? '' : 's'} considered.
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="rounded-md border p-4 text-sm">
              {preview ? (
                <div className="space-y-2">
                  <div><strong>Effective:</strong> {preview.effective_date}</div>
                  <div><strong>Successor cadence:</strong> {preview.successor_terms.billing_cadence}</div>
                  <div><strong>Carry rollover:</strong> {preview.carried_rollover_hours.toFixed(2)} hours</div>
                </div>
              ) : (
                <span className="text-muted-foreground">Preview is not available yet.</span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button onClick={() => void confirm()} disabled={saving || !preview}>Confirm transition</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
