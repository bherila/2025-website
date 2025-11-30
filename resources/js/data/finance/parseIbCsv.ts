/**
 * Interactive Brokers CSV Parser
 *
 * Parses IB activity statement CSV exports into AccountLineItem format.
 *
 * IB CSV format features:
 * - Multi-section CSV with varying column structures per section
 * - First column: Section name (Trades, Fees, Interest, etc.)
 * - Second column: Row type (Header, Data, Total, SubTotal, Notes)
 * - Trades section contains stock and options transactions
 * - Financial Instrument Information section contains option details
 */
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseMultiSectionCsv, getSection, type ParsedMultiCsv } from '@/lib/multiCsvParser'
import { parseDate } from '@/lib/DateHelper'
import { parseOptionDescription } from '@/data/finance/StockOptionUtil'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface IbTradeRow {
  DataDiscriminator: string
  'Asset Category': string
  Currency: string
  Symbol: string
  'Date/Time': string
  Quantity: string
  'T. Price': string
  'C. Price': string
  Proceeds: string
  'Comm/Fee': string
  Basis: string
  'Realized P/L': string
  'MTM P/L': string
  Code: string
}

export interface IbFinancialInstrumentRow {
  'Asset Category': string
  Symbol: string
  Description: string
  Conid: string
  'Security ID'?: string
  Underlying?: string
  'Listing Exch': string
  Multiplier: string
  Type?: string // For stocks: ADR, COMMON, etc.
  Expiry?: string // For options
  'Delivery Month'?: string
  Strike?: string
  Code?: string
}

export interface IbInterestRow {
  Currency: string
  Date: string
  Description: string
  Amount: string
}

export interface IbFeeRow {
  Subtitle: string
  Currency: string
  Date: string
  Description: string
  Amount: string
}

// Statement-level data types
export interface IbStatementInfo {
  brokerName: string
  period: string
  periodStart: string | null
  periodEnd: string | null
  whenGenerated: string | null
  accountName: string | null
  accountNumber: string | null
}

export interface IbNavRow {
  assetClass: string
  priorTotal: number | null
  currentLong: number | null
  currentShort: number | null
  currentTotal: number | null
  changeAmount: number | null
}

export interface IbCashReportRow {
  currency: string
  lineItem: string
  total: number | null
  securities: number | null
  futures: number | null
}

export interface IbPositionRow {
  assetCategory: string
  currency: string
  symbol: string
  quantity: number | null
  multiplier: number
  costPrice: number | null
  costBasis: number | null
  closePrice: number | null
  marketValue: number | null
  unrealizedPl: number | null
  optType: 'call' | 'put' | null
  optStrike: string | null
  optExpiration: string | null
}

export interface IbPerformanceRow {
  perfType: 'mtm' | 'realized_unrealized'
  assetCategory: string
  symbol: string
  priorQuantity: number | null
  currentQuantity: number | null
  priorPrice: number | null
  currentPrice: number | null
  // MTM fields
  mtmPlPosition: number | null
  mtmPlTransaction: number | null
  mtmPlCommissions: number | null
  mtmPlOther: number | null
  mtmPlTotal: number | null
  // Realized/Unrealized fields
  costAdj: number | null
  realizedStProfit: number | null
  realizedStLoss: number | null
  realizedLtProfit: number | null
  realizedLtLoss: number | null
  realizedTotal: number | null
  unrealizedStProfit: number | null
  unrealizedStLoss: number | null
  unrealizedLtProfit: number | null
  unrealizedLtLoss: number | null
  unrealizedTotal: number | null
  totalPl: number | null
}

export interface IbStatementData {
  info: IbStatementInfo
  totalNav: number | null
  nav: IbNavRow[]
  cashReport: IbCashReportRow[]
  positions: IbPositionRow[]
  performance: IbPerformanceRow[]
}

export interface ParsedIbCsvResult {
  /** Transaction line items from Trades section */
  trades: AccountLineItem[]
  /** Interest transactions */
  interest: AccountLineItem[]
  /** Fee transactions */
  fees: AccountLineItem[]
  /** Financial instrument lookup by symbol */
  instruments: Map<string, IbFinancialInstrumentRow>
  /** Statement-level data (NAV, positions, performance, etc.) */
  statement: IbStatementData
  /** Raw parsed multi-section CSV */
  rawParsed: ParsedMultiCsv
  /** Parsing errors/warnings */
  warnings: string[]
}

