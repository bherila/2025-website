import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, RefreshCw } from 'lucide-react'
import * as React from 'react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportResultData } from '@/genai-processor/types'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'

import type { W2JobOption } from './PayslipImportModal'

interface PayslipImportJobCardProps {
  jobId: number
  filename: string
  defaultEmploymentEntityId: number | null
  w2Jobs: W2JobOption[]
  onResultFinalized: () => void
}

interface PayslipDraft {
  period_start: string
  period_end: string
  pay_date: string
  employment_entity_id: string
  earnings_gross: string
  earnings_bonus: string
  earnings_net_pay: string
  earnings_rsu: string
  imp_other: string
  imp_legal: string
  imp_fitness: string
  imp_ltd: string
  ps_oasdi: string
  ps_medicare: string
  ps_fed_tax: string
  ps_fed_tax_addl: string
  ps_401k_pretax: string
  ps_401k_aftertax: string
  ps_401k_employer: string
  ps_pretax_medical: string
  ps_pretax_dental: string
  ps_pretax_vision: string
  ps_pretax_fsa: string
  ps_salary: string
  ps_vacation_payout: string
  ps_comment: string
}

type DraftField = keyof PayslipDraft

interface FieldConfig {
  key: DraftField
  label: string
  type: 'date' | 'number' | 'text'
}

const FIELD_GROUPS: Array<{ title: string; fields: FieldConfig[] }> = [
  {
    title: 'Dates',
    fields: [
      { key: 'period_start', label: 'Period start', type: 'date' },
      { key: 'period_end', label: 'Period end', type: 'date' },
      { key: 'pay_date', label: 'Pay date', type: 'date' },
    ],
  },
  {
    title: 'Earnings',
    fields: [
      { key: 'earnings_gross', label: 'Gross pay', type: 'number' },
      { key: 'earnings_bonus', label: 'Bonus', type: 'number' },
      { key: 'earnings_net_pay', label: 'Net pay', type: 'number' },
      { key: 'earnings_rsu', label: 'RSU', type: 'number' },
      { key: 'ps_salary', label: 'Salary', type: 'number' },
      { key: 'ps_vacation_payout', label: 'Vacation payout', type: 'number' },
    ],
  },
  {
    title: 'Imputed income',
    fields: [
      { key: 'imp_other', label: 'Other', type: 'number' },
      { key: 'imp_legal', label: 'Legal', type: 'number' },
      { key: 'imp_fitness', label: 'Fitness', type: 'number' },
      { key: 'imp_ltd', label: 'LTD', type: 'number' },
    ],
  },
  {
    title: 'Taxes and deductions',
    fields: [
      { key: 'ps_oasdi', label: 'OASDI', type: 'number' },
      { key: 'ps_medicare', label: 'Medicare', type: 'number' },
      { key: 'ps_fed_tax', label: 'Federal tax', type: 'number' },
      { key: 'ps_fed_tax_addl', label: 'Addl federal tax', type: 'number' },
      { key: 'ps_401k_pretax', label: '401(k) pre-tax', type: 'number' },
      { key: 'ps_401k_aftertax', label: '401(k) after-tax', type: 'number' },
      { key: 'ps_401k_employer', label: '401(k) employer', type: 'number' },
      { key: 'ps_pretax_medical', label: 'Medical', type: 'number' },
      { key: 'ps_pretax_dental', label: 'Dental', type: 'number' },
      { key: 'ps_pretax_vision', label: 'Vision', type: 'number' },
      { key: 'ps_pretax_fsa', label: 'FSA', type: 'number' },
    ],
  },
]

