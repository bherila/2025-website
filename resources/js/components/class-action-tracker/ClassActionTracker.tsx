import currency from 'currency.js'
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportJobData } from '@/genai-processor/types'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'

interface PaymentTransaction {
  t_id: number
  account_id: number | null
  account_name: string | null
  date: string | null
  amount: number | null
  description: string | null
  url: string | null
}

interface ClassActionClaim {
  id: number
  name: string
  claim_id: string | null
  pin: string | null
  administrator: string | null
  defendant: string | null
  notification_received_on: string | null
  notification_email_copy: string | null
  class_action_url: string | null
  payment_election_submitted_on: string | null
  claim_submitted_on: string | null
  claim_deadline: string | null
  final_approval_hearing_on: string | null
  expected_payment_amount: number | null
  expected_payment_on: string | null
  actual_payment_amount: number | null
  payment_received: boolean
  payment_received_on: string | null
  payment_fin_transaction_id: number | null
  payment_transaction: PaymentTransaction | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const optionalDateSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use YYYY-MM-DD.')

const optionalUrlSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidUrl(value), 'Enter a valid URL.')

const moneyInputPattern = /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/

const optionalMoneySchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidMoney(value), 'Use a valid amount.')

const classActionClaimFormSchema = z.object({
  name: z.string().trim().min(1, 'Class action name is required.').max(255, 'Class action name is too long.'),
  claim_id: z.string().trim().max(128, 'Claim ID is too long.'),
  pin: z.string().trim().max(128, 'PIN is too long.'),
  administrator: z.string().trim().max(255, 'Administrator is too long.'),
  defendant: z.string().trim().max(255, 'Defendant is too long.'),
  notification_received_on: optionalDateSchema,
  notification_email_copy: z.string(),
  class_action_url: optionalUrlSchema,
  payment_election_submitted_on: optionalDateSchema,
  claim_submitted_on: optionalDateSchema,
  claim_deadline: optionalDateSchema,
  final_approval_hearing_on: optionalDateSchema,
  expected_payment_amount: optionalMoneySchema,
  expected_payment_on: optionalDateSchema,
  actual_payment_amount: optionalMoneySchema,
  payment_received: z.boolean(),
  payment_received_on: optionalDateSchema,
  payment_fin_transaction_id: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), 'Use the finance transaction ID.'),
  notes: z.string(),
})

type ClassActionClaimFormValues = z.infer<typeof classActionClaimFormSchema>
type FieldErrors = Partial<Record<keyof ClassActionClaimFormValues, string>>
type StatusFilter = 'all' | 'needs-election' | 'awaiting-payment' | 'paid' | 'upcoming-deadlines'
type ImportAction = 'create' | 'merge'

type ImportFieldKey = keyof Pick<ClassActionClaimFormValues,
  | 'name'
  | 'claim_id'
  | 'pin'
  | 'administrator'
  | 'defendant'
  | 'notification_received_on'
  | 'class_action_url'
  | 'claim_submitted_on'
  | 'claim_deadline'
  | 'final_approval_hearing_on'
  | 'payment_election_submitted_on'
  | 'expected_payment_on'
  | 'expected_payment_amount'
  | 'notes'
>

const emptyForm: ClassActionClaimFormValues = {
  name: '',
  claim_id: '',
  pin: '',
  administrator: '',
  defendant: '',
  notification_received_on: '',
  notification_email_copy: '',
  class_action_url: '',
  payment_election_submitted_on: '',
  claim_submitted_on: '',
  claim_deadline: '',
  final_approval_hearing_on: '',
  expected_payment_amount: '',
  expected_payment_on: '',
  actual_payment_amount: '',
  payment_received: false,
  payment_received_on: '',
  payment_fin_transaction_id: '',
  notes: '',
}

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Needs election', value: 'needs-election' },
  { label: 'Upcoming deadlines', value: 'upcoming-deadlines' },
  { label: 'Awaiting payment', value: 'awaiting-payment' },
  { label: 'Paid', value: 'paid' },
]

