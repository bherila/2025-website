import { CreditCard, Landmark, Loader2, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ClientPaymentMethod } from '@/client-management/types/payment-method'
import { ClientPaymentMethodListResponseSchema } from '@/client-management/types/payment-method'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchWrapper } from '@/fetchWrapper'

import AddPaymentMethodDialog from './AddPaymentMethodDialog'

interface SavedPaymentMethodsCardProps {
  companyId: number
  publishableKey: string | null
}

function methodLabel(method: ClientPaymentMethod): string {
  if (method.type === 'us_bank_account') {
    return method.bank_name ? `${method.bank_name} account` : 'Bank account'
  }

  return method.brand ? `${method.brand.toUpperCase()} card` : 'Card'
}

function methodDetail(method: ClientPaymentMethod): string {
  const suffix = method.last4 ? `ending in ${method.last4}` : 'ending unknown'
  if (method.type === 'us_bank_account') {
    return suffix
  }

  const expiration = method.exp_month && method.exp_year ? `, expires ${method.exp_month}/${method.exp_year}` : ''
  return `${suffix}${expiration}`
}

export default function SavedPaymentMethodsCard({ companyId, publishableKey }: SavedPaymentMethodsCardProps) {
  const [methods, setMethods] = useState<ClientPaymentMethod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMethods = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetchWrapper.get(`/api/client/portal/companies/${companyId}/payment-methods`)
      const parsed = ClientPaymentMethodListResponseSchema.safeParse(response)
      if (!parsed.success) {
        setError('Saved payment methods could not be loaded.')
        setMethods([])
        return
      }

      setMethods(parsed.data.payment_methods)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
    } finally {
      setIsLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void loadMethods()
  }, [loadMethods])

  async function makeDefault(methodId: number): Promise<void> {
    setIsMutating(methodId)
    try {
      await fetchWrapper.post(`/api/client/portal/companies/${companyId}/payment-methods/${methodId}/default`, {})
      await loadMethods()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
    } finally {
      setIsMutating(null)
    }
  }

  async function removeMethod(methodId: number): Promise<void> {
    if (!window.confirm('Remove this saved payment method?')) {
      return
    }

    setIsMutating(methodId)
    try {
      await fetchWrapper.delete(`/api/client/portal/companies/${companyId}/payment-methods/${methodId}`, {})
      await loadMethods()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
    } finally {
      setIsMutating(null)
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Saved Payment Methods</CardTitle>
        <CardDescription>Cards and bank accounts available for invoice payments.</CardDescription>
        <CardAction>
          <AddPaymentMethodDialog companyId={companyId} publishableKey={publishableKey} onSaved={loadMethods} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payment methods...
          </div>
        ) : methods.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No saved payment methods yet.
          </div>
        ) : (
          methods.map((method) => {
            const Icon = method.type === 'us_bank_account' ? Landmark : CreditCard
            const isBusy = isMutating === method.id

            return (
              <div key={method.id} className="flex flex-col gap-3 rounded-md border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {methodLabel(method)}
                      {method.is_default && <Badge variant="outline">Default</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{methodDetail(method)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {!method.is_default && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void makeDefault(method.id)} disabled={isBusy}>
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                      <span className="sr-only">Set as default</span>
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => void removeMethod(method.id)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="sr-only">Remove</span>
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