const EMPTY_DRAFT: PayslipDraft = {
  period_start: '',
  period_end: '',
  pay_date: '',
  employment_entity_id: '',
  earnings_gross: '',
  earnings_bonus: '',
  earnings_net_pay: '',
  earnings_rsu: '',
  imp_other: '',
  imp_legal: '',
  imp_fitness: '',
  imp_ltd: '',
  ps_oasdi: '',
  ps_medicare: '',
  ps_fed_tax: '',
  ps_fed_tax_addl: '',
  ps_401k_pretax: '',
  ps_401k_aftertax: '',
  ps_401k_employer: '',
  ps_pretax_medical: '',
  ps_pretax_dental: '',
  ps_pretax_vision: '',
  ps_pretax_fsa: '',
  ps_salary: '',
  ps_vacation_payout: '',
  ps_comment: '',
}

function draftFromResult(result: GenAiImportResultData, defaultEmploymentEntityId: number | null): PayslipDraft {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(result.result_json) ?? {}
  } catch {
    parsed = {}
  }

  const getString = (key: DraftField): string => {
    const value = parsed[key]
    if (value === null || value === undefined) return ''
    return String(value)
  }

  const employmentEntityId = parsed.employment_entity_id

  return {
    ...EMPTY_DRAFT,
    period_start: getString('period_start'),
    period_end: getString('period_end'),
    pay_date: getString('pay_date'),
    employment_entity_id: employmentEntityId === null || employmentEntityId === undefined
      ? (defaultEmploymentEntityId ? String(defaultEmploymentEntityId) : '')
      : String(employmentEntityId),
    earnings_gross: getString('earnings_gross'),
    earnings_bonus: getString('earnings_bonus'),
    earnings_net_pay: getString('earnings_net_pay'),
    earnings_rsu: getString('earnings_rsu'),
    imp_other: getString('imp_other'),
    imp_legal: getString('imp_legal'),
    imp_fitness: getString('imp_fitness'),
    imp_ltd: getString('imp_ltd'),
    ps_oasdi: getString('ps_oasdi'),
    ps_medicare: getString('ps_medicare'),
    ps_fed_tax: getString('ps_fed_tax'),
    ps_fed_tax_addl: getString('ps_fed_tax_addl'),
    ps_401k_pretax: getString('ps_401k_pretax'),
    ps_401k_aftertax: getString('ps_401k_aftertax'),
    ps_401k_employer: getString('ps_401k_employer'),
    ps_pretax_medical: getString('ps_pretax_medical'),
    ps_pretax_dental: getString('ps_pretax_dental'),
    ps_pretax_vision: getString('ps_pretax_vision'),
    ps_pretax_fsa: getString('ps_pretax_fsa'),
    ps_salary: getString('ps_salary'),
    ps_vacation_payout: getString('ps_vacation_payout'),
    ps_comment: getString('ps_comment'),
  }
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

