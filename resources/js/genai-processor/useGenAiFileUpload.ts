import { useCallback, useState } from 'react'

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
        const uploadRes = await fetch('/api/genai/import/request-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || 'application/pdf',
            file_size: file.size,
          }),
        })

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}))
          throw new Error(
            data.error || data.errors?.filename?.[0] || 'Failed to request upload URL',
          )
        }

        const { signed_url, s3_key } = await uploadRes.json()

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
        const jobRes = await fetch('/api/genai/import/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            s3_key,
            original_filename: file.name,
            file_size_bytes: file.size,
            mime_type: file.type || 'application/pdf',
            job_type: options.jobType,
            context: options.context,
            acct_id: options.acctId,
          }),
        })

        if (!jobRes.ok) {
          const data = await jobRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to create import job')
        }

        const result = await jobRes.json()
        return {
          jobId: result.job_id,
          status: result.status as GenAiJobStatus,
          deduplicated: result.deduplicated,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        setError(msg)
        throw err
      } finally {
        setUploading(false)
      }
    },
    [options.jobType, options.acctId, options.context],
  )

  return { upload, uploading, error }
}
