import currency from 'currency.js'
import { AlertTriangle, FileText, RefreshCw, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { InvoiceKindBadge, InvoiceStatusBadge } from '@/client-management/components/admin/ClientBadges'
import DateRangeFilter from '@/client-management/components/admin/DateRangeFilter'
import type { BillingCadence } from '@/client-management/types/client-agreement'
import type { Agreement } from '@/client-management/types/common'
import { formatBillingCadence } from '@/client-management/utils/formatBillingCadence'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

export interface AdminInvoice {
  id: number
  client_agreement_id?: number | null
  agreement_id?: number | null
  invoice_number: string | null
  period_start: string | null
  period_end: string | null
  cycle_start?: string | null
  cycle_end?: string | null
  invoice_total: string | number
  status: string
  invoice_kind?: string
  hours_worked?: string | number
  retainer_hours_included?: string | number
  hours_billed_at_rate?: string | number
  stripe_payment_status?: string | null
  stripe_failure_reason?: string | null
}

interface AdminInvoiceListProps {
  companyId: number
  agreements?: Agreement[]
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : 'Open'
}

function countByKind(results: Record<string, unknown>): string {
  const summary = results.summary as Record<string, unknown> | undefined
  const cadence = Number(summary?.cadence_period_invoices_created ?? 0)
  const interim = Number(summary?.interim_invoices_created ?? 0)
  const parts = [
    cadence > 0 ? `${cadence} cadence-period draft${cadence === 1 ? '' : 's'}` : null,
    interim > 0 ? `${interim} interim-overage draft${interim === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? `Created ${parts.join(', ')}.` : 'No new invoices to generate.'
}

export function hasStripePaymentFailure(invoice: Pick<AdminInvoice, 'stripe_failure_reason' | 'stripe_payment_status'>): boolean {
  return Boolean(invoice.stripe_failure_reason || ['failed', 'canceled'].includes(invoice.stripe_payment_status ?? ''))
}

export default function AdminInvoiceList({ companyId, agreements = [] }: AdminInvoiceListProps) {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [agreementFilter, setAgreementFilter] = useState('all')
  const [stripeFailureFilter, setStripeFailureFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWrapper.get(`/api/client/mgmt/companies/${companyId}/invoices`)
      setInvoices(Array.isArray(data) ? data as AdminInvoice[] : [])
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) {
        return false
      }
      if (kindFilter !== 'all' && invoice.invoice_kind !== kindFilter) {
        return false
      }
      if (agreementFilter !== 'all' && String(invoice.client_agreement_id ?? invoice.agreement_id ?? '') !== agreementFilter) {
        return false
      }
      if (stripeFailureFilter === 'failed' && !hasStripePaymentFailure(invoice)) {
        return false
      }
      if (stripeFailureFilter === 'clear' && hasStripePaymentFailure(invoice)) {
        return false
      }
      if (dateFrom && (invoice.period_end ?? '') < dateFrom) {
        return false
      }
      if (dateTo && (invoice.period_start ?? '') > dateTo) {
        return false
      }

      return true
    })
  }, [agreementFilter, dateFrom, dateTo, invoices, kindFilter, statusFilter, stripeFailureFilter])

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => selected.includes(invoice.id)),
    [invoices, selected],
  )

  const generateAll = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const data = await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/invoices/generate-all`, {})
      const results = (data as { results?: Record<string, unknown> }).results ?? {}
      setMessage(countByKind(results))
      await loadInvoices()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const runInvoiceAction = async (invoice: AdminInvoice, action: 'issue' | 'mark-paid' | 'void') => {
    setLoading(true)
    setError(null)
    try {
      await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/invoices/${invoice.id}/${action}`, {})
      await loadInvoices()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const runBulkAction = async (action: 'issue' | 'mark-paid' | 'void') => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      for (const invoice of selectedInvoices) {
        await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/invoices/${invoice.id}/${action}`, {})
      }
      setSelected([])
      setMessage(`Updated ${selectedInvoices.length} invoice${selectedInvoices.length === 1 ? '' : 's'}.`)
      await loadInvoices()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const regenerateInvoice = async (invoice: AdminInvoice) => {
    const cycleStart = invoice.cycle_start ?? invoice.period_start
    const cycleEnd = invoice.cycle_end ?? invoice.period_end
    if (!cycleStart || !cycleEnd) {
      setError('This invoice does not have a period that can be regenerated.')
      return
    }

    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      await fetchWrapper.post(`/api/client/mgmt/companies/${companyId}/invoices`, {
        cycle_start: cycleStart,
        cycle_end: cycleEnd,
      })
      setMessage('Invoice draft refreshed.')
      await loadInvoices()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const toggleSelected = (invoiceId: number) => {
    setSelected((current) => current.includes(invoiceId)
      ? current.filter((id) => id !== invoiceId)
      : [...current, invoiceId])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="cadence_period">Cadence period</SelectItem>
            <SelectItem value="interim_overage">Interim overage</SelectItem>
            <SelectItem value="terminal">Terminal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agreementFilter} onValueChange={setAgreementFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agreements</SelectItem>
            {agreements.map((agreement) => (
              <SelectItem key={agreement.id} value={String(agreement.id)}>
                {formatBillingCadence((agreement.billing_cadence ?? 'monthly') as BillingCadence)} from {formatDate(agreement.active_date)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stripeFailureFilter} onValueChange={setStripeFailureFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stripe results</SelectItem>
            <SelectItem value="failed">Stripe failures</SelectItem>
            <SelectItem value="clear">No Stripe failure</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Button onClick={() => void generateAll()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Generate drafts
        </Button>
      </div>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span>{selected.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void runBulkAction('issue')} disabled={loading}>Issue</Button>
            <Button size="sm" variant="outline" onClick={() => void runBulkAction('mark-paid')} disabled={loading}>Mark paid</Button>
            <Button size="sm" variant="destructive" onClick={() => void runBulkAction('void')} disabled={loading}>Void</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Invoice</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stripe Failure</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(invoice.id)}
                    onCheckedChange={() => toggleSelected(invoice.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {invoice.invoice_number ?? `Draft ${invoice.id}`}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(invoice.cycle_start ?? invoice.period_start)} - {formatDate(invoice.cycle_end ?? invoice.period_end)}
                </TableCell>
                <TableCell><InvoiceKindBadge value={invoice.invoice_kind} /></TableCell>
                <TableCell className="text-sm">
                  {Number(invoice.hours_worked ?? 0).toFixed(2)} worked / {Number(invoice.retainer_hours_included ?? 0).toFixed(2)} retained
                </TableCell>
                <TableCell>{currency(invoice.invoice_total).format()}</TableCell>
                <TableCell><InvoiceStatusBadge value={invoice.status} /></TableCell>
                <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                  {hasStripePaymentFailure(invoice) ? (
                    <div className="flex items-start gap-2 text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-2">
                        {invoice.stripe_failure_reason ?? `Stripe payment ${invoice.stripe_payment_status}`}
                      </span>
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {invoice.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => void runInvoiceAction(invoice, 'issue')}>Issue</Button>
                    )}
                    {invoice.status !== 'paid' && invoice.status !== 'void' && (
                      <Button size="sm" variant="outline" onClick={() => void runInvoiceAction(invoice, 'mark-paid')}>Paid</Button>
                    )}
                    {invoice.status !== 'void' && invoice.status !== 'paid' && (
                      <Button size="sm" variant="destructive" onClick={() => void runInvoiceAction(invoice, 'void')}>Void</Button>
                    )}
                    {invoice.status === 'draft' && (
                      <Button size="sm" variant="ghost" onClick={() => void regenerateInvoice(invoice)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No invoices match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
