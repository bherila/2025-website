/**
 * Parser for Charles Schwab brokerage CSV export files.
 *
 * Schwab CSV format headers:
 *   "Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
 *
 * Dates may include an "as of" qualifier, e.g. "11/17/2025 as of 11/15/2025".
 * Amounts are formatted with a leading "$" and may be negative: "$1,234.56" or "-$1,234.56".
 */
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { splitDelimitedText } from '@/lib/splitDelimitedText'

/** Map Schwab "Action" column values to canonical t_type values. */
const ACTION_TYPE_MAP: Record<string, string> = {
  'Sell': 'Sell',
  'Buy': 'Buy',
  'Short Sale': 'Sell Short',
  'Buy to Cover': 'Cover',
  'Qualified Dividend': 'Dividend',
  'Non-Qualified Div': 'Dividend',
  'Ordinary Dividend': 'Dividend',
  'Reinvest Dividend': 'Reinvest',
  'Reinvest Shares': 'Reinvest',
  'Stock Plan Activity': 'Transfer',
  'Security Transfer': 'Transfer',
  'Journal': 'Journal',
  'Bank Interest': 'Interest',
  'Margin Interest': 'Interest',
  'Wire Sent': 'Wire',
  'Wire Received': 'Wire',
  'MoneyLink Transfer': 'Transfer',
  'MoneyLink Deposit': 'Deposit',
  'MoneyLink Withdrawal': 'Withdrawal',
  'Service Fee': 'Fee',
  'Misc Cash Entry': 'MISC',
  'Cash In Lieu': 'Cash In Lieu',
  'Foreign Tax Paid': 'Tax',
  'Cash Merger': 'Merger',
  'Stock Merger': 'Merger',
}

/**
 * Strip Schwab's "$" prefix and commas from amount strings.
 * Handles both "$1,234.56" and "-$1,234.56" (negative amounts).
 */
function parseSchwabAmount(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // Replace "-$" → "-" before stripping the bare "$"
  const cleaned = raw.trim().replace(/-\$/, '-').replace(/^\$/, '').replace(/,/g, '')
  return cleaned === '' || cleaned === '--' ? undefined : cleaned
}

/**
 * Parse a Schwab date string, handling the "MM/DD/YYYY as of MM/DD/YYYY" format.
 * Returns the primary (transaction) date.
 */
function parseSchwabDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // Strip the "as of ..." qualifier — take the first date
  const primary = raw.split(' as of ')[0]?.trim()
  return parseDate(primary ?? '')?.formatYMD() ?? primary
}

/**
 * Detect whether the text looks like a Schwab CSV.
 * Schwab exports begin with a quoted header row containing "Action" and "Fees & Comm".
 * Scans up to 5 lines to handle exports that include a title/metadata row above the header.
 */
export function isSchwabCsv(text: string): boolean {
  const lines = text.trimStart().split('\n').slice(0, 5)
  return lines.some((line) => line.includes('Action') && line.includes('Fees & Comm'))
}

/**
 * Parse a Charles Schwab CSV export into AccountLineItem records.
 */
export function parseSchwabCsv(text: string): AccountLineItem[] {
  const rows = splitDelimitedText(text, ',')
  if (rows.length < 2 || !rows[0]) return []

  // Find header row (may not be first row if there's a title row above)
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i]
    if (row && row.some((c) => c?.trim() === 'Action') && row.some((c) => (c ?? '').includes('Fees'))) {
      headerRowIdx = i
      break
    }
  }

  const headers = (rows[headerRowIdx] ?? []).map((h) => h?.trim() ?? '')
  const col = (name: string) => headers.indexOf(name)

  const dateCol = col('Date')
  const actionCol = col('Action')
  const symbolCol = col('Symbol')
  const descCol = col('Description')
  const qtyCol = col('Quantity')
  const priceCol = col('Price')
  const feesCol = col('Fees & Comm')
  const amountCol = col('Amount')

  if (dateCol === -1 || actionCol === -1 || amountCol === -1) return []

  const data: AccountLineItem[] = []

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const cols = rows[i]
    if (!cols) continue

    const rawDate = cols[dateCol]?.trim()
    const rawAction = cols[actionCol]?.trim()

    // Stop at blank/footer rows
    if (!rawDate || !rawAction) continue
    if (rawDate.startsWith('Transactions Total') || rawDate.startsWith('Account Total')) break

    const tDate = parseSchwabDate(rawDate)
    if (!tDate) continue

    const tType = ACTION_TYPE_MAP[rawAction] ?? rawAction

    const rawQty = cols[qtyCol]?.trim()
    const qtyNum = rawQty ? parseFloat(rawQty.replace(/,/g, '')) : undefined

    const rawPrice = cols[priceCol]?.trim()
    const priceNum = rawPrice ? parseSchwabAmount(rawPrice) : undefined

    try {
      const item = AccountLineItemSchema.parse({
        t_date: tDate,
        t_type: tType,
        t_symbol: cols[symbolCol]?.trim() || undefined,
        t_description: cols[descCol]?.trim() || undefined,
        t_qty: qtyNum !== undefined && !isNaN(qtyNum) ? qtyNum : undefined,
        t_price: priceNum,
        t_fee: parseSchwabAmount(cols[feesCol]),
        t_amt: parseSchwabAmount(cols[amountCol]),
        t_comment: rawAction !== tType ? rawAction : undefined,
      })
      data.push(item)
    } catch {
      continue
    }
  }

  return data
}