// -------------------------------------------------------------------
// Main Parser
// -------------------------------------------------------------------

/**
 * Parse IB CSV text into structured data.
 *
 * @param text Raw IB CSV content
 * @returns Parsed trades, interest, fees, and instrument info
 */
export function parseIbCsv(text: string): ParsedIbCsvResult {
  const warnings: string[] = []
  const parsed = parseMultiSectionCsv(text)

  // Build instrument lookup
  const instruments = buildInstrumentLookup(parsed)

  // Parse trades
  const trades = parseTradesSection(parsed, instruments, warnings)

  // Parse interest
  const interest = parseInterestSection(parsed, warnings)

  // Parse fees
  const fees = parseFeesSection(parsed, warnings)

  // Parse statement-level data (positions, NAV, performance)
  const statement = parseStatementData(parsed, warnings)

  return {
    trades,
    interest,
    fees,
    instruments,
    rawParsed: parsed,
    warnings,
    statement,
  }
}

/**
 * Parse only trades from IB CSV (convenience method).
 *
 * @param text Raw IB CSV content
 * @returns Array of AccountLineItem from trades
 */
export function parseIbCsvTrades(text: string): AccountLineItem[] {
  const result = parseIbCsv(text)
  return result.trades
}

// -------------------------------------------------------------------
// Section Parsers
// -------------------------------------------------------------------

function buildInstrumentLookup(parsed: ParsedMultiCsv): Map<string, IbFinancialInstrumentRow> {
  const lookup = new Map<string, IbFinancialInstrumentRow>()

  const section = getSection(parsed, 'Financial Instrument Information')
  if (!section) {
    return lookup
  }

  for (const row of section.rows) {
    const symbol = normalizeSymbol(row['Symbol'] || '')
    if (!symbol) continue

    // Map row to typed interface
    const instrument: IbFinancialInstrumentRow = {
      'Asset Category': row['Asset Category'] || '',
      Symbol: symbol,
      Description: row['Description'] || '',
      Conid: row['Conid'] || '',
      'Listing Exch': row['Listing Exch'] || '',
      Multiplier: row['Multiplier'] || '1',
    }

    // Add optional fields only if they have values
    if (row['Security ID']) instrument['Security ID'] = row['Security ID']
    if (row['Underlying']) instrument.Underlying = row['Underlying']
    if (row['Type']) instrument.Type = row['Type']
    if (row['Expiry']) instrument.Expiry = row['Expiry']
    if (row['Delivery Month']) instrument['Delivery Month'] = row['Delivery Month']
    if (row['Strike']) instrument.Strike = row['Strike']
    if (row['Code']) instrument.Code = row['Code']

    lookup.set(symbol, instrument)
  }

  return lookup
}

