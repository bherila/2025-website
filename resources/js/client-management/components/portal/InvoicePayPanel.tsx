import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import currency from 'currency.js'
import { CreditCard, Landmark, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Invoice } from '@/client-management/types'
import type { ClientPaymentMethod } from '@/client-management/types/payment-method'
import { ClientPaymentMethodListResponseSchema } from '@/client-management/types/payment-method'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'

interface InvoicePayPanelProps {
  invoice: Invoice
  companyId: number
  stripePublishableKey: string | null
  stripeMaxAmountCents: number
  onPaymentUpdated: () => void
}

interface PaymentIntentResponse {
  payment: {
    id: number
    stripe_payment_intent_id: string
    status: string
  }
  client_secret: string | null
  status: string
  publishable_key: string | null
}

interface NewPaymentFormProps {
  clientSecret: string
  onCancel: () => void
  onComplete: () => void
}

function savedMethodLabel(method: ClientPaymentMethod): string {
  const suffix = method.last4 ? `ending in ${method.last4}` : 'ending unknown'
  if (method.type === 'us_bank_account') {
    return `${method.bank_name ?? 'Bank account'} ${suffix}`
  }

  return `${method.brand?.toUpperCase() ?? 'Card'} ${suffix}`
}

function NewPaymentForm({ onCancel, onComplete }: NewPaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!stripe || !elements) {
      return
    }

    setIsConfirming(true)
    setError(null)

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message ?? 'Payment could not be completed.')
      setIsConfirming(false)
      return
    }

    onComplete()
    setIsConfirming(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isConfirming}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elements || isConfirming}>
          {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit payment
        </Button>
      </div>
    </form>
  )
}

