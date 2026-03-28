import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { GenAiImportJobData } from '@/genai-processor/types'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  parsed: 'bg-green-100 text-green-800',
  imported: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
  queued_tomorrow: 'bg-orange-100 text-orange-800',
}

const ACTIVE_STATUSES = new Set(['pending', 'processing'])

const POLLING_INTERVAL_MS = 5_000

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function truncateFilename(name: string, max = 40): string {
  if (name.length <= max) return name
  return `…${name.slice(-(max - 1))}`
}

interface Props {
  accountId: number | 'all'
  onSelectJob: (jobId: number) => void
}

export default function GenAiJobsList({ accountId, onSelectJob }: Props) {
  const [jobs, setJobs] = useState<GenAiImportJobData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ job_type: 'finance_transactions' })
      if (accountId !== 'all') {
        params.set('acct_id', String(accountId))
      }
      const res = await fetch(`/api/genai/import/jobs?${params.toString()}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Failed to load jobs.')
        return
      }
      const body = (await res.json()) as { data?: GenAiImportJobData[] }
      setJobs(Array.isArray(body.data) ? body.data : [])
    } catch {
      setError('Network error loading jobs.')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteJobId === null) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/genai/import/jobs/${deleteJobId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== deleteJobId))
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Failed to delete job.')
      }
    } catch {
      setError('Network error deleting job.')
    } finally {
      setDeleting(false)
      setDeleteJobId(null)
    }
  }, [deleteJobId])

  // Initial fetch + polling when any job is active
  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE_STATUSES.has(j.status))
    if (!hasActive) return
    const id = setInterval(() => {
      void fetchJobs()
    }, POLLING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [jobs, fetchJobs])

  const jobToDelete = useMemo(() => jobs.find((j) => j.id === deleteJobId), [jobs, deleteJobId])

  if (!loading && jobs.length === 0 && !error) {
    return null
  }

  return (
    <>
      <AlertDialog open={deleteJobId !== null} onOpenChange={(open) => !open && setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AI Import Job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the import job
              {jobToDelete ? ` "${truncateFilename(jobToDelete.original_filename, 60)}"` : ''} and remove its file from
              storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-4 border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b">
          <span className="text-sm font-medium">Recent AI Import Jobs</span>
          <Button variant="ghost" size="sm" onClick={() => void fetchJobs()} disabled={loading}>
            {loading ? <Spinner className="h-3 w-3" /> : 'Refresh'}
          </Button>
        </div>

        {error && <div className="px-3 py-2 text-sm text-red-500">{error}</div>}

        {jobs.length === 0 && !error ? (
          <div className="px-3 py-3 text-sm text-gray-500">No import jobs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t first:border-t-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                    {truncateFilename(job.original_filename)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={`${STATUS_BADGE[job.status] ?? 'bg-gray-100 text-gray-800'} text-xs capitalize`}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{relativeTime(job.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {job.status === 'parsed' && (
                        <Button size="sm" variant="outline" onClick={() => onSelectJob(job.id)}>
                          Select
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => setDeleteJobId(job.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
