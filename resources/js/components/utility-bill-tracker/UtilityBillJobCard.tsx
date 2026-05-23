import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, RefreshCw } from 'lucide-react'
import * as React from 'react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportResultData } from '@/genai-processor/types'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'

interface UtilityBillJobCardProps {
  jobId: number
  filename: string
  accountId: number
  accountType: 'Electricity' | 'General'
  onResultFinalized: () => void
}

interface BillDraft {
  bill_start_date: string
  bill_end_date: string
  due_date: string
  total_cost: string
  taxes: string
  fees: string
  discounts: string
  credits: string
  payments_received: string
  previous_unpaid_balance: string
  power_consumed_kwh: string
  total_generation_fees: string
  total_delivery_fees: string
  status: 'Paid' | 'Unpaid'
  notes: string
}

const EMPTY_DRAFT: BillDraft = {
  bill_start_date: '',
  bill_end_date: '',
  due_date: '',
  total_cost: '',
  taxes: '',
  fees: '',
  discounts: '',
  credits: '',
  payments_received: '',
  previous_unpaid_balance: '',
  power_consumed_kwh: '',
  total_generation_fees: '',
  total_delivery_fees: '',
  status: 'Unpaid',
  notes: '',
}

function draftFromResult(result: GenAiImportResultData): BillDraft {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(result.result_json) ?? {}
  } catch {
    parsed = {}
  }
  const str = (key: string): string => {
    const value = parsed[key]
    if (value === null || value === undefined) return ''
    return String(value)
  }
  return {
    ...EMPTY_DRAFT,
    bill_start_date: str('bill_start_date'),
    bill_end_date: str('bill_end_date'),
    due_date: str('due_date'),
    total_cost: str('total_cost'),
    taxes: str('taxes'),
    fees: str('fees'),
    discounts: str('discounts'),
    credits: str('credits'),
    payments_received: str('payments_received'),
    previous_unpaid_balance: str('previous_unpaid_balance'),
    power_consumed_kwh: str('power_consumed_kwh'),
    total_generation_fees: str('total_generation_fees'),
    total_delivery_fees: str('total_delivery_fees'),
    status: 'Unpaid',
    notes: str('notes'),
  }
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