function parseTradesSection(
  parsed: ParsedMultiCsv,
  instruments: Map<string, IbFinancialInstrumentRow>,
  warnings: string[]
): AccountLineItem[] {
  const items: AccountLineItem[] = []
  const section = getSection(parsed, 'Trades')

  if (!section) {
    return items
  }

  for (const row of section.rows) {
    // Skip non-Order rows (SubTotal, Total, etc. are in separate arrays)
    const discriminator = row['DataDiscriminator'] || ''
    if (discriminator !== 'Order') {
      continue
    }

    try {
      const item = parseTradeRow(row, instruments)
      if (item) {
        items.push(item)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Failed to parse trade row: ${msg}`)
    }
  }

  return items
}

function parseTradeRow(
  row: Record<string, string>,
  instruments: Map<string, IbFinancialInstrumentRow>
): AccountLineItem | null {
  const symbol = normalizeSymbol(row['Symbol'] || '')
  if (!symbol) return null

  const assetCategory = row['Asset Category'] || ''
  const dateTime = row['Date/Time'] || ''
  const qtyStr = row['Quantity'] || '0'
  const priceStr = row['T. Price'] || '0'
  const commFee = row['Comm/Fee'] || '0'
  const proceeds = row['Proceeds'] || '0'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const realizedPL = row['Realized P/L'] || '0'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mtmPL = row['MTM P/L'] || '0'
  const codes = row['Code'] || ''

  // Parse date/time (format: "2025-09-05, 16:20:00")
  let t_date: string
  const dateFormats = ['YYYY-MM-DD, HH:mm:ss', 'YYYY-MM-DD']
  const parsedDayjs = dayjs(dateTime, dateFormats, true)
  if (parsedDayjs.isValid()) {
    t_date = parsedDayjs.format('YYYY-MM-DD')
  } else {
    // Fallback: try parseDate or extract from string
    const fallbackParsed = parseDate(dateTime.split(',')[0]?.trim())
    t_date = fallbackParsed?.formatYMD() ?? dateTime.split(',')[0]?.trim() ?? ''
  }

  // Determine transaction type from codes and quantity
  const qty = parseFloat(qtyStr) || 0
  const t_type = determineTradeType(qty, codes, assetCategory)

  // For options, extract details from instrument lookup or parse from description
  let opt_type: 'call' | 'put' | null = null
  let opt_strike: string | null = null
  let opt_expiration: string | null = null
  let t_symbol = symbol
  let multiplier = 1

  const instrument = instruments.get(symbol)
  if (instrument) {
    multiplier = parseInt(instrument.Multiplier, 10) || 1

    if (isOptionCategory(assetCategory)) {
      opt_type = instrument.Type?.toUpperCase() === 'C' ? 'call' : instrument.Type?.toUpperCase() === 'P' ? 'put' : null
      opt_strike = instrument.Strike || null
      opt_expiration = instrument.Expiry || null
      t_symbol = instrument.Underlying || symbol
    }
  } else if (isOptionCategory(assetCategory)) {
    // Try to parse option info from description using consolidated parser
    const optionInfo = parseOptionDescription(row['Description'] || symbol)
    if (optionInfo) {
      opt_type = optionInfo.optionType
      opt_strike = optionInfo.strikePrice.toString()
      opt_expiration = optionInfo.maturityDate
      t_symbol = optionInfo.symbol
    }
  }

  // Build description
  const description = buildTradeDescription(assetCategory, t_type, symbol, qty, codes)

  // Calculate amount (for options, proceeds is already multiplied by contract size)
  const t_amt = parseFloat(proceeds) || 0

  return AccountLineItemSchema.parse({
    t_date,
    t_type,
    t_symbol,
    t_qty: Math.abs(qty),
    t_price: parseFloat(priceStr) || 0,
    t_commission: Math.abs(parseFloat(commFee)) || 0,
    t_amt,
    t_description: description,
    opt_type,
    opt_strike,
    opt_expiration,
    t_source: 'IB',
  })
}

function parseInterestSection(
  parsed: ParsedMultiCsv,
  warnings: string[]
): AccountLineItem[] {
  const items: AccountLineItem[] = []
  const section = getSection(parsed, 'Interest')

  if (!section) {
    return items
  }

  for (const row of section.rows) {
    // Skip Total rows
    if (row['Currency']?.includes('Total')) continue

    try {
      const currency = row['Currency'] || 'USD'
      const date = row['Date'] || ''
      const description = row['Description'] || ''
      const amount = row['Amount'] || '0'

      if (!date || date === 'Total') continue

      const parsedDate = parseDate(date)

      const item = AccountLineItemSchema.parse({
        t_date: parsedDate?.formatYMD() ?? date,
        t_type: 'Interest',
        t_description: description,
        t_amt: parseFloat(amount) || 0,
        t_source: 'IB',
        t_comment: currency !== 'USD' ? `Currency: ${currency}` : undefined,
      })

      items.push(item)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Failed to parse interest row: ${msg}`)
    }
  }

  return items
}

