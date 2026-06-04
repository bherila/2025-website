import { Download, Mail, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import DateRangeFilter from '@/client-management/components/admin/DateRangeFilter'
import SendInvoiceDialog from '@/client-management/components/admin/SendInvoiceDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

import { fromAdminInvoice, type NormalizedInvoice } from '../shared/invoices/invoiceAdapters'
import { InvoiceTable } from '../shared/invoices/InvoiceTable'
import { hasStripePaymentFailure } from '../shared/invoices/stripeUtils'
import type { AdminInvoice } from './AdminInvoiceList'

export default function AllInvoicesPage() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [stripeFailureFilter, setStripeFailureFilter] = useState('all')
  const [balanceDueOnly, setBalanceDueOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendInvoice, setSendInvoice] = useState<NormalizedInvoice | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)

    return () => clearTimeout(timer)
  }, [search])

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWrapper.get('/api/client/mgmt/invoices')
      setInvoices(Array.isArray(data) ? data as AdminInvoice[] : [])
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [])

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
      if (stripeFailureFilter === 'failed' && !hasStripePaymentFailure(invoice)) {
        return false
      }
      if (stripeFailureFilter === 'clear' && hasStripePaymentFailure(invoice)) {
        return false
      }
      if (balanceDueOnly && Number(invoice.remaining_balance ?? 0) <= 0) {
        return false
      }
      if (dateFrom && (invoice.period_end ?? '') < dateFrom) {
        return false
      }
      if (dateTo && (invoice.period_start ?? '') > dateTo) {
        return false
      }
      if (debouncedSearch) {
        const haystack = `${invoice.company_name ?? ''} ${invoice.invoice_number ?? ''}`.toLowerCase()
        if (!haystack.includes(debouncedSearch)) {
          return false
        }
      }

      return true
    })
  }, [balanceDueOnly, dateFrom, dateTo, debouncedSearch, invoices, kindFilter, statusFilter, stripeFailureFilter])

  const normalizedInvoices = useMemo(
    () => filteredInvoices.map(fromAdminInvoice),
    [filteredInvoices],
  )

  const toggleSelected = (invoiceId: number) => {
    setSelected((current) => current.includes(invoiceId)
      ? current.filter((id) => id !== invoiceId)
      : [...current, invoiceId])
  }

  const renderActions = (invoice: NormalizedInvoice) => (
    <>
      {invoice.status !== 'draft' && invoice.company_id != null && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Download PDF"
          onClick={() => window.open(`/api/client/mgmt/companies/${invoice.company_id}/invoices/${invoice.id}/pdf`, '_blank')}
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
      {(invoice.status === 'issued' || invoice.status === 'paid') && invoice.company_id != null && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={invoice.last_emailed_at ? 'Resend' : 'Send'}
          onClick={() => setSendInvoice(invoice)}
        >
          <Mail className="h-4 w-4" />
        </Button>
      )}
    </>
  )

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-8">
      <h1 className="text-3xl font-bold">All Invoices</h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-9"
            placeholder="Search company or invoice #"
            aria-label="Search invoices"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
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
        <Button
          variant={balanceDueOnly ? 'default' : 'outline'}
          onClick={() => setBalanceDueOnly((value) => !value)}
          aria-pressed={balanceDueOnly}
        >
          Balance due only
        </Button>
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <InvoiceTable
        mode="admin"
        showCompany
        invoices={normalizedInvoices}
        selected={selected}
        onToggleSelected={toggleSelected}
        renderActions={renderActions}
      />

      {sendInvoice && sendInvoice.company_id != null && (
        <SendInvoiceDialog
          key={`${sendInvoice.company_id}-${sendInvoice.id}`}
          open={sendInvoice !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSendInvoice(null)
            }
          }}
          companyId={sendInvoice.company_id}
          invoice={sendInvoice}
          onSent={() => void loadInvoices()}
        />
      )}
    </div>
  )
}
