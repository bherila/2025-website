import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, RefreshCw } from 'lucide-react'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportResultData } from '@/genai-processor/types'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'

const optionalPriceSchema = z.string().trim().refine((value) => {
  if (value === '') return true
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0
}, 'Price must be zero or greater')

const RsuAwardDraftSchema = z.object({
  award_id: z.string().trim().min(1, 'Award ID is required').max(20, 'Award ID must be 20 characters or fewer'),
  grant_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Grant date is required'),
  vest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vest date is required'),
  share_count: z.string().trim().refine((value) => {
    if (value === '') return false
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0
  }, 'Shares must be greater than 0'),
  symbol: z.string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().min(1, 'Symbol is required').max(16, 'Symbol must be 16 characters or fewer').regex(/^[A-Z0-9.]+$/, 'Symbol can only contain letters, numbers, and periods')),
  grant_price: optionalPriceSchema,
  vest_price: optionalPriceSchema,
})

type RsuAwardDraft = z.infer<typeof RsuAwardDraftSchema>
type DraftField = keyof RsuAwardDraft

interface RsuImportJobCardProps {
  jobId: number
  filename: string
  onResultFinalized: () => void
}

interface FieldConfig {
  key: DraftField
  label: string
  type: 'date' | 'number' | 'text'
}

const EMPTY_DRAFT: RsuAwardDraft = {
  award_id: '',
  grant_date: '',
  vest_date: '',
  share_count: '',
  symbol: '',
  grant_price: '',
  vest_price: '',
}

const FIELD_GROUPS: Array<{ title: string; fields: FieldConfig[] }> = [
  {
    title: 'Grant',
    fields: [
      { key: 'award_id', label: 'Award ID', type: 'text' },
      { key: 'symbol', label: 'Symbol', type: 'text' },
      { key: 'grant_date', label: 'Grant date', type: 'date' },
    ],
  },
  {
    title: 'Vest',
    fields: [
      { key: 'vest_date', label: 'Vest date', type: 'date' },
      { key: 'share_count', label: 'Shares', type: 'number' },
      { key: 'grant_price', label: 'Grant price', type: 'number' },
      { key: 'vest_price', label: 'Vest price', type: 'number' },
    ],
  },
]

function draftFromResult(result: GenAiImportResultData): RsuAwardDraft {
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

  return {
    ...EMPTY_DRAFT,
    award_id: getString('award_id'),
    grant_date: getString('grant_date'),
    vest_date: getString('vest_date'),
    share_count: getString('share_count'),
    symbol: getString('symbol'),
    grant_price: getString('grant_price'),
    vest_price: getString('vest_price'),
  }
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Review the highlighted fields before importing.'
}

export function RsuImportJobCard({ jobId, filename, onResultFinalized }: RsuImportJobCardProps): React.ReactElement {
  const { status, results, error, estimatedWait, refetch } = useGenAiJobPolling(jobId)
  const [busyResultId, setBusyResultId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const pendingResults = useMemo(
    () => results.filter((result) => result.status === 'pending_review'),
    [results],
  )

  const confirmResult = async (result: GenAiImportResultData, draft: RsuAwardDraft) => {
    const parsed = RsuAwardDraftSchema.safeParse(draft)
    if (!parsed.success) {
      setActionError(firstZodMessage(parsed.error))
      return
    }

    setBusyResultId(result.id)
    setActionError(null)

    try {
      const body = {
        award_id: parsed.data.award_id,
        grant_date: parsed.data.grant_date,
        vest_date: parsed.data.vest_date,
        share_count: Number(parsed.data.share_count),
        symbol: parsed.data.symbol,
        grant_price: toNumberOrNull(parsed.data.grant_price),
        vest_price: toNumberOrNull(parsed.data.vest_price),
      }

      await fetchWrapper.post(`/api/rsu/genai-import/${jobId}/results/${result.id}/confirm`, body)
      refetch()
      onResultFinalized()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to import RSU vest')
    } finally {
      setBusyResultId(null)
    }
  }

  const skipResult = async (result: GenAiImportResultData) => {
    setBusyResultId(result.id)
    setActionError(null)

    try {
      await fetchWrapper.post(`/api/rsu/genai-import/${jobId}/results/${result.id}/skip`, {})
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
              {retrying ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </div>
      )}

      {status === 'queued_tomorrow' && (
        <p className="mb-2 text-xs text-amber-700">{estimatedWait ?? 'Quota reached. Job will run when the daily quota resets.'}</p>
      )}

      {(status === 'pending' || status === 'processing') && (
        <p className="mb-2 text-xs text-muted-foreground">
          Your file is in the queue. The worker checks once per minute, so parsing usually appears within 1-2 minutes.
        </p>
      )}

      {status === 'parsed' && pendingResults.length === 0 && (
        <p className="text-xs text-muted-foreground">All results have been imported or skipped.</p>
      )}

      {actionError && <p className="mb-2 text-xs text-destructive">{actionError}</p>}

      {pendingResults.map((result) => (
        <RsuReviewRow
          key={result.id}
          result={result}
          busy={busyResultId === result.id}
          onConfirm={(draft) => confirmResult(result, draft)}
          onSkip={() => skipResult(result)}
        />
      ))}
    </div>
  )
}

function JobStatusBadge({ status }: { status: string | null }): React.ReactElement {
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

interface RsuReviewRowProps {
  result: GenAiImportResultData
  busy: boolean
  onConfirm: (draft: RsuAwardDraft) => void
  onSkip: () => void
}

function RsuReviewRow({ result, busy, onConfirm, onSkip }: RsuReviewRowProps): React.ReactElement {
  const [draft, setDraft] = useState<RsuAwardDraft>(() => draftFromResult(result))

  const update = (key: DraftField, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [key]: key === 'symbol' ? value.toUpperCase() : value,
    }))
  }

  return (
    <div className="mt-3 rounded border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">{group.title}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  type={field.type}
                  value={draft[field.key]}
                  onChange={(value) => update(field.key, value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onConfirm(draft)}>
          {busy ? 'Importing...' : 'Import vest'}
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

function Field({ label, value, type, onChange }: FieldProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} type={type} step={type === 'number' ? '0.01' : undefined} onChange={(event) => onChange(event.target.value)} className="h-8" />
    </div>
  )
}
