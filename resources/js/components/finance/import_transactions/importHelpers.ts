/**
 * Standalone async helpers for the import flow.
 * These functions are outside the React component to keep the component clean
 * and avoid large useCallback dependency arrays.
 */

import { type AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import type { GeminiAccountBlock } from './importTypes'

const CHUNK_SIZE = 100

/** Build the back-navigation URL after a successful import */
export function buildImportBackUrl(accountId: number | 'all'): string {
  return accountId === 'all'
    ? '/finance/account/all/transactions'
    : `/finance/account/${accountId}/transactions`
}

/** Split an array into fixed-size chunks */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export interface ChunkProgressCallback {
  (processed: number): void
}

/** Post chunks of transactions to the API sequentially */
export async function postTransactionChunks(
  accountId: number,
  chunks: AccountLineItem[][],
  statementId: number | undefined,
  onProgress: ChunkProgressCallback,
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    await fetchWrapper.post(`/api/finance/${accountId}/line_items`, {
      transactions: chunk,
      statement_id: statementId,
    })
    onProgress((i + 1) * chunk.length)
  }
}

export interface MultiImportPayloadAccount {
  acct_id: number | 'all'
  statementInfo?: GeminiAccountBlock['statementInfo']
  statementDetails: NonNullable<GeminiAccountBlock['statementDetails']>
  transactions: Array<{
    t_date: string
    t_amt: number
    t_description: string
    t_type?: string
    t_symbol?: string
    t_qty?: number
    t_price?: number
    t_commission?: number
    t_fee?: number
  }>
  lots: NonNullable<GeminiAccountBlock['lots']>
}

/** Build the accounts payload for a multi-account PDF import */
export function buildMultiImportPayload(
  blocks: GeminiAccountBlock[],
  accountMappings: Array<{ targetAccountId: number | null }>,
  defaultAccountId: number | 'all',
  opts: { importTransactions: boolean; attachAsStatement: boolean },
): MultiImportPayloadAccount[] {
  return blocks.map((block, idx): MultiImportPayloadAccount => {
    const mapping = accountMappings[idx]
    const targetId: number | 'all' = mapping?.targetAccountId ?? defaultAccountId
    const lots: NonNullable<GeminiAccountBlock['lots']> = block.lots ?? []
    const statementDetails: NonNullable<GeminiAccountBlock['statementDetails']> = opts.attachAsStatement
      ? (block.statementDetails ?? [])
      : []
    const transactions: Array<{
      t_date: string
      t_amt: number
      t_description: string
      t_type?: string
      t_symbol?: string
      t_qty?: number
      t_price?: number
      t_commission?: number
      t_fee?: number
    }> = opts.importTransactions
      ? (block.transactions?.map((tx) => {
          const item: {
            t_date: string
            t_amt: number
            t_description: string
            t_type?: string
            t_symbol?: string
            t_qty?: number
            t_price?: number
            t_commission?: number
            t_fee?: number
          } = {
            t_date: tx.date,
            t_amt: tx.amount,
            t_description: tx.description,
          }
          if (tx.type !== undefined) item.t_type = tx.type
          if (tx.symbol !== undefined) item.t_symbol = tx.symbol
          if (tx.quantity !== undefined) item.t_qty = tx.quantity
          if (tx.price !== undefined) item.t_price = tx.price
          if (tx.commission !== undefined) item.t_commission = tx.commission
          if (tx.fee !== undefined) item.t_fee = tx.fee
          return item
        }) ?? [])
      : []
    return {
      acct_id: targetId,
      statementInfo: block.statementInfo,
      statementDetails,
      transactions,
      lots,
    }
  })
}

export { CHUNK_SIZE }
