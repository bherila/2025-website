import currency from 'currency.js'
import { AlertCircle, ArrowLeft, Check, ClipboardList, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ProposalStatusBadge } from '@/client-management/components/admin/ClientBadges'
import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import ProposalItemsEditor, {
  type EditableItem,
} from '@/client-management/components/admin/proposal/ProposalItemsEditor'
import ProposalMarkdown from '@/client-management/components/shared/proposal/ProposalMarkdown'
import type { Proposal } from '@/client-management/types/proposal'
import { ProposalSchema, RETAINER_INTERVALS } from '@/client-management/types/proposal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

interface ProposalBuilderPageProps {
  proposalId: number
  companyId: number
  companyName: string
}

interface FormState {
  title: string
  body_markdown: string
  base_amount: string
  base_description: string
  credit_amount: string
  credit_label: string
  payment_net_days: number
  estimated_completion_days: string
  has_retainer: boolean
  retainer_amount: string
  retainer_interval_months: number
  retainer_included_hours: string
  retainer_hourly_rate: string
  retainer_description: string
}

function toEditableItems(proposal: Proposal): EditableItem[] {
  return proposal.items.map((item, index) => ({
    key: `existing-${item.id ?? index}`,
    id: item.id,
    kind: item.kind,
    description: item.description,
    amount: item.amount ?? '',
    charge_cadence: item.charge_cadence,
    is_optional: item.is_optional,
  }))
}

function toFormState(proposal: Proposal): FormState {
  return {
    title: proposal.title,
    body_markdown: proposal.body_markdown ?? '',
    base_amount: proposal.base_amount,
    base_description: proposal.base_description ?? '',
    credit_amount: proposal.credit_amount ?? '',
    credit_label: proposal.credit_label ?? '',
    payment_net_days: proposal.payment_net_days,
    estimated_completion_days: proposal.estimated_completion_days?.toString() ?? '',
    has_retainer: Boolean(proposal.retainer_interval_months),
    retainer_amount: proposal.retainer_amount ?? '',
    retainer_interval_months: proposal.retainer_interval_months ?? 6,
    retainer_included_hours: proposal.retainer_included_hours ?? '',
    retainer_hourly_rate: proposal.retainer_hourly_rate ?? '',
    retainer_description: proposal.retainer_description ?? '',
  }
}

