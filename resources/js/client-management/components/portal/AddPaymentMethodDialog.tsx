import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Loader2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fetchWrapper } from '@/fetchWrapper'

interface AddPaymentMethodDialogProps {
  companyId: number
  publishableKey: string | null
  onSaved: () => void
}

interface SetupIntentResponse {
  client_secret: string | null
  customer_id: string
  publishable_key: string | null
}

interface SetupFormProps {
  onCancel: () => void
  onSaved: () => void
}

function SetupForm({ onCancel, onSaved }: SetupFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsSaving(true)
    setMessage(null)

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setMessage(result.error.message ?? 'Unable to save this payment method.')
      setIsSaving(false)
      return
    }

    setMessage('Payment method saved.')
    onSaved()
    setIsSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {message && <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{message}</div>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || !elements || isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save method
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function AddPaymentMethodDialog({ companyId, publishableKey, onSaved }: AddPaymentMethodDialogProps) {
  const [open, setOpen] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [activePublishableKey, setActivePublishableKey] = useState<string | null>(publishableKey)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setClientSecret(null)
      setError(null)
      return
    }

    let isMounted = true

    async function createSetupIntent(): Promise<void> {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetchWrapper.post(`/api/client/portal/companies/${companyId}/payment-methods/setup`, {}) as SetupIntentResponse
        if (!isMounted) {
          return
        }

        setClientSecret(response.client_secret)
        setActivePublishableKey(response.publishable_key ?? publishableKey)
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void createSetupIntent()

    return () => {
      isMounted = false
    }
  }, [companyId, open, publishableKey])

  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    return activePublishableKey ? loadStripe(activePublishableKey) : null
  }, [activePublishableKey])

  function handleSaved(): void {
    onSaved()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add method
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>Save a card or US bank account for future invoice payments.</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing secure payment form...
          </div>
        )}

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        {!isLoading && !error && (!stripePromise || !clientSecret) && (
          <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            Stripe is not configured for online payment methods yet.
          </div>
        )}

        {stripePromise && clientSecret && (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <SetupForm onCancel={() => setOpen(false)} onSaved={handleSaved} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  )
}
