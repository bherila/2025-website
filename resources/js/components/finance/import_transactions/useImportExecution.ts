import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { fetchWrapper } from '@/fetchWrapper'

import {
  buildImportBackUrl,
  buildMultiImportPayload,
  CHUNK_SIZE,
  chunkArray,
} from './importHelpers'
import type { AccountMapping, GeminiAccountBlock, GeminiImportResponse } from './importTypes'

interface UseImportExecutionOptions {
  accountId: number | 'all'
  filterDuplicates: (transactions: AccountLineItem[]) => AccountLineItem[]
  onImportFinished: () => void
  pdfData: GeminiImportResponse | null
  pdfAccountBlocks: GeminiAccountBlock[]
  accountMappings: AccountMapping[]
  importTransactions: boolean
  attachAsStatement: boolean
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
 * - PDF import via Gemini using the unified accounts-array response
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
}: UseImportExecutionOptions): UseImportExecutionResult {
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 })
  const [importError, setImportError] = useState<string | null>(null)
  const [dataToImport, setDataToImport] = useState<AccountLineItem[]>([])
  const [importedStatementId, setImportedStatementId] = useState<number | undefined>(undefined)

  const processChunksRef = useRef<(chunks: AccountLineItem[][], chunkIndex: number, statementId?: number) => Promise<void>>(undefined)

  const processChunks = useCallback(
    async (chunks: AccountLineItem[][], chunkIndex: number, statementId?: number) => {
      if (chunkIndex >= chunks.length) {
        setIsImporting(false)
        window.location.assign(buildImportBackUrl(accountId))
        return
      }

      const chunk = chunks[chunkIndex]
      if (!chunk) {
        setIsImporting(false)
        window.location.assign(buildImportBackUrl(accountId))
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
        await processChunksRef.current?.(chunks, chunkIndex + 1, statementId)
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        setImportError(`Failed to import chunk ${chunkIndex + 1}: ${errorMessage}`)
      }
    },
    [accountId],
  )

  useLayoutEffect(() => {
    processChunksRef.current = processChunks
  })

  const handleImport = useCallback(
    async (importData: AccountLineItem[], statementToImport: IbStatementData | null) => {
      if (importData.length > 0) {
        z.array(AccountLineItemSchema).parse(importData)
      }
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
          return
        }
      }

      // PDF import — always use the unified multi-import-pdf endpoint
      if (pdfData) {
        const payload = buildMultiImportPayload(pdfAccountBlocks, accountMappings, accountId, {
          importTransactions,
          attachAsStatement,
        })

        // Guard: all account IDs in the payload must be resolved to numbers.
        const unresolvedBlock = payload.find((p) => p.acct_id === 'all')
        if (unresolvedBlock) {
          setImportError(
            'One or more PDF account blocks could not be matched to a specific account. Please select an account for each block before importing.',
          )
          setIsImporting(false)
          return
        }

        const hasAnyContent =
          attachAsStatement ||
          payload.some((p) => p.transactions.length > 0 || p.statementDetails.length > 0 || p.lots.length > 0)

        if (hasAnyContent) {
          try {
            const response = (await fetchWrapper.post('/api/finance/multi-import-pdf', {
              accounts: payload,
            })) as { accounts: Array<{ acct_id: number; statement_id: number }> }

            if (response.accounts?.length > 0) {
              statementId = response.accounts[0]!.statement_id
              setImportedStatementId(statementId)
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e)
            setImportError(`Failed to import PDF statement: ${errorMessage}`)
            setIsImporting(false)
            return
          }
        }
      }

      // Filter out duplicates and import remaining transactions.
      // For PDF imports, transactions are already submitted via multi-import-pdf, so skip here.
      const isPdfImport = !!pdfData
      const transactionsToProcess = importTransactions && !isPdfImport ? importData : []
      const newTransactions = filterDuplicates(transactionsToProcess)

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
