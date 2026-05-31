import { ChevronDown, ChevronUp, Wrench } from 'lucide-react'
import { useState } from 'react'

import type { ClientCompany, CompanyListResponse } from '@/client-management/types/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'

interface InactiveCompaniesSectionProps {
  count: number
}

const PER_PAGE = 50

/**
 * Collapsible list of inactive companies. The list is fetched lazily on first
 * expand so it never bloats the active-company payload, and pages through the
 * remaining companies on demand so none beyond the first page are unreachable.
 */
export default function InactiveCompaniesSection({ count }: InactiveCompaniesSectionProps) {
  const [open, setOpen] = useState(false)
  const [companies, setCompanies] = useState<ClientCompany[] | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (count <= 0) {
    return null
  }

  const fetchPage = async (nextPage: number, append: boolean): Promise<void> => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const response = await fetchWrapper.get(
        `/api/client/mgmt/companies?status=inactive&per_page=${PER_PAGE}&sort=name&page=${nextPage}`
      ) as CompanyListResponse
      setCompanies((previous) => (append && previous ? [...previous, ...response.data] : response.data))
      setPage(response.meta.current_page)
      setHasMore(response.meta.has_more)
    } catch (fetchError) {
      console.error('Error fetching inactive companies:', fetchError)
      setError('Failed to load inactive companies.')
      if (!append) {
        setCompanies([])
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)

    if (!next || companies !== null || loading) {
      return
    }

    await fetchPage(1, false)
  }

  const loadMore = (): void => {
    if (hasMore && !loadingMore) {
      void fetchPage(page + 1, true)
    }
  }

  return (
    <div className="mt-8">
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
        onClick={() => void toggle()}
        aria-expanded={open}
      >
        {open ? <ChevronUp className="mr-2 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />}
        Inactive Companies ({count})
      </Button>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex justify-center py-4">
              <Spinner size="small" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {companies?.map((company) => (
            <Card key={company.id} className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{company.company_name}</CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">Inactive</Badge>
                      <Badge
                        variant="outline"
                        className={
                          company.stripe_billing_enabled === false
                            ? 'border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {company.stripe_billing_enabled === false ? 'Stripe Off' : 'Stripe On'}
                      </Badge>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/client/mgmt/${company.id}`}>
                      <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Manage
                    </a>
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Spinner size="small" className="mr-2 h-4 w-4" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
