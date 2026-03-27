import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { type AccountForMatching, matchAccount } from '@/lib/finance/accountMatcher'

import type { AccountMapping, GeminiAccountBlock, GeminiImportResponse } from './importTypes'

interface UsePdfAccountMappingOptions {
  pdfData: GeminiImportResponse | null
  accountsForMatching: AccountForMatching[]
}

interface UsePdfAccountMappingResult {
  pdfAccountBlocks: GeminiAccountBlock[]
  pdfParsedData: AccountLineItem[] | null
  accountMappings: AccountMapping[]
  setAccountMappings: Dispatch<SetStateAction<AccountMapping[]>>
}

/**
 * Normalizes Gemini PDF data into account blocks, auto-detects account mappings
 * by matching parsed account numbers to user accounts, and parses single-account
 * PDF transactions into AccountLineItem format.
 */
export function usePdfAccountMapping({
  pdfData,
  accountsForMatching,
}: UsePdfAccountMappingOptions): UsePdfAccountMappingResult {
  const [accountMappings, setAccountMappings] = useState<AccountMapping[]>([])

  // Normalize the pdfData into a list of account blocks
  const pdfAccountBlocks = useMemo((): GeminiAccountBlock[] => {
    if (!pdfData) return []
    if (pdfData.accounts && pdfData.accounts.length > 0) return pdfData.accounts
    // Single-account: wrap in array, omitting undefined properties
    const block: GeminiAccountBlock = {}
    if (pdfData.statementInfo !== undefined) block.statementInfo = pdfData.statementInfo
    if (pdfData.statementDetails !== undefined) block.statementDetails = pdfData.statementDetails
    if (pdfData.transactions !== undefined) block.transactions = pdfData.transactions
    if (pdfData.lots !== undefined) block.lots = pdfData.lots
    return [block]
  }, [pdfData])

  // Auto-detect account mappings when pdfData changes
  useEffect(() => {
    if (!pdfData || pdfAccountBlocks.length === 0) {
      setAccountMappings([])
      return
    }
    const mappings: AccountMapping[] = pdfAccountBlocks.map((block) => {
      const parsedNumber = block.statementInfo?.accountNumber ?? null
      const parsedName = block.statementInfo?.accountName ?? null
      const matchedId = matchAccount(parsedNumber, parsedName, accountsForMatching)
      return { targetAccountId: matchedId }
    })
    setAccountMappings(mappings)
  }, [pdfData, pdfAccountBlocks, accountsForMatching])

  // Parse PDF data to AccountLineItem format (for single-account or text-based imports)
  const pdfParsedData = useMemo((): AccountLineItem[] | null => {
    // For multi-account PDFs we show per-block previews, not a flat list
    if (pdfAccountBlocks.length > 1) return null
    const transactions = pdfAccountBlocks[0]?.transactions ?? pdfData?.transactions
    if (!transactions || transactions.length === 0) return null
    return transactions.map((tx) => {
      const dateStr = tx.date ? tx.date.split(/[ T]/)[0] : ''
      return AccountLineItemSchema.parse({
        t_date: dateStr,
        t_description: tx.description,
        t_amt: tx.amount,
        t_type: tx.type,
      })
    })
  }, [pdfData, pdfAccountBlocks])

  return { pdfAccountBlocks, pdfParsedData, accountMappings, setAccountMappings }
}