function parseFeesSection(
  parsed: ParsedMultiCsv,
  warnings: string[]
): AccountLineItem[] {
  const items: AccountLineItem[] = []
  const section = getSection(parsed, 'Fees')

  if (!section) {
    return items
  }

  for (const row of section.rows) {
    // Skip Total rows
    if (row['Subtitle']?.includes('Total')) continue

    try {
      const subtitle = row['Subtitle'] || ''
      const currency = row['Currency'] || 'USD'
      const date = row['Date'] || ''
      const description = row['Description'] || ''
      const amount = row['Amount'] || '0'

      if (!date) continue

      const parsedDate = parseDate(date)

      const item = AccountLineItemSchema.parse({
        t_date: parsedDate?.formatYMD() ?? date,
        t_type: 'Fee',
        t_description: `${subtitle}: ${description}`.trim(),
        t_amt: parseFloat(amount) || 0,
        t_source: 'IB',
        t_comment: currency !== 'USD' ? `Currency: ${currency}` : undefined,
      })

      items.push(item)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Failed to parse fee row: ${msg}`)
    }
  }

  return items
}

// -------------------------------------------------------------------
// Statement Data Parsers
// -------------------------------------------------------------------

/**
 * Parse statement-level data from IB CSV (NAV, positions, performance).
 */
function parseStatementData(
  parsed: ParsedMultiCsv,
  warnings: string[]
): IbStatementData {
  const info = parseStatementInfo(parsed)
  const totalNav = parseTotalNav(parsed)
  const nav = parseNavSection(parsed)
  const cashReport = parseCashReportSection(parsed)
  const positions = parseOpenPositionsSection(parsed, warnings)
  const performance = parsePerformanceSection(parsed, warnings)

  return {
    info,
    totalNav,
    nav,
    cashReport,
    positions,
    performance,
  }
}

/**
 * Parse statement info (broker name, period, account info).
 */
function parseStatementInfo(parsed: ParsedMultiCsv): IbStatementInfo {
  const info: IbStatementInfo = {
    brokerName: 'Interactive Brokers',
    period: '',
    periodStart: null,
    periodEnd: null,
    whenGenerated: null,
    accountName: null,
    accountNumber: null,
  }

  // Parse Statement section
  const statementSection = getSection(parsed, 'Statement')
  if (statementSection) {
    for (const row of statementSection.rows) {
      const fieldName = row['Field Name'] || ''
      const fieldValue = row['Field Value'] || ''

      switch (fieldName) {
        case 'BrokerName':
          info.brokerName = fieldValue
          break
        case 'Period':
          info.period = fieldValue
          // Parse period dates: "October 1, 2025 - October 31, 2025"
          const periodMatch = fieldValue.match(/^(.+?)\s*-\s*(.+)$/)
          if (periodMatch && periodMatch[1] && periodMatch[2]) {
            const startDate = parseDate(periodMatch[1].trim())
            const endDate = parseDate(periodMatch[2].trim())
            info.periodStart = startDate?.formatYMD() ?? null
            info.periodEnd = endDate?.formatYMD() ?? null
          }
          break
        case 'WhenGenerated':
          info.whenGenerated = fieldValue
          break
      }
    }
  }

  // Parse Account Information section
  const accountSection = getSection(parsed, 'Account Information')
  if (accountSection) {
    for (const row of accountSection.rows) {
      const fieldName = row['Field Name'] || ''
      const fieldValue = row['Field Value'] || ''

      switch (fieldName) {
        case 'Name':
          info.accountName = fieldValue
          break
        case 'Account':
          info.accountNumber = fieldValue
          break
      }
    }
  }

  return info
}

/**
 * Parse total NAV from Net Asset Value section.
 */
function parseTotalNav(parsed: ParsedMultiCsv): number | null {
  const section = getSection(parsed, 'Net Asset Value')
  if (!section) return null

  for (const row of section.rows) {
    const assetClass = row['Asset Class'] || ''
    if (assetClass.toLowerCase() === 'total') {
      const currentTotal = row['Current Total'] || ''
      const value = parseFloat(currentTotal)
      return isNaN(value) ? null : value
    }
  }

  return null
}

/**
 * Parse Net Asset Value section rows.
 */
function parseNavSection(parsed: ParsedMultiCsv): IbNavRow[] {
  const rows: IbNavRow[] = []
  const section = getSection(parsed, 'Net Asset Value')

  if (!section) return rows

  for (const row of section.rows) {
    const assetClass = (row['Asset Class'] || '').trim()
    // Skip empty rows and non-asset rows
    if (!assetClass) continue

    rows.push({
      assetClass,
      priorTotal: parseFloatOrNull(row['Prior Total']),
      currentLong: parseFloatOrNull(row['Current Long']),
      currentShort: parseFloatOrNull(row['Current Short']),
      currentTotal: parseFloatOrNull(row['Current Total']),
      changeAmount: parseFloatOrNull(row['Change']),
    })
  }

  return rows
}

/**
 * Parse Cash Report section rows.
 */
function parseCashReportSection(parsed: ParsedMultiCsv): IbCashReportRow[] {
  const rows: IbCashReportRow[] = []
  const section = getSection(parsed, 'Cash Report')

  if (!section) return rows

  for (const row of section.rows) {
    const lineItem = (row['Currency Summary'] || '').trim()
    const currency = (row['Currency'] || '').trim()

    // Skip empty rows
    if (!lineItem) continue

    rows.push({
      currency,
      lineItem,
      total: parseFloatOrNull(row['Total']),
      securities: parseFloatOrNull(row['Securities']),
      futures: parseFloatOrNull(row['Futures']),
    })
  }

  return rows
}

/**
 * Parse Open Positions section.
 */
function parseOpenPositionsSection(
  parsed: ParsedMultiCsv,
  warnings: string[]
): IbPositionRow[] {
  const positions: IbPositionRow[] = []
  const section = getSection(parsed, 'Open Positions')

  if (!section) return positions

  for (const row of section.rows) {
    // Only process Summary rows
    const discriminator = row['DataDiscriminator'] || ''
    if (discriminator !== 'Summary') continue

    try {
      const symbol = (row['Symbol'] || '').trim()
      const assetCategory = row['Asset Category'] || ''
      const currency = row['Currency'] || 'USD'
      const quantity = parseFloatOrNull(row['Quantity'])
      const multiplier = parseFloat(row['Mult'] || '1') || 1
      const costPrice = parseFloatOrNull(row['Cost Price'])
      const costBasis = parseFloatOrNull(row['Cost Basis'])
      const closePrice = parseFloatOrNull(row['Close Price'])
      const marketValue = parseFloatOrNull(row['Value'])
      const unrealizedPl = parseFloatOrNull(row['Unrealized P/L'])

      // Parse option info from symbol if it's an option
      let optType: 'call' | 'put' | null = null
      let optStrike: string | null = null
      let optExpiration: string | null = null

      if (isOptionCategory(assetCategory)) {
        const optInfo = parseOptionDescription(symbol)
        if (optInfo) {
          optType = optInfo.optionType
          optStrike = optInfo.strikePrice.toString()
          optExpiration = optInfo.maturityDate
        }
      }

      positions.push({
        assetCategory,
        currency,
        symbol,
        quantity,
        multiplier,
        costPrice,
        costBasis,
        closePrice,
        marketValue,
        unrealizedPl,
        optType,
        optStrike,
        optExpiration,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Failed to parse position row: ${msg}`)
    }
  }

  return positions
}