export default function InvoicePayPanel({
  invoice,
  companyId,
  stripePublishableKey,
  stripeMaxAmountCents,
  onPaymentUpdated,
}: InvoicePayPanelProps) {
  const [methods, setMethods] = useState<ClientPaymentMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null)
  const [mode, setMode] = useState<'saved' | 'new' | 'manual'>('new')
  const [saveNewMethod, setSaveNewMethod] = useState(true)
  const [isLoadingMethods, setIsLoadingMethods] = useState(true)
  const [isCreatingIntent, setIsCreatingIntent] = useState(false)
  const [newPaymentClientSecret, setNewPaymentClientSecret] = useState<string | null>(null)
  const [activePublishableKey, setActivePublishableKey] = useState<string | null>(stripePublishableKey)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invoiceTotal = currency(invoice.invoice_total)
  const remainingBalance = currency(invoice.remaining_balance)
  const isStripeEligible = invoice.status === 'issued' && remainingBalance.intValue > 0 && invoiceTotal.intValue <= stripeMaxAmountCents
  const isManualOnly = invoice.status === 'issued' && remainingBalance.intValue > 0 && invoiceTotal.intValue > stripeMaxAmountCents

  const loadMethods = useCallback(async (): Promise<void> => {
    setIsLoadingMethods(true)
    try {
      const response = await fetchWrapper.get(`/api/client/portal/companies/${companyId}/payment-methods`)
      const parsed = ClientPaymentMethodListResponseSchema.safeParse(response)
      if (!parsed.success) {
        setMethods([])
        return
      }

      setMethods(parsed.data.payment_methods)
      const defaultMethod = parsed.data.payment_methods.find((method) => method.is_default) ?? parsed.data.payment_methods[0] ?? null
      if (defaultMethod) {
        setSelectedMethodId(defaultMethod.id)
        setMode('saved')
      }
    } catch {
      setMethods([])
    } finally {
      setIsLoadingMethods(false)
    }
  }, [companyId])

  useEffect(() => {
    if (isStripeEligible) {
      void loadMethods()
    }
  }, [isStripeEligible, loadMethods])

  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    return activePublishableKey ? loadStripe(activePublishableKey) : null
  }, [activePublishableKey])

  async function createIntent(savedPaymentMethodId: number | null): Promise<PaymentIntentResponse | null> {
    setIsCreatingIntent(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetchWrapper.post(`/api/client/portal/invoices/${invoice.client_invoice_id}/pay-intent`, {
        saved_payment_method_id: savedPaymentMethodId,
        save_payment_method: savedPaymentMethodId ? false : saveNewMethod,
        return_url: window.location.href,
      }) as PaymentIntentResponse

      setActivePublishableKey(response.publishable_key ?? stripePublishableKey)
      return response
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
      return null
    } finally {
      setIsCreatingIntent(false)
    }
  }

  async function paySavedMethod(): Promise<void> {
    if (!selectedMethodId) {
      setError('Choose a saved payment method.')
      return
    }

    const response = await createIntent(selectedMethodId)
    if (!response) {
      return
    }

    if (response.client_secret && stripePromise) {
      const stripe = await stripePromise
      const result = await stripe?.confirmPayment({
        clientSecret: response.client_secret,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      })

      if (result?.error) {
        setError(result.error.message ?? 'Payment could not be completed.')
        return
      }
    }

    setMessage(response.status === 'processing' ? 'Payment is processing.' : 'Payment submitted.')
    onPaymentUpdated()
  }

  async function startNewPayment(): Promise<void> {
    const response = await createIntent(null)
    if (!response?.client_secret) {
      setMessage('Payment submitted.')
      onPaymentUpdated()
      return
    }

    setNewPaymentClientSecret(response.client_secret)
  }

  if (remainingBalance.intValue <= 0 || invoice.status === 'paid') {
    return null
  }

  if (isManualOnly) {
    return (
      <Card className="rounded-lg border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <CardHeader>
          <CardTitle>Manual Payment Required</CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-200/80">
            This invoice total is above the online payment limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          Please use the manual payment instructions on the invoice or contact us for ACH/wire details.
        </CardContent>
      </Card>
    )
  }

  if (!isStripeEligible) {
    return null
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Pay This Invoice</CardTitle>
        <CardDescription>Remaining balance: {remainingBalance.format()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {message && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            type="button"
            className={`rounded-md border px-4 py-3 text-left transition-colors ${mode === 'saved' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
            onClick={() => setMode('saved')}
            disabled={methods.length === 0}
          >
            <CreditCard className="mb-2 h-4 w-4" />
            <div className="font-medium">Saved method</div>
            <div className="text-sm text-muted-foreground">{methods.length > 0 ? 'Use a saved card or bank account.' : 'No saved methods yet.'}</div>
          </button>
          <button
            type="button"
            className={`rounded-md border px-4 py-3 text-left transition-colors ${mode === 'new' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
            onClick={() => setMode('new')}
          >
            <CreditCard className="mb-2 h-4 w-4" />
            <div className="font-medium">New card</div>
            <div className="text-sm text-muted-foreground">Pay securely with Stripe.</div>
          </button>
          <button
            type="button"
            className={`rounded-md border px-4 py-3 text-left transition-colors ${mode === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
            onClick={() => setMode('manual')}
          >
            <Landmark className="mb-2 h-4 w-4" />
            <div className="font-medium">Manual</div>
            <div className="text-sm text-muted-foreground">Use check, wire, or manual ACH.</div>
          </button>
        </div>

        {mode === 'saved' && (
          <div className="flex flex-col gap-3">
            {isLoadingMethods ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading saved methods...
              </div>
            ) : methods.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Add a saved payment method from Billing, or choose a new card here.
              </div>
            ) : (
              methods.map((method) => (
                <Label key={method.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-3">
                  <input
                    type="radio"
                    name="saved_payment_method"
                    checked={selectedMethodId === method.id}
                    onChange={() => setSelectedMethodId(method.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1">
                    <span className="block font-medium">{savedMethodLabel(method)}</span>
                    {method.is_default && <span className="text-sm text-muted-foreground">Default</span>}
                  </span>
                </Label>
              ))
            )}
          </div>
        )}

        {mode === 'new' && (
          <div className="flex flex-col gap-3">
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveNewMethod}
                onChange={(event) => setSaveNewMethod(event.target.checked)}
                className="h-4 w-4"
              />
              Save this method for future invoices
            </Label>

            {newPaymentClientSecret && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret: newPaymentClientSecret }}>
                <NewPaymentForm
                  clientSecret={newPaymentClientSecret}
                  onCancel={() => setNewPaymentClientSecret(null)}
                  onComplete={() => {
                    setMessage('Payment submitted.')
                    setNewPaymentClientSecret(null)
                    onPaymentUpdated()
                  }}
                />
              </Elements>
            ) : null}
          </div>
        )}

        {mode === 'manual' && (
          <div className="rounded-md border border-border bg-muted px-3 py-3 text-sm text-muted-foreground">
            Please use the manual payment instructions on the invoice or contact us for ACH/wire details.
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onPaymentUpdated()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        {mode === 'saved' && methods.length > 0 && (
          <Button type="button" onClick={() => void paySavedMethod()} disabled={isCreatingIntent || !selectedMethodId}>
            {isCreatingIntent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {remainingBalance.format()}
          </Button>
        )}
        {mode === 'new' && !newPaymentClientSecret && (
          <Button type="button" onClick={() => void startNewPayment()} disabled={isCreatingIntent || !stripePublishableKey}>
            {isCreatingIntent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