export function UtilityBillJobCard({ jobId, filename, accountId, accountType, onResultFinalized }: UtilityBillJobCardProps) {
  const { status, results, error, estimatedWait } = useGenAiJobPolling(jobId)
  const [busyResultId, setBusyResultId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const isElectricity = accountType === 'Electricity'

  const pendingResults = useMemo(
    () => results.filter((r) => r.status === 'pending_review'),
    [results],
  )

  const confirmResult = async (result: GenAiImportResultData, draft: BillDraft) => {
    setBusyResultId(result.id)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {
        bill_start_date: draft.bill_start_date,
        bill_end_date: draft.bill_end_date,
        due_date: draft.due_date,
        total_cost: toNumberOrNull(draft.total_cost) ?? 0,
        status: draft.status,
        notes: draft.notes || null,
        taxes: toNumberOrNull(draft.taxes),
        fees: toNumberOrNull(draft.fees),
        discounts: toNumberOrNull(draft.discounts),
        credits: toNumberOrNull(draft.credits),
        payments_received: toNumberOrNull(draft.payments_received),
        previous_unpaid_balance: toNumberOrNull(draft.previous_unpaid_balance),
      }
      if (isElectricity) {
        body.power_consumed_kwh = toNumberOrNull(draft.power_consumed_kwh)
        body.total_generation_fees = toNumberOrNull(draft.total_generation_fees)
        body.total_delivery_fees = toNumberOrNull(draft.total_delivery_fees)
      }

      await fetchWrapper.post(
        `/api/utility-bill-tracker/accounts/${accountId}/bills/genai-import/${jobId}/results/${result.id}/confirm`,
        body,
      )
      onResultFinalized()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to import bill')
    } finally {
      setBusyResultId(null)
    }
  }

  const skipResult = async (result: GenAiImportResultData) => {
    setBusyResultId(result.id)
    setActionError(null)
    try {
      await fetchWrapper.post(
        `/api/utility-bill-tracker/accounts/${accountId}/bills/genai-import/${jobId}/results/${result.id}/skip`,
        {},
      )
      onResultFinalized()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to skip result')
    } finally {
      setBusyResultId(null)
    }
  }

  const retryJob = async () => {
    setRetrying(true)
    setActionError(null)
    try {
      await fetchWrapper.post(`/api/genai/import/jobs/${jobId}/retry`, {})
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to retry job')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="rounded border p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="truncate font-medium">{filename}</span>
        </div>
        <JobStatusBadge status={status} />
      </div>

      {error && (
        <div className="mb-2 flex items-start gap-2 rounded bg-destructive/10 p-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" disabled={retrying} onClick={retryJob}>
              <RefreshCw className="mr-1 h-3 w-3" />
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </div>
      )}

      {status === 'queued_tomorrow' && (
        <p className="mb-2 text-xs text-amber-700">{estimatedWait ?? 'Quota reached. Job will run when the daily quota resets.'}</p>
      )}

      {(status === 'pending' || status === 'processing') && (
        <p className="mb-2 text-xs text-muted-foreground">
          Your file is in the queue. The worker checks once per minute — typically ready within 1–2 minutes.
        </p>
      )}

      {status === 'parsed' && pendingResults.length === 0 && (
        <p className="text-xs text-muted-foreground">All results have been imported or skipped.</p>
      )}

      {actionError && <p className="mb-2 text-xs text-destructive">{actionError}</p>}

      {pendingResults.map((result) => (
        <BillReviewRow
          key={result.id}
          result={result}
          isElectricity={isElectricity}
          busy={busyResultId === result.id}
          onConfirm={(draft) => confirmResult(result, draft)}
          onSkip={() => skipResult(result)}
        />
      ))}
    </div>
  )
}

function JobStatusBadge({ status }: { status: string | null }) {
  let label = 'Queued'
  let icon: React.ReactNode = <Clock className="h-3 w-3" />
  let cls = 'bg-muted text-muted-foreground'
  switch (status) {
    case 'processing':
      label = 'Parsing'
      icon = <Loader2 className="h-3 w-3 animate-spin" />
      cls = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
      break
    case 'parsed':
      label = 'Ready for review'
      icon = <CheckCircle className="h-3 w-3" />
      cls = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
      break
    case 'imported':
      label = 'Imported'
      icon = <CheckCircle className="h-3 w-3" />
      cls = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
      break
    case 'failed':
      label = 'Failed'
      icon = <AlertTriangle className="h-3 w-3" />
      cls = 'bg-destructive/10 text-destructive'
      break
    case 'queued_tomorrow':
      label = 'Deferred'
      icon = <Clock className="h-3 w-3" />
      cls = 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
      break
    default:
      // initial values already correspond to the pending/queued state
      break
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

interface BillReviewRowProps {
  result: GenAiImportResultData
  isElectricity: boolean
  busy: boolean
  onConfirm: (draft: BillDraft) => void
  onSkip: () => void
}

function BillReviewRow({ result, isElectricity, busy, onConfirm, onSkip }: BillReviewRowProps) {
  const [draft, setDraft] = useState<BillDraft>(() => draftFromResult(result))

  const update = (key: keyof BillDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="mt-3 rounded border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Bill start" value={draft.bill_start_date} type="date" onChange={(v) => update('bill_start_date', v)} />
        <Field label="Bill end" value={draft.bill_end_date} type="date" onChange={(v) => update('bill_end_date', v)} />
        <Field label="Due date" value={draft.due_date} type="date" onChange={(v) => update('due_date', v)} />
        <Field label="Total" value={draft.total_cost} type="number" onChange={(v) => update('total_cost', v)} />
        <Field label="Taxes" value={draft.taxes} type="number" onChange={(v) => update('taxes', v)} />
        <Field label="Fees" value={draft.fees} type="number" onChange={(v) => update('fees', v)} />
        <Field label="Discounts" value={draft.discounts} type="number" onChange={(v) => update('discounts', v)} />
        <Field label="Credits" value={draft.credits} type="number" onChange={(v) => update('credits', v)} />
        <Field label="Payments rec." value={draft.payments_received} type="number" onChange={(v) => update('payments_received', v)} />
        <Field label="Prev unpaid bal." value={draft.previous_unpaid_balance} type="number" onChange={(v) => update('previous_unpaid_balance', v)} />
        {isElectricity && (
          <>
            <Field label="kWh" value={draft.power_consumed_kwh} type="number" onChange={(v) => update('power_consumed_kwh', v)} />
            <Field label="Generation fees" value={draft.total_generation_fees} type="number" onChange={(v) => update('total_generation_fees', v)} />
            <Field label="Delivery fees" value={draft.total_delivery_fees} type="number" onChange={(v) => update('total_delivery_fees', v)} />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onConfirm(draft)}>
          {busy ? 'Importing…' : 'Import bill'}
        </Button>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  type: 'date' | 'number' | 'text'
  onChange: (value: string) => void
}

function Field({ label, value, type, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} type={type} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  )
}
