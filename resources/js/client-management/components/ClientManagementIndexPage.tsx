import currency from 'currency.js'
import { AlertCircle, CreditCard, DollarSign, Plus, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import CompanyCard from '@/client-management/components/admin/CompanyCard'
import InactiveCompaniesSection from '@/client-management/components/admin/InactiveCompaniesSection'
import KpiTile from '@/client-management/components/admin/KpiTile'
import InvitePeopleModal from '@/client-management/components/InvitePeopleModal'
import type { ClientCompany, CompanyListResponse, CompanySort, GlobalStats, ListMeta } from '@/client-management/types/common'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Failed to load client companies.'
}

const SORT_OPTIONS: { value: CompanySort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'balance_due', label: 'Balance due' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'last_activity', label: 'Last activity' },
]

export default function ClientManagementIndexPage() {
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [meta, setMeta] = useState<ListMeta | null>(null)
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<CompanySort>('name')
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false)
  const [stripeDisabledOnly, setStripeDisabledOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)

    return () => clearTimeout(timer)
  }, [search])

  const fetchCompanies = useCallback(async (page: number, append: boolean): Promise<void> => {
    const requestId = ++requestIdRef.current

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const params = new URLSearchParams({ sort, page: String(page) })
      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }
      if (needsAttentionOnly) {
        params.set('needs_attention', '1')
      }
      if (stripeDisabledOnly) {
        params.set('stripe_disabled', '1')
      }

      const response = await fetchWrapper.get(`/api/client/mgmt/companies?${params.toString()}`) as CompanyListResponse

      // Ignore responses superseded by a newer request (search/filter races).
      if (requestId !== requestIdRef.current) {
        return
      }

      setMeta(response.meta)
      setStats(response.stats)
      setCompanies((previous) => (append ? [...previous, ...response.data] : response.data))
    } catch (caught) {
      if (requestId !== requestIdRef.current) {
        return
      }

      console.error('Error fetching companies:', caught)
      setError(getErrorMessage(caught))
      if (!append) {
        setCompanies([])
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [debouncedSearch, sort, needsAttentionOnly, stripeDisabledOnly])

  useEffect(() => {
    void fetchCompanies(1, false)
  }, [fetchCompanies])

  const loadMore = (): void => {
    if (meta && meta.has_more && !loadingMore) {
      void fetchCompanies(meta.current_page + 1, true)
    }
  }

  const openInviteModal = (companyId?: number): void => {
    setSelectedCompanyId(companyId ?? null)
    setInviteModalOpen(true)
  }

  const initialLoading = loading && stats === null

  if (initialLoading) {
    return (
      <div className="container mx-auto max-w-6xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-9 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Client Management</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openInviteModal()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Invite People
          </Button>
          <Button asChild>
            <a href="/client/mgmt/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New Company
            </a>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load companies</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchCompanies(1, false)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <KpiTile icon={Users} label="Active clients" value={stats?.active_clients ?? '—'} />
        <KpiTile
          icon={DollarSign}
          label="Open balance"
          value={stats ? currency(stats.open_balance).format() : '—'}
          onClick={() => setSort('balance_due')}
          active={sort === 'balance_due'}
        />
        <KpiTile
          icon={AlertCircle}
          label="Need attention"
          value={stats?.needs_attention ?? '—'}
          kind={stats && stats.needs_attention > 0 ? 'yellow' : 'default'}
          onClick={() => setNeedsAttentionOnly((value) => !value)}
          active={needsAttentionOnly}
        />
        <KpiTile
          icon={CreditCard}
          label="Stripe disabled"
          value={stats?.stripe_disabled ?? '—'}
          kind={stats && stats.stripe_disabled > 0 ? 'red' : 'default'}
          onClick={() => setStripeDisabledOnly((value) => !value)}
          active={stripeDisabledOnly}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-9"
            placeholder="Search clients"
            aria-label="Search clients"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as CompanySort)}>
          <SelectTrigger className="w-[180px]" aria-label="Sort companies">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={needsAttentionOnly ? 'default' : 'outline'}
          onClick={() => setNeedsAttentionOnly((value) => !value)}
          aria-pressed={needsAttentionOnly}
        >
          Needs attention
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {loading && <Spinner size="small" className="h-4 w-4" />}
          {meta ? `${meta.total} ${meta.total === 1 ? 'company' : 'companies'}` : null}
        </div>
      </div>

      <div className="space-y-4">
        {companies.map((company) => (
          <CompanyCard key={company.id} company={company} onAddUser={openInviteModal} />
        ))}

        {!loading && companies.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No companies match the current filters.
          </div>
        )}
      </div>

      {meta?.has_more && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Spinner size="small" className="mr-2 h-4 w-4" />}
            Load more
          </Button>
        </div>
      )}

      <InactiveCompaniesSection count={stats?.inactive_clients ?? 0} />

      <InvitePeopleModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onSuccess={() => void fetchCompanies(1, false)}
        preselectedCompanyId={selectedCompanyId}
      />
    </div>
  )
}