const importFields: Array<{ field: ImportFieldKey; label: string }> = [
  { field: 'name', label: 'Class Action' },
  { field: 'claim_id', label: 'Claim ID / Unique ID' },
  { field: 'pin', label: 'PIN' },
  { field: 'administrator', label: 'Administrator' },
  { field: 'defendant', label: 'Defendant' },
  { field: 'notification_received_on', label: 'Notification Received On' },
  { field: 'class_action_url', label: 'Class Action URL' },
  { field: 'claim_submitted_on', label: 'Claim Submitted On' },
  { field: 'claim_deadline', label: 'Claim Deadline' },
  { field: 'final_approval_hearing_on', label: 'Final Approval Hearing On' },
  { field: 'payment_election_submitted_on', label: 'Payment Election Submitted On' },
  { field: 'expected_payment_on', label: 'Expected Payment On' },
  { field: 'expected_payment_amount', label: 'Expected Payment Amount' },
  { field: 'notes', label: 'Notes' },
]

function ClassActionTracker(): React.ReactElement {
  const [claims, setClaims] = useState<ClassActionClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ClassActionClaim | null>(null)
  const [form, setForm] = useState<ClassActionClaimFormValues>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importJobId, setImportJobId] = useState<number | null>(null)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<Partial<Record<ImportFieldKey, string>>>({})
  const [reviewUseField, setReviewUseField] = useState<Partial<Record<ImportFieldKey, boolean>>>({})
  const [reviewTarget, setReviewTarget] = useState<ImportAction>('create')
  const [reviewMergeClaimId, setReviewMergeClaimId] = useState<number | null>(null)

  const { status: importJobStatus, results: importJobResults, error: importJobError, job: importJob } = useGenAiJobPolling(importJobId)

  const importInFlight = importJobId !== null
    && (importJobStatus === null
      || importJobStatus === 'pending'
      || importJobStatus === 'processing'
      || importJobStatus === 'queued_tomorrow')

  const importFailed = importJobId !== null && importJobStatus === 'failed'

  const importDeferredMessage = importJob?.scheduled_for
    ? `Your email will be processed on ${importJob.scheduled_for}.`
    : 'Your email is deferred until quota resets.'

  const loadClaims = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetchWrapper.get('/api/class-action-claims') as ClassActionClaim[]
      setClaims(response)
    } catch (err) {
      setError(errorMessage(err, 'Unable to load class action claims.'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClaims()
  }, [loadClaims])

  useEffect(() => {
    let cancelled = false

    async function restoreInFlightJob(): Promise<void> {
      try {
        const response = await fetchWrapper.get('/api/genai/import/jobs?job_type=class_action_email') as { data: GenAiImportJobData[] }
        if (cancelled) {
          return
        }

        const resumable = response.data.find(
          (job) => job.status === 'pending'
            || job.status === 'processing'
            || job.status === 'queued_tomorrow'
            || job.status === 'parsed',
        )
        if (resumable) {
          setImportJobId(resumable.id)
        }
      } catch (err) {
        console.error(err)
      }
    }

    void restoreInFlightJob()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!importJobError) {
      return
    }

    setError(importJobError)
  }, [importJobError])

  useEffect(() => {
    if (!importJobId || importJobStatus !== 'parsed' || importJobResults.length === 0) {
      return
    }

    const firstResult = importJobResults[0]
    if (!firstResult?.result_json) {
      setError('AI import returned an empty result.')
      setImportJobId(null)

      return
    }

    try {
      const parsed = JSON.parse(firstResult.result_json) as Record<string, unknown>
      const fieldDraft = importDraftFromParsedResult(parsed)
      const matchedClaim = findBestImportClaimMatch(claims, fieldDraft)

      const defaultUse: Partial<Record<ImportFieldKey, boolean>> = {}
      for (const { field } of importFields) {
        defaultUse[field] = Boolean(fieldDraft[field] && fieldDraft[field]?.trim() !== '')
      }

      setReviewDraft(fieldDraft)
      setReviewUseField(defaultUse)
      setReviewTarget(matchedClaim ? 'merge' : 'create')
      setReviewMergeClaimId(matchedClaim?.id ?? null)
      setReviewDialogOpen(true)
      setImportDialogOpen(false)
      setImportJobId(null)
    } catch {
      setError('Unable to parse AI import result.')
      setImportJobId(null)
    }
  }, [claims, importJobId, importJobResults, importJobStatus])

  const summary = useMemo(() => {
    return claims.reduce(
      (current, claim) => ({
        total: current.total + 1,
        needsElection: current.needsElection + (claim.payment_election_submitted_on ? 0 : 1),
        awaitingPayment: current.awaitingPayment + (claim.payment_election_submitted_on && !claim.payment_received ? 1 : 0),
        paid: current.paid + (claim.payment_received ? 1 : 0),
      }),
      { total: 0, needsElection: 0, awaitingPayment: 0, paid: 0 },
    )
  }, [claims])

  const visibleClaims = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return claims.filter((claim) => {
      if (!claimMatchesStatus(claim, statusFilter)) {
        return false
      }

      if (normalizedSearch === '') {
        return true
      }

      return [
        claim.name,
        claim.claim_id,
        claim.administrator,
        claim.defendant,
        claim.notes,
        claim.notification_email_copy,
        claim.class_action_url,
        claim.payment_transaction?.description,
        claim.payment_transaction?.account_name,
      ]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [claims, search, statusFilter])

  function openCreateDialog(): void {
    setEditingClaim(null)
    setForm(emptyForm)
    setFieldErrors({})
    setDialogOpen(true)
  }

  function openEditDialog(claim: ClassActionClaim): void {
    setEditingClaim(claim)
    setForm(formFromClaim(claim))
    setFieldErrors({})
    setDialogOpen(true)
  }

  async function saveClaim(): Promise<void> {
    const parsed = classActionClaimFormSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(errorsFromZod(parsed.error))

      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = payloadFromForm(parsed.data)
      if (editingClaim) {
        await fetchWrapper.put(`/api/class-action-claims/${editingClaim.id}`, payload)
      } else {
        await fetchWrapper.post('/api/class-action-claims', payload)
      }

      setDialogOpen(false)
      await loadClaims()
    } catch (err) {
      setError(errorMessage(err, 'Unable to save class action claim.'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteClaim(claim: ClassActionClaim): Promise<void> {
    setError(null)

    try {
      await fetchWrapper.delete(`/api/class-action-claims/${claim.id}`, {})
      await loadClaims()
    } catch (err) {
      setError(errorMessage(err, 'Unable to delete class action claim.'))
      console.error(err)
    }
  }

  async function submitEmailImport(): Promise<void> {
    const text = importText.trim()
    if (text === '') {
      setError('Paste a notification email before importing.')

      return
    }

    setImportSubmitting(true)
    setError(null)

    try {
      const response = await fetchWrapper.post('/api/genai/import/paste', {
        text,
        job_type: 'class_action_email',
      }) as { job_id: number }

      setImportJobId(response.job_id)
    } catch (err) {
      setError(errorMessage(err, 'Unable to start email import.'))
    } finally {
      setImportSubmitting(false)
    }
  }

  function applyReviewSelection(): void {
    const mergeClaim = reviewTarget === 'merge'
      ? claims.find((claim) => claim.id === reviewMergeClaimId) ?? null
      : null

    const nextForm = mergeClaim ? formFromClaim(mergeClaim) : { ...emptyForm }

    for (const { field } of importFields) {
      if (!reviewUseField[field]) {
        continue
      }

      const draftValue = (reviewDraft[field] ?? '').trim()
      nextForm[field] = draftValue
    }

    setEditingClaim(mergeClaim)
    setForm(nextForm)
    setFieldErrors({})
    setReviewDialogOpen(false)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-gray-950 dark:text-gray-50">Class Action Tracker</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void loadClaims()} disabled={loading}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Add Claim
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setImportDialogOpen(true)
              if (!importInFlight) {
                setImportText('')
                setImportJobId(null)
              }
            }}
          >
            Import from email…
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {importInFlight && !importDialogOpen && (
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <Spinner size="small" />
            AI import in progress
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {importJobStatus === 'processing'
                ? 'Extracting claim details from your notification email…'
                : importJobStatus === 'queued_tomorrow'
                  ? importDeferredMessage
                  : 'Queued for AI processing…'}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
              View
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Needs election" value={summary.needsElection} />
        <SummaryCard label="Awaiting payment" value={summary.awaitingPayment} />
        <SummaryCard label="Paid" value={summary.paid} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input
          aria-label="Search class action claims"
          className="max-w-md"
          placeholder="Search claims"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant={statusFilter === filter.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#3E3E3A]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Class Action</TableHead>
              <TableHead>Notification</TableHead>
              <TableHead>Claim Deadline</TableHead>
              <TableHead>Payment Election</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="min-w-64">Notes</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!loading && visibleClaims.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No claims found.
                </TableCell>
              </TableRow>
            )}
            {!loading && visibleClaims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="align-top">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-gray-950 dark:text-gray-50">{claim.name}</span>
                    {claim.claim_id && (
                      <span className="text-xs text-muted-foreground">ID: {claim.claim_id}</span>
                    )}
                    {claim.administrator && (
                      <span className="text-xs text-muted-foreground">Admin: {claim.administrator}</span>
                    )}
                    {claim.class_action_url && (
                      <a
                        href={claim.class_action_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit items-center gap-1 text-sm text-blue-700 hover:underline dark:text-blue-300"
                      >
                        Website
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <DateOrEmpty value={claim.notification_received_on} />
                </TableCell>
                <TableCell className="align-top">
                  <DeadlineCell claim={claim} />
                </TableCell>
                <TableCell className="align-top">
                  {claim.payment_election_submitted_on ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <DateOrEmpty value={claim.payment_election_submitted_on} />
                    </div>
                  ) : (
                    <Badge variant="outline">Not submitted</Badge>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <PaymentCell claim={claim} />
                </TableCell>
                <TableCell className="max-w-sm align-top">
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {claim.notes || claim.notification_email_copy || 'No notes'}
                  </p>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(claim)} aria-label={`Edit ${claim.name}`}>
                      <Edit3 className="size-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" aria-label={`Delete ${claim.name}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{claim.name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className={buttonVariants({ variant: 'destructive' })}
                            onClick={() => void deleteClaim(claim)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from notification email</DialogTitle>
            <DialogDescription>Paste an email and we&apos;ll extract a candidate claim for review.</DialogDescription>
          </DialogHeader>
          {importInFlight ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
              {importJobStatus === 'queued_tomorrow' ? (
                <>
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">Processing deferred</p>
                  <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
                    {importDeferredMessage}
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <Spinner size="small" />
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {importJobStatus === 'processing' ? 'Processing with AI…' : 'Queued for AI processing…'}
                    </span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Your email is being analyzed. You can close this dialog and come back later — we&apos;ll keep processing in the background.
                  </p>
                </>
              )}
            </div>
          ) : importFailed ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
              <p className="mb-2 font-medium text-red-700 dark:text-red-300">AI processing failed</p>
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">
                {importJobError ?? 'Something went wrong while processing your email. Please try again.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setImportJobId(null)
                  setError(null)
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Textarea
              aria-label="Notification email text"
              rows={12}
              className="max-h-[40vh] resize-y overflow-auto"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importSubmitting}>
              {importInFlight ? 'Close' : 'Cancel'}
            </Button>
            {!importInFlight && !importFailed && (
              <Button type="button" onClick={() => void submitEmailImport()} disabled={importSubmitting}>
                {importSubmitting ? 'Submitting…' : 'Extract claim'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review extracted claim details</DialogTitle>
            <DialogDescription>Select fields to apply before saving.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="review-action">Import mode</Label>
              <Select value={reviewTarget} onValueChange={(value) => setReviewTarget(value as ImportAction)}>
                <SelectTrigger id="review-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create new claim</SelectItem>
                  <SelectItem value="merge">Merge into existing claim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reviewTarget === 'merge' && (
              <div>
                <Label htmlFor="review-merge-claim">Existing claim</Label>
                <Select
                  value={reviewMergeClaimId === null ? null : reviewMergeClaimId.toString()}
                  onValueChange={(value) => setReviewMergeClaimId(Number(value))}
                >
                  <SelectTrigger id="review-merge-claim">
                    <SelectValue placeholder="Select claim" />
                  </SelectTrigger>
                  <SelectContent>
                    {claims.map((claim) => (
                      <SelectItem key={claim.id} value={claim.id.toString()}>
                        {claim.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {importFields.map(({ field, label }) => {
              const existingValue = fieldValueForReview(
                reviewTarget === 'merge'
                  ? claims.find((claim) => claim.id === reviewMergeClaimId) ?? null
                  : null,
                field,
              )

              return (
                <div key={field} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.1fr_1fr_1fr_auto] md:items-center">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-sm text-muted-foreground">{existingValue || '—'}</div>
                  <Input
                    value={reviewDraft[field] ?? ''}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, [field]: event.target.value }))}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={reviewUseField[field] === true}
                      onCheckedChange={(checked) => setReviewUseField((current) => ({ ...current, [field]: checked === true }))}
                    />
                    <span className="text-xs text-muted-foreground">Use</span>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={applyReviewSelection}
              disabled={reviewTarget === 'merge' && reviewMergeClaimId === null}
            >
              Apply to form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingClaim ? 'Edit Claim' : 'Add Claim'}</DialogTitle>
            <DialogDescription>Class action notification and payment details.</DialogDescription>
          </DialogHeader>

          <ClaimForm
            fieldErrors={fieldErrors}
            form={form}
            onChange={setForm}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveClaim()} disabled={saving}>
              {saving ? 'Saving...' : 'Save Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  value: number
}

function SummaryCard({ label, value }: SummaryCardProps): React.ReactElement {
  return (
    <Card className="rounded-lg py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="text-2xl font-semibold text-gray-950 dark:text-gray-50">{value}</div>
      </CardContent>
    </Card>
  )
}

interface ClaimFormProps {
  fieldErrors: FieldErrors
  form: ClassActionClaimFormValues
  onChange: React.Dispatch<React.SetStateAction<ClassActionClaimFormValues>>
}

function ClaimForm({ fieldErrors, form, onChange }: ClaimFormProps): React.ReactElement {
  function updateField<K extends keyof ClassActionClaimFormValues>(field: K, value: ClassActionClaimFormValues[K]): void {
    onChange((current) => ({ ...current, [field]: value }))
  }

  function updatePaymentReceived(checked: boolean): void {
    onChange((current) => ({
      ...current,
      payment_received: checked,
      payment_received_on: checked ? current.payment_received_on : '',
      payment_fin_transaction_id: checked ? current.payment_fin_transaction_id : '',
    }))
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="class-action-name">Class Action</Label>
          <Input
            id="class-action-name"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
          />
          <FieldError message={fieldErrors.name} />
        </div>
        <div>
          <Label htmlFor="claim-id">Claim ID / Unique ID</Label>
          <Input
            id="claim-id"
            value={form.claim_id}
            onChange={(event) => updateField('claim_id', event.target.value)}
          />
          <FieldError message={fieldErrors.claim_id} />
        </div>
        <div>
          <Label htmlFor="claim-pin">PIN</Label>
          <Input
            id="claim-pin"
            value={form.pin}
            onChange={(event) => updateField('pin', event.target.value)}
          />
          <FieldError message={fieldErrors.pin} />
        </div>
        <div>
          <Label htmlFor="claim-administrator">Administrator</Label>
          <Input
            id="claim-administrator"
            value={form.administrator}
            onChange={(event) => updateField('administrator', event.target.value)}
          />
          <FieldError message={fieldErrors.administrator} />
        </div>
        <div>
          <Label htmlFor="claim-defendant">Defendant</Label>
          <Input
            id="claim-defendant"
            value={form.defendant}
            onChange={(event) => updateField('defendant', event.target.value)}
          />
          <FieldError message={fieldErrors.defendant} />
        </div>
        <div>
          <Label htmlFor="notification-received-on">Date Notification Received</Label>
          <Input
            id="notification-received-on"
            type="date"
            value={form.notification_received_on}
            onChange={(event) => updateField('notification_received_on', event.target.value)}
          />
          <FieldError message={fieldErrors.notification_received_on} />
        </div>
        <div>
          <Label htmlFor="class-action-url">Class Action WWW URL</Label>
          <Input
            id="class-action-url"
            inputMode="url"
            value={form.class_action_url}
            onChange={(event) => updateField('class_action_url', event.target.value)}
          />
          <FieldError message={fieldErrors.class_action_url} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="notification-email-copy">Copy of Notification Email</Label>
          <Textarea
            id="notification-email-copy"
            rows={6}
            value={form.notification_email_copy}
            onChange={(event) => updateField('notification_email_copy', event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="payment-election-submitted-on">Payment Election Submitted</Label>
          <Input
            id="payment-election-submitted-on"
            type="date"
            value={form.payment_election_submitted_on}
            onChange={(event) => updateField('payment_election_submitted_on', event.target.value)}
          />
          <FieldError message={fieldErrors.payment_election_submitted_on} />
        </div>
        <div>
          <Label htmlFor="claim-submitted-on">Claim Submitted On</Label>
          <Input
            id="claim-submitted-on"
            type="date"
            value={form.claim_submitted_on}
            onChange={(event) => updateField('claim_submitted_on', event.target.value)}
          />
          <FieldError message={fieldErrors.claim_submitted_on} />
        </div>
        <div>
          <Label htmlFor="claim-deadline">Claim Deadline</Label>
          <Input
            id="claim-deadline"
            type="date"
            value={form.claim_deadline}
            onChange={(event) => updateField('claim_deadline', event.target.value)}
          />
          <FieldError message={fieldErrors.claim_deadline} />
        </div>
        <div>
          <Label htmlFor="final-approval-hearing-on">Final Approval Hearing</Label>
          <Input
            id="final-approval-hearing-on"
            type="date"
            value={form.final_approval_hearing_on}
            onChange={(event) => updateField('final_approval_hearing_on', event.target.value)}
          />
          <FieldError message={fieldErrors.final_approval_hearing_on} />
        </div>
        <div>
          <Label htmlFor="expected-payment-on">Expected Payment On</Label>
          <Input
            id="expected-payment-on"
            type="date"
            value={form.expected_payment_on}
            onChange={(event) => updateField('expected_payment_on', event.target.value)}
          />
          <FieldError message={fieldErrors.expected_payment_on} />
        </div>
        <div>
          <Label htmlFor="expected-payment-amount">Expected Payment Amount</Label>
          <Input
            id="expected-payment-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={form.expected_payment_amount}
            onChange={(event) => updateField('expected_payment_amount', event.target.value)}
          />
          <FieldError message={fieldErrors.expected_payment_amount} />
        </div>
        <div className="flex items-end pb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="payment-received"
              checked={form.payment_received}
              onCheckedChange={(checked) => updatePaymentReceived(checked === true)}
            />
            <Label htmlFor="payment-received" className="cursor-pointer">Payment received</Label>
          </div>
        </div>
        {form.payment_received && (
          <>
            <div>
              <Label htmlFor="payment-received-on">Payment Received Date</Label>
              <Input
                id="payment-received-on"
                type="date"
                value={form.payment_received_on}
                onChange={(event) => updateField('payment_received_on', event.target.value)}
              />
              <FieldError message={fieldErrors.payment_received_on} />
            </div>
            <div>
              <Label htmlFor="actual-payment-amount">Actual Payment Amount</Label>
              <Input
                id="actual-payment-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.actual_payment_amount}
                onChange={(event) => updateField('actual_payment_amount', event.target.value)}
              />
              <FieldError message={fieldErrors.actual_payment_amount} />
            </div>
            <div>
              <Label htmlFor="payment-fin-transaction-id">Finance Transaction ID</Label>
              <Input
                id="payment-fin-transaction-id"
                inputMode="numeric"
                value={form.payment_fin_transaction_id}
                onChange={(event) => updateField('payment_fin_transaction_id', event.target.value)}
              />
              <FieldError message={fieldErrors.payment_fin_transaction_id} />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <Label htmlFor="class-action-notes">Additional Notes</Label>
          <Textarea
            id="class-action-notes"
            rows={5}
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

function PaymentCell({ claim }: { claim: ClassActionClaim }): React.ReactElement {
  if (!claim.payment_received) {
    return (
      <div className="flex items-center gap-2">
        <XCircle className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Not received</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <DateOrEmpty value={claim.payment_received_on} />
      </div>
      {claim.actual_payment_amount !== null && (
        <span className="text-sm text-muted-foreground">{currency(claim.actual_payment_amount).format()}</span>
      )}
      {claim.payment_transaction && claim.payment_transaction.url && (
        <a
          href={claim.payment_transaction.url}
          className="inline-flex w-fit items-center gap-1 text-sm text-blue-700 hover:underline dark:text-blue-300"
        >
          {transactionLabel(claim.payment_transaction)}
          <ExternalLink className="size-3.5" />
        </a>
      )}
      {claim.payment_transaction && !claim.payment_transaction.url && (
        <span className="text-sm text-muted-foreground">{transactionLabel(claim.payment_transaction)}</span>
      )}
    </div>
  )
}

function DeadlineCell({ claim }: { claim: ClassActionClaim }): React.ReactElement {
  if (!claim.claim_deadline) {
    return <Badge variant="outline">Not set</Badge>
  }

  const deadline = deadlineState(claim.claim_deadline)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{formatDate(claim.claim_deadline)}</span>
      <Badge variant="outline" className={deadline.className}>
        {deadline.label}
      </Badge>
    </div>
  )
}

function DateOrEmpty({ value }: { value: string | null }): React.ReactElement {
  return <span className="text-sm">{formatDate(value) || 'Not set'}</span>
}

function FieldError({ message }: { message: string | undefined }): React.ReactElement | null {
  if (!message) {
    return null
  }

  return <p className="mt-1 text-sm text-destructive">{message}</p>
}

function claimMatchesStatus(claim: ClassActionClaim, status: StatusFilter): boolean {
  if (status === 'needs-election') {
    return !claim.payment_election_submitted_on
  }

  if (status === 'awaiting-payment') {
    return Boolean(claim.payment_election_submitted_on && !claim.payment_received)
  }

  if (status === 'paid') {
    return claim.payment_received
  }

  if (status === 'upcoming-deadlines') {
    const deadline = deadlineState(claim.claim_deadline)

    return deadline.daysRemaining !== null && deadline.daysRemaining >= 0
  }

  return true
}

function formFromClaim(claim: ClassActionClaim): ClassActionClaimFormValues {
  return {
    name: claim.name,
    claim_id: claim.claim_id ?? '',
    pin: claim.pin ?? '',
    administrator: claim.administrator ?? '',
    defendant: claim.defendant ?? '',
    notification_received_on: claim.notification_received_on ?? '',
    notification_email_copy: claim.notification_email_copy ?? '',
    class_action_url: claim.class_action_url ?? '',
    payment_election_submitted_on: claim.payment_election_submitted_on ?? '',
    claim_submitted_on: claim.claim_submitted_on ?? '',
    claim_deadline: claim.claim_deadline ?? '',
    final_approval_hearing_on: claim.final_approval_hearing_on ?? '',
    expected_payment_amount: claim.expected_payment_amount === null ? '' : currency(claim.expected_payment_amount).value.toFixed(2),
    expected_payment_on: claim.expected_payment_on ?? '',
    actual_payment_amount: claim.actual_payment_amount === null ? '' : currency(claim.actual_payment_amount).value.toFixed(2),
    payment_received: claim.payment_received,
    payment_received_on: claim.payment_received_on ?? '',
    payment_fin_transaction_id: claim.payment_fin_transaction_id?.toString() ?? '',
    notes: claim.notes ?? '',
  }
}

function payloadFromForm(formValues: ClassActionClaimFormValues): Record<string, string | number | boolean | null> {
  const paymentReceived = formValues.payment_received

  return {
    name: formValues.name.trim(),
    claim_id: blankToNull(formValues.claim_id),
    pin: blankToNull(formValues.pin),
    administrator: blankToNull(formValues.administrator),
    defendant: blankToNull(formValues.defendant),
    notification_received_on: blankToNull(formValues.notification_received_on),
    notification_email_copy: blankToNull(formValues.notification_email_copy),
    class_action_url: blankToNull(formValues.class_action_url),
    payment_election_submitted_on: blankToNull(formValues.payment_election_submitted_on),
    claim_submitted_on: blankToNull(formValues.claim_submitted_on),
    claim_deadline: blankToNull(formValues.claim_deadline),
    final_approval_hearing_on: blankToNull(formValues.final_approval_hearing_on),
    expected_payment_amount: moneyToNumber(formValues.expected_payment_amount),
    expected_payment_on: blankToNull(formValues.expected_payment_on),
    actual_payment_amount: paymentReceived ? moneyToNumber(formValues.actual_payment_amount) : null,
    payment_received: paymentReceived,
    payment_received_on: paymentReceived ? blankToNull(formValues.payment_received_on) : null,
    payment_fin_transaction_id: paymentReceived && formValues.payment_fin_transaction_id.trim() !== ''
      ? Number(formValues.payment_fin_transaction_id)
      : null,
    notes: blankToNull(formValues.notes),
  }
}

function errorsFromZod(error: z.ZodError<ClassActionClaimFormValues>): FieldErrors {
  const errors: FieldErrors = {}

  for (const issue of error.issues) {
    const field = issue.path[0]
    if (isClaimFormField(field) && !errors[field]) {
      errors[field] = issue.message
    }
  }

  return errors
}

function isClaimFormField(value: unknown): value is keyof ClassActionClaimFormValues {
  return typeof value === 'string' && value in emptyForm
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : trimmed
}

function formatDate(value: string | null): string {
  if (!value) {
    return ''
  }

  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) {
    return value
  }

  return `${month}/${day}/${year}`
}

function deadlineState(value: string | null): { daysRemaining: number | null; label: string; className: string } {
  if (!value) {
    return { daysRemaining: null, label: 'No deadline', className: '' }
  }

  const parsedDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) {
    return { daysRemaining: null, label: 'Unknown', className: '' }
  }

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysRemaining = Math.floor((parsedDate.getTime() - startOfToday.getTime()) / 86400000)

  if (daysRemaining < 0) {
    return { daysRemaining, label: `${Math.abs(daysRemaining)} days past`, className: 'border-gray-300 text-gray-600' }
  }

  if (daysRemaining <= 3) {
    return { daysRemaining, label: daysRemaining === 0 ? 'Due today' : `${daysRemaining} days left`, className: 'border-red-300 text-red-700' }
  }

  if (daysRemaining <= 14) {
    return { daysRemaining, label: `${daysRemaining} days left`, className: 'border-amber-300 text-amber-700' }
  }

  return { daysRemaining, label: `${daysRemaining} days left`, className: 'border-gray-300 text-gray-700' }
}

function transactionLabel(transaction: PaymentTransaction): string {
  const amount = transaction.amount === null ? null : currency(transaction.amount).format()
  const account = transaction.account_name ?? `Transaction ${transaction.t_id}`
  const date = formatDate(transaction.date)

  return [account, date, amount].filter(Boolean).join(' · ')
}

function moneyToNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }

  return currency(trimmed).value
}

function isValidMoney(value: string): boolean {
  try {
    if (value.trim() === '') {
      return true
    }

    if (!moneyInputPattern.test(value.trim())) {
      return false
    }

    const parsed = currency(value)

    return Number.isFinite(parsed.value) && parsed.value >= 0
  } catch {
    return false
  }
}

function importDraftFromParsedResult(data: Record<string, unknown>): Partial<Record<ImportFieldKey, string>> {
  return {
    name: toDraftString(data.name),
    claim_id: toDraftString(data.claim_id),
    pin: toDraftString(data.pin),
    administrator: toDraftString(data.administrator),
    defendant: toDraftString(data.defendant),
    notification_received_on: toDraftString(data.notification_received_on),
    class_action_url: toDraftString(data.class_action_url),
    claim_submitted_on: toDraftString(data.claim_submitted_on),
    claim_deadline: toDraftString(data.claim_deadline),
    final_approval_hearing_on: toDraftString(data.final_approval_hearing_on),
    payment_election_submitted_on: toDraftString(data.payment_election_submitted_on),
    expected_payment_on: toDraftString(data.expected_payment_on),
    expected_payment_amount: toDraftMoneyString(data.expected_payment_amount),
    notes: toDraftString(data.notes),
  }
}

function findBestImportClaimMatch(
  claims: ClassActionClaim[],
  draft: Partial<Record<ImportFieldKey, string>>,
): ClassActionClaim | null {
  const claimId = draft.claim_id?.trim().toLowerCase()
  if (claimId) {
    const byClaimId = claims.find((claim) => claim.claim_id?.trim().toLowerCase() === claimId)
    if (byClaimId) {
      return byClaimId
    }
  }

  const name = draft.name?.trim().toLowerCase()
  if (name) {
    const byName = claims.find((claim) => claim.name.trim().toLowerCase() === name)
    if (byName) {
      return byName
    }
  }

  return null
}

function fieldValueForReview(claim: ClassActionClaim | null, field: ImportFieldKey): string {
  if (!claim) {
    return ''
  }

  const form = formFromClaim(claim)

  return form[field]
}

function toDraftString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toDraftMoneyString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return currency(value).value.toFixed(2)
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }

  return ''
}

function isValidUrl(value: string): boolean {
  try {
    void new URL(value)

    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error
  }

  return fallback
}

export default ClassActionTracker
