'use client'

import { Heart, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fetchWrapper } from '@/fetchWrapper'

import MarriageStatusErrorDialog from './config/MarriageStatusErrorDialog'

/** Generate a contiguous range of years from startYear to currentYear (inclusive) */
function generateYearRange(startYear: number, endYear: number): string[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => String(startYear + i))
}

function MarriageStatusSection() {
  const [years, setYears] = useState<string[]>([])
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [yearsData, statusData] = await Promise.all([
        fetchWrapper.get('/api/payslips/years') as Promise<string[]>,
        fetchWrapper.get('/api/finance/marriage-status') as Promise<Record<string, boolean>>,
      ])
      const currentYear = new Date().getFullYear()
      // Determine the earliest year from payslip data or status data
      const allKnownYears = [
        ...(Array.isArray(yearsData) ? yearsData : []),
        ...Object.keys(statusData ?? {}),
      ].map(Number).filter((y) => !isNaN(y))
      const startYear = allKnownYears.length > 0
        ? Math.min(...allKnownYears)
        : currentYear
      // Generate all years from start to current so every year is visible and editable
      const fullYearRange = generateYearRange(startYear, currentYear)
      setYears(fullYearRange)
      setStatus(statusData ?? {})
    } catch {
      setYears([String(new Date().getFullYear())])
      setStatus({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = useCallback(async (year: string, isMarried: boolean) => {
    setSaving(year)
    try {
      // Use fetch directly to access 422 response body (fetchWrapper discards the `error` field)
      const csrfMeta = document.querySelector('meta[name="csrf-token"]')
      const csrfToken = csrfMeta?.getAttribute('content') ?? ''
      const response = await fetch('/api/finance/marriage-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
        credentials: 'include',
        body: JSON.stringify({ year: parseInt(year), is_married: isMarried }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        if (response.status === 422 && data?.error) {
          setErrorMessage(data.error)
          setErrorDialogOpen(true)
          return
        }
        throw new Error(data?.message ?? data?.error ?? 'Failed to update marriage status')
      }
      // Only update the specific year's status — don't cascade to other years
      setStatus((prev) => ({ ...prev, [year]: isMarried }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update marriage status'
      setErrorMessage(message)
      setErrorDialogOpen(true)
    } finally {
      setSaving(null)
    }
  }, [])

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Taxpayer Marriage Status</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your filing status for each tax year. This is used to determine filing status for
          tax preview calculations. By default, you are assumed not married.
        </p>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {loading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {years.map((year) => (
                <div key={year} className="flex items-center justify-between px-4 py-3">
                  <Label htmlFor={`marriage-${year}`} className="text-sm font-medium">
                    {year}
                  </Label>
                  <div className="flex items-center gap-2">
                    {saving === year && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      id={`marriage-${year}`}
                      checked={status[year] ?? false}
                      onCheckedChange={(checked) => handleToggle(year, checked)}
                      disabled={saving !== null}
                    />
                    <span className="text-sm text-muted-foreground w-20">
                      {status[year] ? 'Married' : 'Single'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MarriageStatusErrorDialog
        open={errorDialogOpen}
        errorMessage={errorMessage}
        onClose={() => setErrorDialogOpen(false)}
      />
    </>
  )
}

export default MarriageStatusSection
