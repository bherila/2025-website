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

export interface ParsedIbCsvResult {
  /** Transaction line items from Trades section */
  trades: AccountLineItem[]
  /** Interest transactions */
  interest: AccountLineItem[]
  /** Fee transactions */
  fees: AccountLineItem[]
  /** Financial instrument lookup by symbol */
  instruments: Map<string, IbFinancialInstrumentRow>
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

  return {
    trades,
    interest,
    fees,
    instruments,
    rawParsed: parsed,
    warnings,
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
    // Try to parse option info from description
    const optionInfo = parseOptionFromDescription(row['Description'] || symbol)
    if (optionInfo) {
      opt_type = optionInfo.type
      opt_strike = optionInfo.strike
      opt_expiration = optionInfo.expiration
      t_symbol = optionInfo.underlying
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
 * Parse option details from IB description format.
 *
 * Formats:
 * - "AMZN 03OCT25 225 C" -> underlying: AMZN, expiry: 2025-10-03, strike: 225, type: call
 * - "TSLA  251024C00470000" -> underlying: TSLA, expiry: 2025-10-24, strike: 470, type: call
 */
function parseOptionFromDescription(description: string): {
  underlying: string
  expiration: string
  strike: string
  type: 'call' | 'put'
} | null {
  // Try format: "AMZN 03OCT25 225 C"
  const spaceFormat = /^(\w+)\s+(\d{2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])$/i
  let match = description.match(spaceFormat)

  if (match) {
    const underlying = match[1]
    const day = match[2]
    const month = match[3]
    const year = match[4]
    const strike = match[5]
    const optType = match[6]

    if (!underlying || !day || !month || !year || !strike || !optType) {
      return null
    }

    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const mm = monthMap[month.toUpperCase()] || '01'
    const yyyy = `20${year}`

    return {
      underlying: underlying.toUpperCase(),
      expiration: `${yyyy}-${mm}-${day}`,
      strike: strike,
      type: optType.toUpperCase() === 'C' ? 'call' : 'put',
    }
  }

  // Try compact format: "TSLA  251024C00470000"
  const compactFormat = /^(\w+)\s+(\d{6})([CP])(\d{8})$/i
  match = description.match(compactFormat)

  if (match) {
    const underlying = match[1]
    const dateCode = match[2]
    const optType = match[3]
    const strikeCode = match[4]

    if (!underlying || !dateCode || !optType || !strikeCode) {
      return null
    }

    // dateCode: YYMMDD
    const yyyy = `20${dateCode.slice(0, 2)}`
    const mm = dateCode.slice(2, 4)
    const dd = dateCode.slice(4, 6)
    // strikeCode: 00470000 -> 470.0000 (divide by 1000)
    const strike = (parseInt(strikeCode, 10) / 1000).toString()

    return {
      underlying: underlying.toUpperCase(),
      expiration: `${yyyy}-${mm}-${dd}`,
      strike,
      type: optType.toUpperCase() === 'C' ? 'call' : 'put',
    }
  }

  return null
}

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
