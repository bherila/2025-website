import { useCallback, useState } from 'react'
import { z } from 'zod'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { fetchWrapper } from '@/fetchWrapper'

import {
  attachFileToAccounts,
  buildImportBackUrl,
  buildMultiImportPayload,
  CHUNK_SIZE,
  chunkArray,
  uploadPdfFile,
} from './importHelpers'
import type { AccountMapping, GeminiAccountBlock } from './importTypes'
import type { GeminiImportResponse } from './useProcessPdfWithGemini'

interface UseImportExecutionOptions {
  accountId: number | 'all'
  filterDuplicates: (transactions: AccountLineItem[]) => AccountLineItem[]
  onImportFinished: () => void
  pdfData: GeminiImportResponse | null
  pdfAccountBlocks: GeminiAccountBlock[]
  accountMappings: AccountMapping[]
  importTransactions: boolean
  attachAsStatement: boolean
  saveFileToS3: boolean
  pendingPdfFile: File | null
  uploadedFileHash: string | null
  setLoading: (v: boolean) => void
  setUploadedFileHash: (v: string | null) => void
}

interface UseImportExecutionResult {
  isImporting: boolean
  setIsImporting: (v: boolean) => void
  importProgress: { processed: number; total: number }
  importError: string | null
  handleImport: (data: AccountLineItem[], statement: IbStatementData | null) => Promise<void>
  retryImport: () => Promise<void>
}

/**
 * Manages the entire import execution lifecycle:
 * - IB statement import
 * - Multi-account PDF import via Gemini
 * - Single-account PDF import (legacy)
 * - Transaction chunking and sequential upload
 * - Duplicate filtering
 * - Retry on failure
 */
