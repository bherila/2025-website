import currency from 'currency.js'
import { AlertCircle, Check, ClipboardList } from 'lucide-react'
import { useMemo, useState } from 'react'

import ProposalMarkdown from '@/client-management/components/shared/proposal/ProposalMarkdown'
import type { Proposal, ProposalItem } from '@/client-management/types/proposal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

import ClientPortalNav from './ClientPortalNav'

interface ClientPortalProposalPageProps {
  slug: string
  companyName: string
  companyId: number
  initialProposal: Proposal
}

type Mode = 'idle' | 'accept' | 'reject' | 'request_changes'

function isUpfront(item: ProposalItem): boolean {
  return item.kind === 'add_on' && item.charge_cadence === 'one_time'
}

export default function ClientPortalProposalPage({
  slug,
  companyName,
  companyId,
  initialProposal,
}: ClientPortalProposalPageProps) {
  const [proposal, setProposal] = useState<Proposal>(initialProposal)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [links, setLinks] = useState<{ agreementId?: number; invoiceId?: number }>({})

  // Optional items default to selected — the client opts OUT.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(proposal.items.filter((item) => item.is_optional).map((item) => item.id)),
  )

  const canAct = proposal.status === 'sent' || proposal.status === 'changes_requested'

  const net = useMemo(() => {
    let total = currency(proposal.base_amount)
    for (const item of proposal.items) {
      if (isUpfront(item) && item.amount && (!item.is_optional || selectedIds.has(item.id))) {
        total = total.add(item.amount)
      }
    }
    return total.subtract(proposal.credit_amount ?? 0).value
  }, [proposal, selectedIds])

  const toggle = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const submit = async (action: 'accept' | 'reject' | 'request-changes') => {
    setSubmitting(true)
    setError(null)
    try {
      let body: Record<string, unknown>
      if (action === 'accept') {
        if (!name.trim() || !title.trim()) {
          setError('Please enter your name and title.')
          setSubmitting(false)
          return
        }
        body = {
          name: name.trim(),
          title: title.trim(),
          selected_item_ids: proposal.items
            .filter((item) => item.is_optional && selectedIds.has(item.id))
            .map((item) => item.id),
        }
      } else if (action === 'reject') {
        body = { reason: message.trim() }
      } else {
        body = { message: message.trim() }
      }

      const data = await fetchWrapper.post(
        `/api/client/portal/${slug}/proposals/${proposal.id}/${action}`,
        body,
      )
      setProposal(data.proposal)
      setMode('idle')
      if (action === 'accept') {
        setLinks({ agreementId: data.agreement_id, invoiceId: data.invoice_id })
        setSuccess('Proposal accepted. Your agreement has been created.')
      } else if (action === 'reject') {
        setSuccess('Proposal rejected.')
      } else {
        setSuccess('Your change request has been sent.')
      }
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const statusBadge = () => {
    switch (proposal.status) {
      case 'accepted':
        return <Badge className="bg-green-600 hover:bg-green-700"><Check className="mr-1 h-3 w-3" /> Accepted</Badge>
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>
      case 'changes_requested':
        return <Badge variant="outline">Changes Requested</Badge>
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>
      default:
        return <Badge variant="secondary">Awaiting Your Response</Badge>
    }
  }

  return (
    <>
      <ClientPortalNav
        slug={slug}
        companyName={companyName}
        companyId={companyId}
        currentPage="proposal"
        proposalTitle={proposal.title}
      />
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-6 flex items-center gap-4">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold">{proposal.title}</h1>
          </div>
          <div className="ml-auto">{statusBadge()}</div>
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

        {proposal.body_markdown && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <ProposalMarkdown>{proposal.body_markdown}</ProposalMarkdown>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Optional items are selected by default — uncheck anything you don&apos;t want.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between border-b pb-3">
              <span>{proposal.base_description || 'Base fee'}</span>
              <span className="font-medium">{currency(proposal.base_amount).format()}</span>
            </div>

            {proposal.items
              .filter((item) => isUpfront(item) || item.kind === 'scope')
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-3">
                  <div className="flex items-center gap-2">
                    {item.is_optional ? (
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(checked) => toggle(item.id, Boolean(checked))}
                        disabled={!canAct}
                      />
                    ) : (
                      <span className="inline-block w-4" />
                    )}
                    <Label htmlFor={`item-${item.id}`} className="font-normal">
                      {item.description}
                      {item.is_optional && <span className="ml-2 text-xs text-muted-foreground">(optional)</span>}
                    </Label>
                  </div>
                  <span className="font-medium">
                    {item.kind === 'add_on' && item.amount ? currency(item.amount).format() : 'Deliverable'}
                  </span>
                </div>
              ))}

            {proposal.credit_amount && Number(proposal.credit_amount) > 0 && (
              <div className="flex items-center justify-between border-b pb-3 text-green-700 dark:text-green-400">
                <span>{proposal.credit_label || 'Credit'}</span>
                <span className="font-medium">−{currency(proposal.credit_amount).format()}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 text-lg font-bold">
              <span>Total Due</span>
              <span>{currency(net).format()}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Due {proposal.payment_net_days} days after acceptance.
            </p>

            {proposal.retainer_interval_months && proposal.retainer_amount && (
              <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Ongoing retainer (included)</p>
                <p className="text-muted-foreground">
                  {currency(proposal.retainer_amount).format()} every {proposal.retainer_interval_months}{' '}
                  {proposal.retainer_interval_months === 1 ? 'month' : 'months'}
                  {proposal.retainer_included_hours
                    ? `, ${proposal.retainer_included_hours} hour(s) included`
                    : ''}
                  . Begins the 1st of the month following acceptance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {proposal.status === 'accepted' && (
          <Card className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CardHeader>
              <CardTitle className="text-green-700 dark:text-green-300">✓ Proposal Accepted</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-green-700 dark:text-green-300">
              {proposal.accept_signature_name && (
                <p>
                  <strong>Signed by:</strong> {proposal.accept_signature_name} ({proposal.accept_signature_title})
                </p>
              )}
              {(links.agreementId ?? proposal.agreement_id) && (
                <p>
                  <a className="underline" href={`/client/portal/${slug}/agreement/${links.agreementId ?? proposal.agreement_id}`}>
                    View your agreement →
                  </a>
                </p>
              )}
              {links.invoiceId && (
                <p>
                  <a className="underline" href={`/client/portal/${slug}/invoice/${links.invoiceId}`}>
                    View your invoice →
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {(proposal.status === 'rejected' || proposal.status === 'changes_requested') && proposal.client_response_message && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Your Response</CardTitle>
            </CardHeader>
            <CardContent>
              <blockquote className="border-l-2 pl-3 text-muted-foreground">{proposal.client_response_message}</blockquote>
            </CardContent>
          </Card>
        )}

        {canAct && (
          <Card>
            <CardHeader>
              <CardTitle>Respond</CardTitle>
              <CardDescription>Accept to sign and start the engagement, or send feedback.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === 'accept' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Full Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Your Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Typing your name and accepting constitutes your signature.
                  </p>
                </div>
              )}

              {mode === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="reject_reason">Reason</Label>
                  <Textarea id="reject_reason" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
                </div>
              )}

              {mode === 'request_changes' && (
                <div className="space-y-2">
                  <Label htmlFor="change_message">What would you like changed?</Label>
                  <Textarea id="change_message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {mode === 'idle' ? (
                <>
                  <Button onClick={() => setMode('accept')}>Accept &amp; Sign</Button>
                  <Button variant="outline" onClick={() => { setMessage(''); setMode('request_changes') }}>
                    Request Changes
                  </Button>
                  <Button variant="ghost" onClick={() => { setMessage(''); setMode('reject') }}>
                    Reject
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() =>
                      void submit(mode === 'accept' ? 'accept' : mode === 'reject' ? 'reject' : 'request-changes')
                    }
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : 'Confirm'}
                  </Button>
                  <Button variant="outline" onClick={() => setMode('idle')} disabled={submitting}>
                    Cancel
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </>
  )
}
