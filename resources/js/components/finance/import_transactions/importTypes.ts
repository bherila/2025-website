/** Per-account mapping: which user account to import this block into */
export interface AccountMapping {
  /** acct_id of the selected destination account (null = use page's accountId) */
  targetAccountId: number | null
}

/** Top-level parsed result from the GenAI import queue (result_json payload). */
export interface GeminiImportResponse {
  accounts: GeminiAccountBlock[]
  error?: string
}

/** A single account block within a Gemini response */
export interface GeminiAccountBlock {
  statementInfo?: {
    brokerName?: string
    accountNumber?: string
    accountName?: string
    periodStart?: string
    periodEnd?: string
    closingBalance?: number
  }
  statementDetails?: Array<{
    section: string
    line_item: string
    statement_period_value: number
    ytd_value: number
    is_percentage: boolean
  }>
  transactions?: Array<{
    date: string
    description: string
    amount: number
    type?: string
    symbol?: string
    quantity?: number
    price?: number
    commission?: number
    fee?: number
  }>
  lots?: Array<{
    symbol: string
    description?: string
    quantity: number
    purchaseDate: string
    costBasis: number
    costPerUnit?: number
    marketValue?: number
    unrealizedGainLoss?: number
    saleDate?: string
    proceeds?: number
    realizedGainLoss?: number
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeGeminiAccountBlock(value: unknown): GeminiAccountBlock {
  const block = isRecord(value) ? value : {}

  return {
    ...(isRecord(block.statementInfo)
      ? { statementInfo: block.statementInfo as NonNullable<GeminiAccountBlock['statementInfo']> }
      : {}),
    statementDetails: Array.isArray(block.statementDetails)
      ? (block.statementDetails as NonNullable<GeminiAccountBlock['statementDetails']>)
      : [],
    transactions: Array.isArray(block.transactions)
      ? (block.transactions as NonNullable<GeminiAccountBlock['transactions']>)
      : [],
    lots: Array.isArray(block.lots) ? (block.lots as NonNullable<GeminiAccountBlock['lots']>) : [],
  }
}

export function normalizeGeminiImportResponse(value: unknown): GeminiImportResponse | null {
  if (!isRecord(value)) return null

  const error = typeof value.error === 'string' ? value.error : undefined

  if (Array.isArray(value.accounts)) {
    return {
      accounts: value.accounts.map((account) => normalizeGeminiAccountBlock(account)),
      ...(error ? { error } : {}),
    }
  }

  if (
    'statementInfo' in value ||
    'statementDetails' in value ||
    'transactions' in value ||
    'lots' in value
  ) {
    return {
      accounts: [normalizeGeminiAccountBlock(value)],
      ...(error ? { error } : {}),
    }
  }

  return null
}