/**
 * Parse Mark-to-Market and Realized & Unrealized Performance sections.
 */
function parsePerformanceSection(
  parsed: ParsedMultiCsv,
  warnings: string[]
): IbPerformanceRow[] {
  const performance: IbPerformanceRow[] = []

  // Parse Mark-to-Market Performance Summary
  const mtmSection = getSection(parsed, 'Mark-to-Market Performance Summary')
  if (mtmSection) {
    for (const row of mtmSection.rows) {
      const symbol = (row['Symbol'] || '').trim()
      const assetCategory = row['Asset Category'] || ''

      // Skip Total rows and empty symbols
      if (!symbol || symbol.toLowerCase().includes('total')) continue

      try {
        performance.push({
          perfType: 'mtm',
          assetCategory,
          symbol,
          priorQuantity: parseFloatOrNull(row['Prior Quantity']),
          currentQuantity: parseFloatOrNull(row['Current Quantity']),
          priorPrice: parseFloatOrNull(row['Prior Price']),
          currentPrice: parseFloatOrNull(row['Current Price']),
          mtmPlPosition: parseFloatOrNull(row['Mark-to-Market P/L Position']),
          mtmPlTransaction: parseFloatOrNull(row['Mark-to-Market P/L Transaction']),
          mtmPlCommissions: parseFloatOrNull(row['Mark-to-Market P/L Commissions']),
          mtmPlOther: parseFloatOrNull(row['Mark-to-Market P/L Other']),
          mtmPlTotal: parseFloatOrNull(row['Mark-to-Market P/L Total']),
          // Not used for MTM rows
          costAdj: null,
          realizedStProfit: null,
          realizedStLoss: null,
          realizedLtProfit: null,
          realizedLtLoss: null,
          realizedTotal: null,
          unrealizedStProfit: null,
          unrealizedStLoss: null,
          unrealizedLtProfit: null,
          unrealizedLtLoss: null,
          unrealizedTotal: null,
          totalPl: null,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Failed to parse MTM row: ${msg}`)
      }
    }
  }

  // Parse Realized & Unrealized Performance Summary
  const ruSection = getSection(parsed, 'Realized & Unrealized Performance Summary')
  if (ruSection) {
    for (const row of ruSection.rows) {
      const symbol = (row['Symbol'] || '').trim()
      const assetCategory = row['Asset Category'] || ''

      // Skip Total rows and empty symbols
      if (!symbol || symbol.toLowerCase().includes('total')) continue

      try {
        performance.push({
          perfType: 'realized_unrealized',
          assetCategory,
          symbol,
          priorQuantity: null,
          currentQuantity: null,
          priorPrice: null,
          currentPrice: null,
          mtmPlPosition: null,
          mtmPlTransaction: null,
          mtmPlCommissions: null,
          mtmPlOther: null,
          mtmPlTotal: null,
          costAdj: parseFloatOrNull(row['Cost Adj.']),
          realizedStProfit: parseFloatOrNull(row['Realized S/T Profit']),
          realizedStLoss: parseFloatOrNull(row['Realized S/T Loss']),
          realizedLtProfit: parseFloatOrNull(row['Realized L/T Profit']),
          realizedLtLoss: parseFloatOrNull(row['Realized L/T Loss']),
          realizedTotal: parseFloatOrNull(row['Realized Total']),
          unrealizedStProfit: parseFloatOrNull(row['Unrealized S/T Profit']),
          unrealizedStLoss: parseFloatOrNull(row['Unrealized S/T Loss']),
          unrealizedLtProfit: parseFloatOrNull(row['Unrealized L/T Profit']),
          unrealizedLtLoss: parseFloatOrNull(row['Unrealized L/T Loss']),
          unrealizedTotal: parseFloatOrNull(row['Unrealized Total']),
          totalPl: parseFloatOrNull(row['Total']),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Failed to parse R&U row: ${msg}`)
      }
    }
  }

  return performance
}

/**
 * Helper to parse float or return null.
 */
function parseFloatOrNull(value: string | undefined): number | null {
  if (!value || value === '--' || value.trim() === '') return null
  const num = parseFloat(value.replace(/,/g, ''))
  return isNaN(num) ? null : num
}

// -------------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------------

/**
 * Normalize IB symbol format.
 * IB uses formats like "AMZN  260116C00250000" for options.
 */
function normalizeSymbol(symbol: string): string {
  return symbol.trim().replace(/\s+/g, ' ')
}

/**
 * Check if asset category is an option.
 */
function isOptionCategory(category: string): boolean {
  const optionCategories = [
    'Equity and Index Options',
    'Options',
    'Index Options',
    'Stock Options',
  ]
  return optionCategories.some((c) => category.toLowerCase().includes(c.toLowerCase()))
}

/**
 * Determine trade type from quantity, codes, and category.
 */
function determineTradeType(qty: number, codes: string, category: string): string {
  const codeList = codes.split(';').map((c) => c.trim().toUpperCase())

  // Check for specific actions first
  if (codeList.includes('A')) return 'Assignment'
  if (codeList.includes('EX')) return 'Exercise'
  if (codeList.includes('EP')) return 'Expired'

  // Regular buy/sell based on quantity
  if (qty > 0) {
    if (codeList.includes('C')) return 'Buy to Close'
    return 'Buy'
  } else if (qty < 0) {
    if (codeList.includes('O')) return 'Sell to Open'
    return 'Sell'
  }

  return 'Trade'
}

/**
 * Build trade description from components.
 */
function buildTradeDescription(
  category: string,
  type: string,
  symbol: string,
  qty: number,
  codes: string
): string {
  const parts: string[] = []

  parts.push(type)
  parts.push(Math.abs(qty).toString())
  parts.push(symbol)

  if (isOptionCategory(category)) {
    parts.unshift('Option')
  }

  if (codes) {
    parts.push(`[${codes}]`)
  }

  return parts.join(' ')
}

/**
/**
 * Detect if text is an IB CSV format.
 *
 * @param text CSV text content
 * @returns True if text appears to be IB format
 */
export function isIbCsvFormat(text: string): boolean {
  // IB CSVs start with "Statement,Header,..." or similar
  const firstLine = text.split('\n')[0]?.trim() || ''

  // Check for IB-specific section names
  const ibSectionPatterns = [
    /^Statement,Header/i,
    /^Account Information,Header/i,
    /^Trades,Header/i,
    /^Financial Instrument Information/i,
  ]

  return ibSectionPatterns.some((pattern) => pattern.test(firstLine)) ||
    text.includes('Interactive Brokers')
}
