/**
 * Standalone async helpers for the import flow.
 * These functions are outside the React component to keep the component clean
 * and avoid large useCallback dependency arrays.
 */

import { type AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import type { GeminiAccountBlock } from './ImportTransactions'

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

/** Upload a PDF file to S3 and return its hash */
export async function uploadPdfFile(accountId: number, file: File): Promise<string | null> {
  try {
    const form = new FormData()
    form.append('file', file)
    const result = (await fetchWrapper.post(`/api/finance/${accountId}/files`, form)) as {
      file_hash?: string
    }
    return result?.file_hash ?? null
  } catch {
    return null
  }
}

/** Attach an already-uploaded file (by hash) to additional accounts */
export async function attachFileToAccounts(
  fileHash: string,
  accountResults: Array<{ acct_id: number; statement_id: number }>,
): Promise<void> {
  for (const acct of accountResults) {
    try {
      await fetchWrapper.post(`/api/finance/${acct.acct_id}/files/attach`, {
        file_hash: fileHash,
        statement_id: acct.statement_id,
      })
    } catch (err) {
      console.error(`Failed to attach file to account ${acct.acct_id}:`, err)
    }
  }
}

export interface MultiImportPayloadAccount {
  acct_id: number | 'all'
  statementInfo?: GeminiAccountBlock['statementInfo']
  statementDetails: NonNullable<GeminiAccountBlock['statementDetails']>
  transactions: Array<{ t_date: string; t_amt: number; t_description: string; t_type?: string }>
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
    const transactions: Array<{ t_date: string; t_amt: number; t_description: string; t_type?: string }> = opts.importTransactions
      ? (block.transactions?.map((tx) => {
          const item: { t_date: string; t_amt: number; t_description: string; t_type?: string } = {
            t_date: tx.date,
            t_amt: tx.amount,
            t_description: tx.description,
          }
          if (tx.type !== undefined) item.t_type = tx.type
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
