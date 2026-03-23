import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  GenAiImportJobData,
  GenAiImportResultData,
  GenAiJobStatus,
} from '@/genai-processor/types'

const POLL_INTERVAL_MS = 3000
const MAX_BACKOFF_MS = 30000
const ACTIVE_STATUSES: GenAiJobStatus[] = ['pending', 'processing']

export function useGenAiJobPolling(jobId: number | null): {
  status: GenAiJobStatus | null
  results: GenAiImportResultData[]
  error: string | null
  job: GenAiImportJobData | null
  estimatedWait: string | undefined
  refetch: () => void
} {
  const [status, setStatus] = useState<GenAiJobStatus | null>(null)
  const [results, setResults] = useState<GenAiImportResultData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<GenAiImportJobData | null>(null)
  const [estimatedWait, setEstimatedWait] = useState<string | undefined>()

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(POLL_INTERVAL_MS)
  const consecutiveErrorsRef = useRef(0)

  const fetchJob = useCallback(async () => {
    if (!jobId) return

    try {
      const res = await fetch(`/api/genai/import/jobs/${jobId}`, {
        credentials: 'same-origin',
      })

      if (!res.ok) {
        consecutiveErrorsRef.current++
        if (res.status >= 500) {
          // Exponential backoff on server errors
          backoffRef.current = Math.min(
            backoffRef.current * 2,
            MAX_BACKOFF_MS,
          )
        }
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Request failed with status ${res.status}`)
        return
      }

      consecutiveErrorsRef.current = 0
      backoffRef.current = POLL_INTERVAL_MS

      const data: GenAiImportJobData = await res.json()
      setJob(data)
      setStatus(data.status)
      setResults(data.results ?? [])
      setError(data.error_message ?? null)

      if (data.status === 'queued_tomorrow' && data.scheduled_for) {
        setEstimatedWait(
          `Your file will be processed on ${data.scheduled_for}`,
        )
      } else {
        setEstimatedWait(undefined)
      }

      // Stop polling if we've reached a terminal status
      if (!ACTIVE_STATUSES.includes(data.status)) {
        if (intervalRef.current) {
          clearTimeout(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch (err) {
      consecutiveErrorsRef.current++
      backoffRef.current = Math.min(
        backoffRef.current * 2,
        MAX_BACKOFF_MS,
      )
      setError(err instanceof Error ? err.message : 'Polling failed')
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    // Initial fetch
    fetchJob()

    const poll = () => {
      intervalRef.current = setTimeout(async () => {
        await fetchJob()
        // Continue polling only if we should
        if (status === null || ACTIVE_STATUSES.includes(status)) {
          poll()
        }
      }, backoffRef.current)
    }

    poll()

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobId, fetchJob, status])

  return { status, results, error, job, estimatedWait, refetch: fetchJob }
}