export function useImportExecution({
  accountId,
  filterDuplicates,
  onImportFinished,
  pdfData,
  pdfAccountBlocks,
  accountMappings,
  importTransactions,
  attachAsStatement,
  saveFileToS3,
  pendingPdfFile,
  uploadedFileHash,
  setLoading,
  setUploadedFileHash,
}: UseImportExecutionOptions): UseImportExecutionResult {
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 })
  const [importError, setImportError] = useState<string | null>(null)
  const [dataToImport, setDataToImport] = useState<AccountLineItem[]>([])
  const [importedStatementId, setImportedStatementId] = useState<number | undefined>(undefined)

  const processChunks = useCallback(
    async (chunks: AccountLineItem[][], chunkIndex: number, statementId?: number) => {
      if (chunkIndex >= chunks.length) {
        setIsImporting(false)
        window.location.href = buildImportBackUrl(accountId)
        return
      }

      const chunk = chunks[chunkIndex]
      if (!chunk) {
        setIsImporting(false)
        window.location.href = buildImportBackUrl(accountId)
        return
      }

      try {
        if (accountId === 'all') {
          throw new Error('Cannot import to "all accounts" - please select a specific account')
        }

        await fetchWrapper.post(`/api/finance/${accountId}/line_items`, {
          transactions: chunk,
          statement_id: statementId,
        })
        setImportProgress((prev) => ({ ...prev, processed: prev.processed + chunk.length }))
        await processChunks(chunks, chunkIndex + 1, statementId)
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        setImportError(`Failed to import chunk ${chunkIndex + 1}: ${errorMessage}`)
      }
    },
    [accountId],
  )

  const handleImport = useCallback(
    async (importData: AccountLineItem[], statementToImport: IbStatementData | null) => {
      if (importData.length > 0) {
        z.array(AccountLineItemSchema).parse(importData)
      }
      setLoading(true)
      setIsImporting(true)
      setImportError(null)

      let statementId: number | undefined

      // Import IB statement first (if available)
      if (statementToImport) {
        if (accountId === 'all') {
          setImportError(
            'IB statement import requires a specific account. Please navigate to a specific account to import IB statements.',
          )
          setIsImporting(false)
          setLoading(false)
          return
        }

        try {
          const response = (await fetchWrapper.post(`/api/finance/${accountId}/import-ib-statement`, {
            statement: statementToImport,
          })) as { statement_id: number }
          statementId = response.statement_id
          setImportedStatementId(statementId)
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          setImportError(`Failed to import statement: ${errorMessage}`)
          setIsImporting(false)
          setLoading(false)
          return
        }
      }

      // Multi-account PDF import
      const isMultiAccount = pdfData && pdfAccountBlocks.length > 0
      if (isMultiAccount) {
        const payload = buildMultiImportPayload(pdfAccountBlocks, accountMappings, accountId, {
          importTransactions,
          attachAsStatement,
        })
        const hasAnyContent = payload.some(
          (p) => p.transactions.length > 0 || p.statementDetails.length > 0 || p.lots.length > 0,
        )

        if (hasAnyContent) {
          try {
            const response = (await fetchWrapper.post('/api/finance/multi-import-pdf', {
              accounts: payload,
            })) as { accounts: Array<{ acct_id: number; statement_id: number }> }

            if (response.accounts?.length > 0) {
              statementId = response.accounts[0]!.statement_id
              setImportedStatementId(statementId)
            }

            // Upload PDF once and attach to all accounts
            if (saveFileToS3 && pendingPdfFile && response.accounts?.length > 0) {
              const firstAccountId = response.accounts[0]!.acct_id
              const fileHash = uploadedFileHash ?? (await uploadPdfFile(firstAccountId, pendingPdfFile))
              if (fileHash) {
                setUploadedFileHash(fileHash)
                await attachFileToAccounts(fileHash, response.accounts.slice(1))
              }
            } else if (saveFileToS3 && uploadedFileHash && response.accounts?.length > 1) {
              await attachFileToAccounts(uploadedFileHash, response.accounts.slice(1))
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e)
            setImportError(`Failed to import multi-account statement: ${errorMessage}`)
            setIsImporting(false)
            setLoading(false)
            return
          }
        }
      } else if (pdfData) {
        // Single-account legacy flow
        if (accountId === 'all') {
          setImportError(
            'Single-account PDF import requires a specific account. The multi-account import should have been used instead.',
          )
          setIsImporting(false)
          setLoading(false)
          return
        }

        const hasDetails = (pdfData.statementDetails?.length ?? 0) > 0
        const hasLots = (pdfData.lots?.length ?? 0) > 0
        if ((attachAsStatement || hasLots) && (hasDetails || hasLots)) {
          try {
            const response = (await fetchWrapper.post(`/api/finance/${accountId}/import-pdf-statement`, {
              statementInfo: pdfData.statementInfo,
              statementDetails: attachAsStatement ? pdfData.statementDetails : [],
              lots: pdfData.lots,
            })) as { statement_id: number }
            statementId = response.statement_id
            setImportedStatementId(statementId)
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e)
            setImportError(`Failed to import statement details: ${errorMessage}`)
            setIsImporting(false)
            setLoading(false)
            return
          }
        }
      }

      // Filter out duplicates and import remaining transactions
      const transactionsToProcess = importTransactions ? importData : []
      const newTransactions = filterDuplicates(transactionsToProcess)

      setLoading(false)

      if (newTransactions.length > 0) {
        setDataToImport(newTransactions)
        setImportProgress({ processed: 0, total: newTransactions.length })
        const chunks = chunkArray(newTransactions, CHUNK_SIZE)
        await processChunks(chunks, 0, statementId)
      } else {
        setIsImporting(false)
        onImportFinished()
      }
    },
    [
      accountId,
      filterDuplicates,
      processChunks,
      onImportFinished,
      pdfData,
      pdfAccountBlocks,
      accountMappings,
      attachAsStatement,
      importTransactions,
      saveFileToS3,
      uploadedFileHash,
      pendingPdfFile,
      setLoading,
      setUploadedFileHash,
    ],
  )

  const retryImport = useCallback(async () => {
    if (dataToImport.length > 0) {
      setImportProgress({ processed: 0, total: dataToImport.length })
      const chunks = chunkArray(dataToImport, CHUNK_SIZE)
      await processChunks(chunks, 0, importedStatementId)
    }
  }, [dataToImport, importedStatementId, processChunks])

  return {
    isImporting,
    setIsImporting,
    importProgress,
    importError,
    handleImport,
    retryImport,
  }
}
