import { useMemo } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import type { IbStatementData } from '@/data/finance/parseIbCsv'

import type { GeminiAccountBlock } from './importTypes'

interface UseImportSummaryOptions {
  data: AccountLineItem[] | null
  pdfParsedData: AccountLineItem[] | null
  pdfAccountBlocks: GeminiAccountBlock[]
  statement: IbStatementData | null
  importTransactions: boolean
  attachAsStatement: boolean
}

interface UseImportSummaryResult {
  effectiveData: AccountLineItem[] | null
  hasStatementDetails: boolean
  hasLots: boolean
  transactionCount: number
  multiAccountTransactionCount: number
  importButtonText: string
  hasImportableContent: boolean
}

/**
 * Computes derived summary values for the import UI:
 * effective data, statement/lot flags, button text, and importability check.
 */
export function useImportSummary({
  data,
  pdfParsedData,
  pdfAccountBlocks,
  statement,
  importTransactions,
  attachAsStatement,
}: UseImportSummaryOptions): UseImportSummaryResult {
  // Combine data from text parsing or PDF parsing
  const effectiveData = data ?? pdfParsedData

  // Check if we have statement details or lots from PDF (aggregated across all blocks)
  const hasStatementDetails = pdfAccountBlocks.some((b) => (b.statementDetails?.length ?? 0) > 0)
  const hasLots = pdfAccountBlocks.some((b) => (b.lots?.length ?? 0) > 0)
  const transactionCount = effectiveData?.length ?? 0

  // For multi-account PDF: total transaction count across all blocks
  const multiAccountTransactionCount = useMemo(() => {
    if (pdfAccountBlocks.length <= 1) return 0
    return pdfAccountBlocks.reduce((sum, b) => sum + (b.transactions?.length ?? 0), 0)
  }, [pdfAccountBlocks])

  // Build import button text
  const importButtonText = useMemo(() => {
    const parts: string[] = []
    const isMulti = pdfAccountBlocks.length > 1
    if (isMulti) {
      if (importTransactions && multiAccountTransactionCount > 0) {
        parts.push(`${multiAccountTransactionCount} Transaction${multiAccountTransactionCount !== 1 ? 's' : ''}`)
      }
      const statementCount = pdfAccountBlocks.filter(
        (b) => attachAsStatement && (b.statementDetails?.length ?? 0) > 0,
      ).length
      if (statementCount > 0) parts.push(`${statementCount} Statement${statementCount !== 1 ? 's' : ''}`)
      const lotsCount = pdfAccountBlocks.reduce((s, b) => s + (b.lots?.length ?? 0), 0)
      if (lotsCount > 0) parts.push(`${lotsCount} Lot${lotsCount !== 1 ? 's' : ''}`)
    } else {
      if (importTransactions && transactionCount > 0) {
        parts.push(`${transactionCount} Transaction${transactionCount !== 1 ? 's' : ''}`)
      }
      if (statement) {
        parts.push('1 Statement')
      } else if (attachAsStatement && hasStatementDetails) {
        parts.push('1 Statement')
      }
      if (hasLots) {
        const lotsCount = pdfAccountBlocks[0]?.lots?.length ?? 0
        parts.push(`${lotsCount} Lot${lotsCount !== 1 ? 's' : ''}`)
      }
    }
    if (parts.length === 0) return 'Import'
    return `Import ${parts.join(' and ')}`
  }, [
    pdfAccountBlocks,
    importTransactions,
    attachAsStatement,
    multiAccountTransactionCount,
    transactionCount,
    statement,
    hasStatementDetails,
    hasLots,
  ])

  // Determine if there is anything to import
  const hasImportableContent =
    pdfAccountBlocks.length > 1
      ? pdfAccountBlocks.some(
          (b) =>
            (importTransactions && (b.transactions?.length ?? 0) > 0) ||
            (attachAsStatement && (b.statementDetails?.length ?? 0) > 0) ||
            (b.lots?.length ?? 0) > 0,
        )
      : (importTransactions && transactionCount > 0) ||
        (attachAsStatement && hasStatementDetails) ||
        hasLots ||
        !!statement

  return {
    effectiveData,
    hasStatementDetails,
    hasLots,
    transactionCount,
    multiAccountTransactionCount,
    importButtonText,
    hasImportableContent,
  }
}
