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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  notification_received_on: string | null
  notification_email_copy: string | null
  class_action_url: string | null
  payment_election_submitted_on: string | null
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

const classActionClaimFormSchema = z.object({
  name: z.string().trim().min(1, 'Class action name is required.').max(255, 'Class action name is too long.'),
  notification_received_on: optionalDateSchema,
  notification_email_copy: z.string(),
  class_action_url: optionalUrlSchema,
  payment_election_submitted_on: optionalDateSchema,
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
type StatusFilter = 'all' | 'needs-election' | 'awaiting-payment' | 'paid'

const emptyForm: ClassActionClaimFormValues = {
  name: '',
  notification_received_on: '',
  notification_email_copy: '',
  class_action_url: '',
  payment_election_submitted_on: '',
  payment_received: false,
  payment_received_on: '',
  payment_fin_transaction_id: '',
  notes: '',
}

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Needs election', value: 'needs-election' },
  { label: 'Awaiting payment', value: 'awaiting-payment' },
  { label: 'Paid', value: 'paid' },
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
    if (!window.confirm(`Delete ${claim.name}?`)) {
      return
    }

    setError(null)

    try {
      await fetchWrapper.delete(`/api/class-action-claims/${claim.id}`, {})
      await loadClaims()
    } catch (err) {
      setError(errorMessage(err, 'Unable to delete class action claim.'))
      console.error(err)
    }
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
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
              <TableHead>Payment Election</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="min-w-64">Notes</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!loading && visibleClaims.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No claims found.
                </TableCell>
              </TableRow>
            )}
            {!loading && visibleClaims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="align-top">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-gray-950 dark:text-gray-50">{claim.name}</span>
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
                    <Button size="sm" variant="destructive" onClick={() => void deleteClaim(claim)} aria-label={`Delete ${claim.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
      {claim.payment_transaction && (
        <a
          href={claim.payment_transaction.url ?? undefined}
          className="inline-flex w-fit items-center gap-1 text-sm text-blue-700 hover:underline dark:text-blue-300"
        >
          {transactionLabel(claim.payment_transaction)}
          <ExternalLink className="size-3.5" />
        </a>
      )}
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

  return true
}

function formFromClaim(claim: ClassActionClaim): ClassActionClaimFormValues {
  return {
    name: claim.name,
    notification_received_on: claim.notification_received_on ?? '',
    notification_email_copy: claim.notification_email_copy ?? '',
    class_action_url: claim.class_action_url ?? '',
    payment_election_submitted_on: claim.payment_election_submitted_on ?? '',
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
    notification_received_on: blankToNull(formValues.notification_received_on),
    notification_email_copy: blankToNull(formValues.notification_email_copy),
    class_action_url: blankToNull(formValues.class_action_url),
    payment_election_submitted_on: blankToNull(formValues.payment_election_submitted_on),
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

function transactionLabel(transaction: PaymentTransaction): string {
  const amount = transaction.amount === null ? null : currency(transaction.amount).format()
  const account = transaction.account_name ?? `Transaction ${transaction.t_id}`
  const date = formatDate(transaction.date)

  return [account, date, amount].filter(Boolean).join(' · ')
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value)

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
