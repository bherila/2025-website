/** Per-account mapping: which user account to import this block into */
export interface AccountMapping {
  /** acct_id of the selected destination account (null = use page's accountId) */
  targetAccountId: number | null
}

export interface GeminiStatementInfo {
  brokerName?: string
  accountNumber?: string
  accountName?: string
  periodStart?: string
  periodEnd?: string
  closingBalance?: number
}

export interface GeminiStatementDetail {
  section: string
  line_item: string
  statement_period_value: number
  ytd_value: number
  is_percentage: boolean
}

export interface GeminiTransaction {
  date: string
  description: string
  amount: number
  type?: string
  symbol?: string
  quantity?: number
  price?: number
  commission?: number
  fee?: number
}

export interface GeminiLot {
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
}

/** Top-level parsed result from the GenAI import queue (result_json payload). */
export interface GeminiImportResponse {
  accounts: GeminiAccountBlock[]
  error?: string
}

/** A single account block within a Gemini response */
export interface GeminiAccountBlock {
  statementInfo?: GeminiStatementInfo
  statementDetails?: GeminiStatementDetail[]
  transactions?: GeminiTransaction[]
  lots?: GeminiLot[]
}

export interface GeminiFinanceAccountToolCall {
  toolName: 'addFinanceAccount'
  payload: GeminiAccountBlock
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }

  const isNegative = /^\(.*\)$/.test(trimmed)
  const normalized = trimmed
    .replace(/[,%]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return isNegative ? -parsed : parsed
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return undefined
    }

    const lowered = trimmed.toLowerCase()
    if (lowered === 'true') return true
    if (lowered === 'false') return false
  }

  return undefined
}

function normalizeDate(value: unknown): string | undefined {
  const normalized = normalizeString(value)
  if (!normalized) {
    return undefined
  }

  return normalized.split(/[ T]/)[0]
}

function normalizeStatementInfo(value: unknown): GeminiStatementInfo | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const statementInfo: GeminiStatementInfo = {}

  const brokerName = normalizeString(value.brokerName)
  if (brokerName !== undefined) statementInfo.brokerName = brokerName

  const accountNumber = normalizeString(value.accountNumber)
  if (accountNumber !== undefined) statementInfo.accountNumber = accountNumber

  const accountName = normalizeString(value.accountName)
  if (accountName !== undefined) statementInfo.accountName = accountName

  const periodStart = normalizeDate(value.periodStart)
  if (periodStart !== undefined) statementInfo.periodStart = periodStart

  const periodEnd = normalizeDate(value.periodEnd)
  if (periodEnd !== undefined) statementInfo.periodEnd = periodEnd

  const closingBalance = normalizeNumber(value.closingBalance)
  if (closingBalance !== undefined) statementInfo.closingBalance = closingBalance

  return Object.keys(statementInfo).length > 0 ? statementInfo : undefined
}

