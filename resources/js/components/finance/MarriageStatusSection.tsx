'use client'

import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fetchWrapper } from '@/fetchWrapper'

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
      const availableYears = yearsData.length > 0 ? yearsData : [String(new Date().getFullYear())]
      setYears(availableYears)
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
      <Card>
        <CardHeader>
          <CardTitle>Taxpayer Marriage Status</CardTitle>
          <CardDescription>
            Manage your filing status for each tax year. This is used to determine filing status for
            tax preview calculations. By default, you are assumed not married. If a year is not
            shown, the most recent year&apos;s status before it will be used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {years.map((year) => (
                <div key={year} className="flex items-center justify-between">
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
        </CardContent>
      </Card>

      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unable to Update Status</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <DialogFooter>
            <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default MarriageStatusSection
