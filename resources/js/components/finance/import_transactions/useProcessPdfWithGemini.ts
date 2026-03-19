import { useCallback } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { AccountForMatching } from '@/lib/finance/accountMatcher'

import type { GeminiAccountBlock } from './importTypes'

/** Response structure from the Gemini PDF import endpoint */
export interface GeminiImportResponse extends GeminiAccountBlock {
  /** Multi-account responses include this array; single-account responses do not */
  accounts?: GeminiAccountBlock[]
  error?: string
}

interface UseProcessPdfWithGeminiOptions {
  accountId: number | 'all'
  accountsForMatching: AccountForMatching[]
  saveFileToS3: boolean
  setLoading: (v: boolean) => void
  setGeminiError: (v: string | null) => void
  setError: (v: string | null) => void
  setPdfData: (v: GeminiImportResponse | null) => void
  setPendingPdfFile: (v: File | null) => void
  setUploadedFileHash: (v: string | null) => void
}

/**
 * Returns a callback that sends the given PDF file to the Gemini API for parsing.
 * Optionally uploads the file to S3 for storage after successful parsing.
 */
export function useProcessPdfWithGemini({
  accountId,
  accountsForMatching,
  saveFileToS3,
  setLoading,
  setGeminiError,
  setError,
  setPdfData,
  setPendingPdfFile,
  setUploadedFileHash,
}: UseProcessPdfWithGeminiOptions) {
  const processPdfWithGemini = useCallback(
    async (pendingPdfFile: File | null) => {
      if (!pendingPdfFile) return
      setLoading(true)
      setGeminiError(null)
      setError(null)

      const formData = new FormData()
      formData.append('file', pendingPdfFile)
      // Include accounts context (name + last4 only, never full numbers) so the LLM
      // can map multi-account statements to the correct user accounts
      const accountsCtx = accountsForMatching
        .filter((a) => a.acct_number)
        .map((a) => ({
          name: a.acct_name,
          last4: a.acct_number!.replace(/\D/g, '').slice(-4),
        }))
      if (accountsCtx.length > 0) {
        formData.append('accounts', JSON.stringify(accountsCtx))
      }

      try {
        const response = (await fetchWrapper.post(
          '/api/finance/transactions/import-gemini',
          formData,
        )) as GeminiImportResponse
        if (response.error) {
          setGeminiError(response.error)
        } else {
          setPdfData(response)
          // Upload file to S3 once (for the current account); for multi-account imports
          // the file will be attached to additional accounts at import time
          // If accountId is 'all', we'll upload to the first matched account later
          if (saveFileToS3 && accountId !== 'all') {
            try {
              const uploadForm = new FormData()
              uploadForm.append('file', pendingPdfFile)
              const uploadResult = (await fetchWrapper.post(
                `/api/finance/${accountId}/files`,
                uploadForm,
              )) as { file_hash?: string }
              if (uploadResult?.file_hash) {
                setUploadedFileHash(uploadResult.file_hash)
              }
            } catch (uploadErr) {
              console.error('Failed to save file to S3:', uploadErr)
            }
          }
          setPendingPdfFile(null)
        }
      } catch (e) {
        setGeminiError(`Error processing PDF: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setLoading(false)
      }
    },
    [accountId, accountsForMatching, saveFileToS3, setLoading, setGeminiError, setError, setPdfData, setPendingPdfFile, setUploadedFileHash],
  )

  return { processPdfWithGemini }
}