function normalizeGeminiAccountBlock(value: unknown): GeminiAccountBlock {
  const block = isRecord(value) ? value : {}
  const statementInfo = normalizeStatementInfo(block.statementInfo)

  const statementDetails: GeminiStatementDetail[] = Array.isArray(block.statementDetails)
    ? block.statementDetails
        .filter(isRecord)
        .map((detail): GeminiStatementDetail | undefined => {
          const section = normalizeString(detail.section)
          const line_item = normalizeString(detail.line_item)
          const statement_period_value = normalizeNumber(detail.statement_period_value)
          const ytd_value = normalizeNumber(detail.ytd_value)
          const is_percentage = normalizeBoolean(detail.is_percentage) ?? false

          if (
            !section ||
            !line_item ||
            statement_period_value === undefined ||
            ytd_value === undefined
          ) {
            return undefined
          }

          return {
            section,
            line_item,
            statement_period_value,
            ytd_value,
            is_percentage,
          }
        })
        .filter((detail): detail is GeminiStatementDetail => detail !== undefined)
    : []

  const transactions: GeminiTransaction[] = Array.isArray(block.transactions)
    ? block.transactions
        .filter(isRecord)
        .map((transaction): GeminiTransaction | undefined => {
          const date = normalizeDate(transaction.date)
          const description = normalizeString(transaction.description)
          const amount = normalizeNumber(transaction.amount)

          if (!date || !description || amount === undefined) {
            return undefined
          }

          const normalized: GeminiTransaction = {
            date,
            description,
            amount,
          }

          const type = normalizeString(transaction.type)
          if (type !== undefined) normalized.type = type

          const symbol = normalizeString(transaction.symbol)
          if (symbol !== undefined) normalized.symbol = symbol

          const quantity = normalizeNumber(transaction.quantity)
          if (quantity !== undefined) normalized.quantity = quantity

          const price = normalizeNumber(transaction.price)
          if (price !== undefined) normalized.price = price

          const commission = normalizeNumber(transaction.commission)
          if (commission !== undefined) normalized.commission = commission

          const fee = normalizeNumber(transaction.fee)
          if (fee !== undefined) normalized.fee = fee

          return normalized
        })
        .filter((transaction): transaction is GeminiTransaction => transaction !== undefined)
    : []

  const lots: GeminiLot[] = Array.isArray(block.lots)
    ? block.lots
        .filter(isRecord)
        .map((lot): GeminiLot | undefined => {
          const symbol = normalizeString(lot.symbol)
          const quantity = normalizeNumber(lot.quantity)
          const purchaseDate = normalizeDate(lot.purchaseDate)
          const costBasis = normalizeNumber(lot.costBasis)

          if (!symbol || quantity === undefined || !purchaseDate || costBasis === undefined) {
            return undefined
          }

          const normalized: GeminiLot = {
            symbol,
            quantity,
            purchaseDate,
            costBasis,
          }

          const description = normalizeString(lot.description)
          if (description !== undefined) normalized.description = description

          const costPerUnit = normalizeNumber(lot.costPerUnit)
          if (costPerUnit !== undefined) normalized.costPerUnit = costPerUnit

          const marketValue = normalizeNumber(lot.marketValue)
          if (marketValue !== undefined) normalized.marketValue = marketValue

          const unrealizedGainLoss = normalizeNumber(lot.unrealizedGainLoss)
          if (unrealizedGainLoss !== undefined) normalized.unrealizedGainLoss = unrealizedGainLoss

          const saleDate = normalizeDate(lot.saleDate)
          if (saleDate !== undefined) normalized.saleDate = saleDate

          const proceeds = normalizeNumber(lot.proceeds)
          if (proceeds !== undefined) normalized.proceeds = proceeds

          const realizedGainLoss = normalizeNumber(lot.realizedGainLoss)
          if (realizedGainLoss !== undefined) normalized.realizedGainLoss = realizedGainLoss

          return normalized
        })
        .filter((lot): lot is GeminiLot => lot !== undefined)
    : []

  return {
    ...(statementInfo ? { statementInfo } : {}),
    statementDetails,
    transactions,
    lots,
  }
}

export function normalizeGeminiFinanceAccountToolCall(value: unknown): GeminiFinanceAccountToolCall | null {
  if (!isRecord(value)) return null

  const toolName =
    value.toolName === 'addFinanceAccount'
      ? 'addFinanceAccount'
      : value.name === 'addFinanceAccount'
        ? 'addFinanceAccount'
        : null

  if (!toolName) return null

  const payload = 'payload' in value ? value.payload : value.args

  return {
    toolName,
    payload: normalizeGeminiAccountBlock(payload),
  }
}

export function normalizeGeminiImportResponse(value: unknown): GeminiImportResponse | null {
  if (!isRecord(value)) return null

  const error = typeof value.error === 'string' ? value.error : undefined

  if (Array.isArray(value.toolCalls)) {
    const toolCalls = value.toolCalls
      .map((toolCall) => normalizeGeminiFinanceAccountToolCall(toolCall))
      .filter((toolCall): toolCall is GeminiFinanceAccountToolCall => toolCall !== null)

    return {
      accounts: toolCalls.map((toolCall) => toolCall.payload),
      ...(error ? { error } : {}),
    }
  }

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
