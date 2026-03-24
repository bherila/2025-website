/** Per-account mapping: which user account to import this block into */
export interface AccountMapping {
  /** acct_id of the selected destination account (null = use page's accountId) */
  targetAccountId: number | null
}

/**
 * Top-level response from the Gemini PDF import endpoint (synchronous legacy)
 * or from a parsed GenAI queue result's result_json (async queue).
 * Extends GeminiAccountBlock for single-account PDFs; includes an `accounts`
 * array for multi-account PDFs.
 */
export interface GeminiImportResponse extends GeminiAccountBlock {
  /** Multi-account mode: response is split into per-account blocks */
  accounts?: GeminiAccountBlock[]
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
