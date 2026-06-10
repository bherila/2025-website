import { useCallback, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type {
  GenAiJobStatus,
  GenAiJobType,
} from '@/genai-processor/types'

export interface GenAiUploadOptions {
  jobType: GenAiJobType
  acctId?: number
  context?: Record<string, unknown>
}

export interface GenAiUploadResult {
  jobId: number
  status: GenAiJobStatus
  deduplicated?: boolean
}

function normalizeError(err: unknown, fallback: string): Error {
  if (err instanceof Error) {
    return err
  }

  if (typeof err === 'string' && err.trim() !== '') {
    return new Error(err)
  }

  return new Error(fallback)
}

export function useGenAiFileUpload(options: GenAiUploadOptions): {
  upload: (file: File) => Promise<GenAiUploadResult>
  uploading: boolean
  error: string | null
} {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File): Promise<GenAiUploadResult> => {
      setUploading(true)
      setError(null)

      try {
        // Step 1: Request a pre-signed upload URL
        const uploadData = await fetchWrapper.post('/api/genai/import/request-upload', {
          filename: file.name,
          content_type: file.type || 'application/pdf',
          file_size: file.size,
          job_type: options.jobType,
        })
        const { signed_url, s3_key } = uploadData

        if (typeof signed_url !== 'string' || typeof s3_key !== 'string') {
          throw new Error('Invalid upload response: missing signed_url or s3_key')
        }

        // Step 2: Upload file directly to S3 using the pre-signed URL
        const s3Res = await fetch(signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/pdf' },
          body: file,
        })

        if (!s3Res.ok) {
          throw new Error('Failed to upload file to storage')
        }

        // Step 3: Register the import job
        const result = await fetchWrapper.post('/api/genai/import/jobs', {
          s3_key,
          original_filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/pdf',
          job_type: options.jobType,
          context: options.context,
          acct_id: options.acctId,
        })

        if (typeof result.job_id !== 'number') {
          throw new Error('Invalid job response: missing or invalid job_id')
        }

        return {
          jobId: result.job_id,
          status: result.status as GenAiJobStatus,
          deduplicated: result.deduplicated,
        }
      } catch (err) {
        const error = normalizeError(err, 'Upload failed')
        setError(error.message)
        throw error
      } finally {
        setUploading(false)
      }
    },
    [options.jobType, options.acctId, options.context],
  )

  return { upload, uploading, error }
}
