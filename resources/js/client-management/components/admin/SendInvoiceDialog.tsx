import { AlertCircle, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

import type { NormalizedInvoice } from '../shared/invoices/invoiceAdapters'

interface SendInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: number
  invoice: NormalizedInvoice
  onSent?: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Failed to send the invoice.'
}

function parseEmails(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((email) => email.trim())
    .filter((email) => email.length > 0)
}

export default function SendInvoiceDialog({ open, onOpenChange, companyId, invoice, onSent }: SendInvoiceDialogProps) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [note, setNote] = useState('')
  const [saveAsBillingEmail, setSaveAsBillingEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTo(invoice.billing_email || invoice.recipient_suggestions?.[0] || '')
      setCc('')
      setNote('')
      setSaveAsBillingEmail(false)
      setError(null)
    }
  }, [open, invoice.billing_email, invoice.recipient_suggestions])

  const addRecipient = (email: string) => {
    setTo((current) => {
      const existing = parseEmails(current)
      if (existing.includes(email)) {
        return current
      }

      return existing.length > 0 ? `${current.trim()}, ${email}` : email
    })
  }

  const handleSend = async () => {
    const recipients = parseEmails(to)
    if (recipients.length === 0) {
      setError('Add at least one recipient email address.')

      return
    }

    setLoading(true)
    setError(null)
    try {
      await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/invoices/${invoice.id}/send`, {
        to: recipients,
        cc: parseEmails(cc),
        note: note.trim() ? note.trim() : null,
        save_as_billing_email: saveAsBillingEmail,
      })
      onSent?.()
      onOpenChange(false)
    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const suggestions = invoice.recipient_suggestions ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Send {invoice.invoice_number ?? `Draft ${invoice.id}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="send-invoice-to">To</Label>
            <Input
              id="send-invoice-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="billing@example.com"
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((email) => (
                  <Button
                    key={email}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addRecipient(email)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {email}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-invoice-cc">Cc</Label>
            <Input
              id="send-invoice-cc"
              value={cc}
              onChange={(event) => setCc(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-invoice-note">Note</Label>
            <Textarea
              id="send-invoice-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional message to include in the email"
            />
          </div>

          <Label className="cursor-pointer">
            <Checkbox
              checked={saveAsBillingEmail}
              onCheckedChange={(checked) => setSaveAsBillingEmail(checked === true)}
            />
            Save as company billing email
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={loading}>
            {loading ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
