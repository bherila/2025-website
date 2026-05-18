import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type {
  GenAiImportJobData,
  GenAiImportResultData,
  GenAiJobStatus,
} from '@/genai-processor/types'

const POLL_INTERVAL_MS = 3000
const MAX_BACKOFF_MS = 30000
const ACTIVE_STATUSES: GenAiJobStatus[] = ['pending', 'processing']

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message
  }

  if (typeof err === 'string' && err.trim() !== '') {
    return err
  }

  return fallback
}

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
  const statusRef = useRef<GenAiJobStatus | null>(null)

  const fetchJob = useCallback(async () => {
    if (!jobId) return

    try {
      const data = await fetchWrapper.get(`/api/genai/import/jobs/${jobId}`) as GenAiImportJobData
      consecutiveErrorsRef.current = 0
      backoffRef.current = POLL_INTERVAL_MS
      setJob(data)
      setStatus(data.status)
      statusRef.current = data.status
      setResults(data.results ?? [])
      setError(data.error_message ?? null)

      if (data.status === 'queued_tomorrow' && data.scheduled_for) {
        setEstimatedWait(
          `Your file will be processed on ${data.scheduled_for}`,
        )
      } else {
        setEstimatedWait(undefined)
      }

      // Stop polling immediately if we've reached a terminal status
      if (!ACTIVE_STATUSES.includes(data.status) && intervalRef.current) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
    } catch (err) {
      consecutiveErrorsRef.current++
      backoffRef.current = Math.min(
        backoffRef.current * 2,
        MAX_BACKOFF_MS,
      )
      setError(errorMessage(err, 'Polling failed'))
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    // Reset stale state from any previous job before starting a new fetch
    setStatus(null)
    setResults([])
    setError(null)
    setJob(null)
    setEstimatedWait(undefined)
    statusRef.current = null
    backoffRef.current = POLL_INTERVAL_MS
    consecutiveErrorsRef.current = 0

    // Clear any in-flight interval from the previous job
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }

    fetchJob()

    const poll = () => {
      intervalRef.current = setTimeout(async () => {
        await fetchJob()
        if (statusRef.current === null || ACTIVE_STATUSES.includes(statusRef.current)) {
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
  }, [jobId, fetchJob])

  return { status, results, error, job, estimatedWait, refetch: fetchJob }
}