export default function ProposalBuilderPage({ proposalId, companyId, companyName }: ProposalBuilderPageProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [items, setItems] = useState<EditableItem[]>([])

  const applyProposal = useCallback((data: unknown) => {
    const parsed = ProposalSchema.parse(data)
    setProposal(parsed)
    setForm(toFormState(parsed))
    setItems(toEditableItems(parsed))
  }, [])

  const fetchProposal = useCallback(async () => {
    try {
      const data = await fetchWrapper.get(`/api/client/mgmt/proposals/${proposalId}`)
      applyProposal(data)
    } catch (err) {
      console.error('Error fetching proposal:', err)
      setError('Failed to load proposal')
    } finally {
      setLoading(false)
    }
  }, [proposalId, applyProposal])

  useEffect(() => {
    void fetchProposal()
  }, [fetchProposal])

  const isEditable = proposal?.status === 'draft'

  const buildPayload = useCallback(() => {
    if (!form) {
      return {}
    }
    return {
      title: form.title,
      body_markdown: form.body_markdown || null,
      base_amount: currency(form.base_amount).value,
      base_description: form.base_description || null,
      credit_amount: form.credit_amount ? currency(form.credit_amount).value : null,
      credit_label: form.credit_label || null,
      payment_net_days: form.payment_net_days,
      estimated_completion_days: form.estimated_completion_days
        ? parseInt(form.estimated_completion_days, 10)
        : null,
      retainer_amount: form.has_retainer ? currency(form.retainer_amount).value : null,
      retainer_interval_months: form.has_retainer ? form.retainer_interval_months : null,
      retainer_included_hours: form.has_retainer && form.retainer_included_hours
        ? Number(form.retainer_included_hours)
        : null,
      retainer_hourly_rate: form.has_retainer && form.retainer_hourly_rate
        ? currency(form.retainer_hourly_rate).value
        : null,
      retainer_description: form.has_retainer ? form.retainer_description || null : null,
      items: items.map((item, index) => ({
        ...(item.id ? { id: item.id } : {}),
        kind: item.kind,
        description: item.description,
        amount: item.kind === 'add_on' && item.amount !== '' ? currency(item.amount).value : null,
        charge_cadence: item.charge_cadence,
        is_optional: item.is_optional,
        sort_order: index,
      })),
    }
  }, [form, items])

  const handleSave = useCallback(async () => {
    if (!form || !isEditable) {
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await fetchWrapper.put(`/api/client/mgmt/proposals/${proposalId}`, buildPayload())
      applyProposal(data.proposal)
      setSuccess('Proposal saved')
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [form, isEditable, proposalId, buildPayload, applyProposal])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  const handleSend = async () => {
    setSaving(true)
    setError(null)
    try {
      await fetchWrapper.put(`/api/client/mgmt/proposals/${proposalId}`, buildPayload())
      const data = await fetchWrapper.post(`/api/client/mgmt/proposals/${proposalId}/send`, {})
      applyProposal(data.proposal)
      setSuccess('Proposal sent to client')
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleRevision = async () => {
    setSaving(true)
    setError(null)
    try {
      const data = await fetchWrapper.post(`/api/client/mgmt/proposals/${proposalId}/revisions`, {})
      window.location.href = `/client/mgmt/proposal/${data.proposal.id}`
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await fetchWrapper.delete(`/api/client/mgmt/proposals/${proposalId}`, {})
      window.location.href = `/client/mgmt/${companyId}#proposals`
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err))
    }
  }

  const maxNet = useMemo(() => {
    if (!form) {
      return 0
    }
    let total = currency(form.base_amount || 0)
    for (const item of items) {
      if (item.kind === 'add_on' && item.charge_cadence === 'one_time' && item.amount) {
        total = total.add(item.amount)
      }
    }
    return total.subtract(form.credit_amount || 0).value
  }, [form, items])

  if (loading || !proposal || !form) {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Skeleton className="mb-4 h-10 w-32" />
        <Skeleton className="mb-6 h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const hasResponse = ['accepted', 'rejected', 'changes_requested'].includes(proposal.status)

  return (
    <div className="container mx-auto max-w-4xl p-8">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => (window.location.href = `/client/mgmt/${companyId}#proposals`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to {companyName}
      </Button>

      <div className="mb-6 flex items-center gap-4">
        <ClipboardList className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">{proposal.title}</h1>
          <p className="text-muted-foreground">{companyName}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="outline">v{proposal.version}</Badge>
          <ProposalStatusBadge value={proposal.status} />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      {hasResponse && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Client Response</CardTitle>
            <CardDescription>
              {proposal.status === 'accepted'
                ? 'This proposal was accepted and has materialized an agreement.'
                : proposal.status === 'rejected'
                  ? 'The client rejected this proposal.'
                  : 'The client requested changes.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {proposal.status === 'accepted' ? (
              <>
                <p>
                  <strong>Signed by:</strong> {proposal.accept_signature_name} ({proposal.accept_signature_title})
                </p>
                {proposal.agreement_id && (
                  <p>
                    <a className="text-primary underline" href={`/client/mgmt/agreement/${proposal.agreement_id}`}>
                      View agreement
                    </a>
                  </p>
                )}
              </>
            ) : (
              <>
                {(proposal.response_name || proposal.response_title) && (
                  <p>
                    <strong>From:</strong> {proposal.response_name} {proposal.response_title ? `(${proposal.response_title})` : ''}
                  </p>
                )}
                {proposal.client_response_message && (
                  <blockquote className="border-l-2 pl-3 text-muted-foreground">
                    {proposal.client_response_message}
                  </blockquote>
                )}
              </>
            )}
          </CardContent>
          {proposal.status !== 'accepted' && (
            <CardFooter>
              <Button onClick={() => void handleRevision()} disabled={saving}>
                Create Revision
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Upfront Total</CardTitle>
            <CardDescription>Maximum if the client opts into every optional add-on.</CardDescription>
          </div>
          <div className="text-2xl font-bold">{currency(maxNet).format()}</div>
        </CardHeader>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Proposal Content</CardTitle>
          <CardDescription>
            {isEditable ? 'Author the proposal, then send it to the client.' : 'This proposal is locked (already sent).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={!isEditable}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body_markdown">Narrative (Markdown)</Label>
            <Textarea
              id="body_markdown"
              value={form.body_markdown}
              onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
              rows={10}
              disabled={!isEditable}
              placeholder="Describe the work, scope, and terms…"
            />
            {form.body_markdown && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs uppercase text-muted-foreground">Preview</p>
                <ProposalMarkdown>{form.body_markdown}</ProposalMarkdown>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_amount">Base Fee ($)</Label>
              <CurrencyInput
                id="base_amount"
                value={form.base_amount}
                onValueChange={(value) => setForm({ ...form, base_amount: String(value) })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_description">Base Description</Label>
              <Input
                id="base_description"
                value={form.base_description}
                onChange={(e) => setForm({ ...form, base_description: e.target.value })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit_amount">Credit ($)</Label>
              <CurrencyInput
                id="credit_amount"
                value={form.credit_amount}
                onValueChange={(value) => setForm({ ...form, credit_amount: String(value) })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit_label">Credit Label</Label>
              <Input
                id="credit_label"
                value={form.credit_label}
                onChange={(e) => setForm({ ...form, credit_label: e.target.value })}
                disabled={!isEditable}
                placeholder="e.g. Less retainer already paid"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_net_days">Payment Net Days</Label>
              <Input
                id="payment_net_days"
                type="number"
                min="0"
                value={form.payment_net_days}
                onChange={(e) => setForm({ ...form, payment_net_days: parseInt(e.target.value, 10) || 0 })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_completion_days">Estimated Completion (days)</Label>
              <Input
                id="estimated_completion_days"
                type="number"
                min="0"
                value={form.estimated_completion_days}
                onChange={(e) => setForm({ ...form, estimated_completion_days: e.target.value })}
                disabled={!isEditable}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ongoing Retainer</CardTitle>
          <CardDescription>
            Billed on the 1st of the month following acceptance. The client cannot opt out of the retainer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="has_retainer"
              checked={form.has_retainer}
              onCheckedChange={(checked) => setForm({ ...form, has_retainer: Boolean(checked) })}
              disabled={!isEditable}
            />
            <Label htmlFor="has_retainer" className="font-normal">
              This proposal includes a retainer
            </Label>
          </div>

          {form.has_retainer && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retainer_amount">Retainer Fee per Interval ($)</Label>
                <CurrencyInput
                  id="retainer_amount"
                  value={form.retainer_amount}
                  onValueChange={(value) => setForm({ ...form, retainer_amount: String(value) })}
                  disabled={!isEditable}
                />
              </div>
              <div className="space-y-2">
                <Label>Interval (months)</Label>
                <Select
                  value={String(form.retainer_interval_months)}
                  onValueChange={(value) => setForm({ ...form, retainer_interval_months: parseInt(value, 10) })}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETAINER_INTERVALS.map((months) => (
                      <SelectItem key={months} value={String(months)}>
                        Every {months} {months === 1 ? 'month' : 'months'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="retainer_included_hours">Included Hours</Label>
                <Input
                  id="retainer_included_hours"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.retainer_included_hours}
                  onChange={(e) => setForm({ ...form, retainer_included_hours: e.target.value })}
                  disabled={!isEditable}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retainer_hourly_rate">Overage Hourly Rate ($)</Label>
                <CurrencyInput
                  id="retainer_hourly_rate"
                  value={form.retainer_hourly_rate}
                  onValueChange={(value) => setForm({ ...form, retainer_hourly_rate: String(value) })}
                  disabled={!isEditable}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="retainer_description">Retainer Description</Label>
                <Input
                  id="retainer_description"
                  value={form.retainer_description}
                  onChange={(e) => setForm({ ...form, retainer_description: e.target.value })}
                  disabled={!isEditable}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Scope &amp; Add-ons</CardTitle>
          <CardDescription>Deliverables become tasks; priced add-ons become invoice lines or recurring items.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalItemsEditor items={items} onChange={setItems} disabled={!isEditable} />
        </CardContent>
      </Card>

      {isEditable && (
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button onClick={() => void handleSend()} disabled={saving}>
              <Send className="mr-2 h-4 w-4" />
              Send to Client
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete proposal</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the draft proposal.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