export function PayslipImportJobCard({
  jobId,
  filename,
  defaultEmploymentEntityId,
  w2Jobs,
  onResultFinalized,
}: PayslipImportJobCardProps) {
  const { status, results, error, estimatedWait, refetch } = useGenAiJobPolling(jobId)
  const [busyResultId, setBusyResultId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const pendingResults = useMemo(
    () => results.filter((result) => result.status === 'pending_review'),
    [results],
  )

  const confirmResult = async (result: GenAiImportResultData, draft: PayslipDraft) => {
    setBusyResultId(result.id)
    setActionError(null)

    try {
      const body: Record<string, unknown> = {
        period_start: draft.period_start,
        period_end: draft.period_end,
        pay_date: draft.pay_date,
        employment_entity_id: draft.employment_entity_id ? Number(draft.employment_entity_id) : null,
        earnings_gross: toNumberOrNull(draft.earnings_gross),
        earnings_bonus: toNumberOrNull(draft.earnings_bonus),
        earnings_net_pay: toNumberOrNull(draft.earnings_net_pay),
        earnings_rsu: toNumberOrNull(draft.earnings_rsu),
        imp_other: toNumberOrNull(draft.imp_other),
        imp_legal: toNumberOrNull(draft.imp_legal),
        imp_fitness: toNumberOrNull(draft.imp_fitness),
        imp_ltd: toNumberOrNull(draft.imp_ltd),
        ps_oasdi: toNumberOrNull(draft.ps_oasdi),
        ps_medicare: toNumberOrNull(draft.ps_medicare),
        ps_fed_tax: toNumberOrNull(draft.ps_fed_tax),
        ps_fed_tax_addl: toNumberOrNull(draft.ps_fed_tax_addl),
        ps_401k_pretax: toNumberOrNull(draft.ps_401k_pretax),
        ps_401k_aftertax: toNumberOrNull(draft.ps_401k_aftertax),
        ps_401k_employer: toNumberOrNull(draft.ps_401k_employer),
        ps_pretax_medical: toNumberOrNull(draft.ps_pretax_medical),
        ps_pretax_dental: toNumberOrNull(draft.ps_pretax_dental),
        ps_pretax_vision: toNumberOrNull(draft.ps_pretax_vision),
        ps_pretax_fsa: toNumberOrNull(draft.ps_pretax_fsa),
        ps_salary: toNumberOrNull(draft.ps_salary),
        ps_vacation_payout: toNumberOrNull(draft.ps_vacation_payout),
        ps_comment: draft.ps_comment.trim() || null,
      }

      await fetchWrapper.post(`/api/payslips/genai-import/${jobId}/results/${result.id}/confirm`, body)
      refetch()
      onResultFinalized()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to import payslip')
    } finally {
      setBusyResultId(null)
    }
  }

  const skipResult = async (result: GenAiImportResultData) => {
    setBusyResultId(result.id)
    setActionError(null)

    try {
      await fetchWrapper.post(`/api/payslips/genai-import/${jobId}/results/${result.id}/skip`, {})
      refetch()
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
      refetch()
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
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{filename}</span>
        </div>
        <JobStatusBadge status={status} />
      </div>

      {error && (
        <div className="mb-2 flex items-start gap-2 rounded bg-destructive/10 p-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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
          Your file is in the queue. The worker checks once per minute, so parsing usually appears within 1–2 minutes.
        </p>
      )}

      {status === 'parsed' && pendingResults.length === 0 && (
        <p className="text-xs text-muted-foreground">All results have been imported or skipped.</p>
      )}

      {actionError && <p className="mb-2 text-xs text-destructive">{actionError}</p>}

      {pendingResults.map((result) => (
        <PayslipReviewRow
          key={result.id}
          result={result}
          defaultEmploymentEntityId={defaultEmploymentEntityId}
          w2Jobs={w2Jobs}
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
      break
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

interface PayslipReviewRowProps {
  result: GenAiImportResultData
  defaultEmploymentEntityId: number | null
  w2Jobs: W2JobOption[]
  busy: boolean
  onConfirm: (draft: PayslipDraft) => void
  onSkip: () => void
}

function PayslipReviewRow({
  result,
  defaultEmploymentEntityId,
  w2Jobs,
  busy,
  onConfirm,
  onSkip,
}: PayslipReviewRowProps) {
  const [draft, setDraft] = useState<PayslipDraft>(() => draftFromResult(result, defaultEmploymentEntityId))

  const update = (key: DraftField, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="mt-3 space-y-4 rounded border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Parsed payslip #{result.result_index + 1}</p>
        <div className="min-w-[220px] space-y-1">
          <Label className="text-xs text-muted-foreground">W-2 job</Label>
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={draft.employment_entity_id}
            onChange={(event) => update('employment_entity_id', event.target.value)}
            disabled={busy}
          >
            <option value="">No job associated</option>
            {w2Jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {FIELD_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={draft[field.key]}
                type={field.type}
                onChange={(value) => update(field.key, value)}
              />
            ))}
          </div>
        </div>
      ))}

      <Field
        label="Comment"
        value={draft.ps_comment}
        type="text"
        onChange={(value) => update('ps_comment', value)}
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onConfirm(draft)}>
          {busy ? 'Importing…' : 'Confirm import'}
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
      <Input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="h-8" />
    </div>
  )
}
