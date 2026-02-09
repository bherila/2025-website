import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseOptionDescription } from '@/data/finance/StockOptionUtil'
import { parseDate } from '@/lib/DateHelper'
import { splitDelimitedText } from '@/lib/splitDelimitedText'

interface FidelityColumnMapping {
  dateCol: number
  actionCol: number
  symbolCol: number
  descriptionCol: number
  quantityCol: number
  priceCol: number
  commissionCol: number
  feesCol: number
  amountCol: number
  settlementDateCol: number
  cashBalanceCol?: number
  typeCol?: number
}

function parseHeader(columns: string[]): FidelityColumnMapping | null {
  const trimmedCols = columns.map((col) => col.trim())

  const columnMap: Record<keyof FidelityColumnMapping, string[]> = {
    dateCol: ["Run Date", "Date"],
    actionCol: ["Action"],
    symbolCol: ["Symbol"],
    descriptionCol: ["Security Description", "Description"],
    quantityCol: ["Quantity"],
    priceCol: ["Price ($)", "Price"],
    commissionCol: ["Commission ($)", "Commission"],
    feesCol: ["Fees ($)", "Fees"],
    amountCol: ["Amount ($)", "Amount"],
    settlementDateCol: ["Settlement Date"],
    cashBalanceCol: ["Cash Balance ($)", "Cash Balance"],
    typeCol: ["Type"]
  }

  const mapping: Partial<FidelityColumnMapping> = {}
  for (const [key, names] of Object.entries(columnMap)) {
    const idx = trimmedCols.findIndex((col) => names.includes(col))
    if (idx !== -1) {
      (mapping as any)[key] = idx
    }
  }

  // Validate required columns
  if (mapping.dateCol === undefined || mapping.actionCol === undefined || mapping.amountCol === undefined) {
    return null
  }

  return mapping as FidelityColumnMapping
}

export function parseFidelityCsv(text: string): AccountLineItem[] {
  const rows = splitDelimitedText(text, ',')
  if (rows.length < 2 || !rows[0]) return []

  const mapping = parseHeader(rows[0])
  if (!mapping) return []

  const data: AccountLineItem[] = []
  const getCol = (cols: string[], idx?: number) =>
    idx !== undefined && idx !== -1 ? cols[idx] || undefined : undefined

  let blankCount = 0

  // Footer patterns that indicate end of data
  const footerPatterns = [
    /^date downloaded/i,
    /^"?the data and information/i,
    /^"?brokerage services are provided/i,
    /^"?informational purposes only/i,
  ]

  for (let i = 1; i < rows.length; i++) {
    const columns = rows[i]

    // Detect blank line (all empty or undefined)
    const isBlank = !columns || columns.every((c) => !c || c.trim() === "")
    if (isBlank) {
      blankCount++
      if (blankCount >= 3) {
        break // stop parsing after 3 consecutive blank lines
      }
      continue
    } else {
      blankCount = 0 // reset counter if non-blank line
    }

    // Check for footer patterns (stop parsing if we hit one)
    const firstCol = columns[0]?.trim() || ''
    const rowText = columns.join(' ')
    if (footerPatterns.some(pattern => pattern.test(firstCol) || pattern.test(rowText))) {
      break
    }

    if (columns.length < Math.max(mapping.dateCol, mapping.actionCol, mapping.amountCol)) {
      continue
    }

    try {
      const { transactionDescription, transactionType, rest } = splitTransactionString(columns[mapping.actionCol] || '')

      const settlementDate = getCol(columns, mapping.settlementDateCol)
      const cashBalance = getCol(columns, mapping.cashBalanceCol)

      // Note: The Type column contains account type (Cash/Margin/Shares), not transaction type
      // So we only use transactionType from splitTransactionString
      const qtyStr = getCol(columns, mapping.quantityCol)
      const qtyNum = qtyStr ? parseFloat(qtyStr) : undefined
      
      // Check for option transaction by parsing symbol or description
      const symbolStr = getCol(columns, mapping.symbolCol)?.trim()
      const descStr = getCol(columns, mapping.descriptionCol)?.trim()
      
      // Try to parse option info from symbol (e.g., "-ARKK210917C127") or description
      const optionInfo = parseOptionDescription(symbolStr || '') || parseOptionDescription(descStr || '')
      
      // For options, use the underlying symbol as t_symbol
      const effectiveSymbol = optionInfo ? optionInfo.symbol : symbolStr
      
      const item = AccountLineItemSchema.parse({
        t_date: parseDate(columns[mapping.dateCol])?.formatYMD() ?? columns[mapping.dateCol],
        t_type: transactionType,
        t_symbol: effectiveSymbol,
        t_description: rest || transactionDescription,
        t_qty: qtyNum !== undefined && !isNaN(qtyNum) ? qtyNum : undefined,
        t_price: getCol(columns, mapping.priceCol),
        t_commission: getCol(columns, mapping.commissionCol),
        t_fee: getCol(columns, mapping.feesCol),
        t_amt: getCol(columns, mapping.amountCol),
        t_account_balance: cashBalance,
        t_date_posted: settlementDate && settlementDate !== 'Processing'
          ? parseDate(settlementDate)?.formatYMD() ?? settlementDate
          : undefined,
        t_comment: rest ? transactionDescription : undefined,
        // Option-specific fields
        opt_type: optionInfo?.optionType ?? undefined,
        opt_strike: optionInfo?.strikePrice?.toString() ?? undefined,
        opt_expiration: optionInfo?.maturityDate ?? undefined,
      })
      data.push(item)
    } catch {
      continue
    }
  }

  return data
}


// Map of transaction description prefixes -> simple transaction type
// Longer prefixes first to avoid mis-categorization
const typeMap: Record<string, string> = {
  // Option actions (longest first)
  "YOU SOLD CLOSING TRANSACTION": "Sell to Close",
  "YOU SOLD OPENING TRANSACTION": "Sell to Open",
  "YOU BOUGHT CLOSING TRANSACTION": "Buy to Close",
  "YOU BOUGHT OPENING TRANSACTION": "Buy to Open",
  "ASSIGNED": "Assignment",
  "EXPIRED": "Expiration",
  "EXERCISED": "Exercise",

  // Buy/Sell actions (longest first)
  "YOU SOLD SHORT SALE EXEC ON MULT EXCHG DETAILS ON REQUEST": "Sell Short",
  "YOU SOLD SHORT SALE AVERAGE PRICE TRADE": "Sell Short",
  "YOU SOLD SHORT SALE": "Sell Short",
  "YOU SOLD AVERAGE PRICE TRADE": "Sell",
  "YOU SOLD EXEC ON MULT EXCHG DETAILS ON REQUEST": "Sell",
  "YOU BOUGHT EXEC ON MULT EXCHG DETAILS ON REQUEST AVERAGE PRICE TRADE": "Buy",
  "YOU BOUGHT AVERAGE PRICE TRADE DETAILS ON REQUEST": "Buy",
  "YOU BOUGHT AVERAGE PRICE TRADE": "Buy",
  "YOU BOUGHT SHORT COVER": "Buy",
  "YOU SOLD": "Sell",
  "YOU BOUGHT": "Buy",
  "BOUGHT": "Buy",
  "SOLD": "Sell",

  // Dividends (single category)
  "DIVIDEND RECEIVED": "Dividend",
  "DIVIDEND CHARGED": "Dividend",

  // Interest
  "INTEREST EARNED": "Interest",
  "INTEREST SHORT SALE REBATE": "Interest",
  "MARGIN INTEREST": "Interest",

  // Journal entries
  "JOURNALED GOODWILL": "Journal",
  "JOURNALED": "Journal",

  // Other base actions
  "SHORT VS MARGIN MARK TO MARKET": "MISC",
  "DISTRIBUTION": "MISC",
  "IN LIEU OF FRX SHARE SPINOFF": "MISC",

  // Cash movement actions
  "WIRE TRANSFER FROM BANK": "Wire",
  "WIRE TRANSFER TO BANK": "Wire",
  "ELECTRONIC FUNDS TRANSFER RECEIVED": "Deposit",
  "ELECTRONIC FUNDS TRANSFER PAID": "Withdrawal",
  "DIRECT DEPOSIT": "Deposit",
  "DIRECT DEBIT": "Withdrawal",
  "CHECK RECEIVED": "Deposit",
  "CHECK PAID": "Withdrawal",

  // Other actions
  "REDEMPTION FROM CORE ACCOUNT": "Redeem",
  "REDEMPTION PAYOUT": "Redeem",
  "REINVESTMENT": "Reinvest",
  "TRANSFERRED TO VS": "Transfer",
  "TRANSFERRED FROM VS": "Transfer",
  "TRANSFER OF ASSETS ACAT RECEIVE": "Transfer",
  "TRANSFER OF ASSETS": "Transfer",
  "BILL PAYMENT": "Payment",
  "ASSET/ACCT FEE": "Fee",
  
  // Corporate actions
  "MERGER": "Merger",
  "FOREIGN TAX PAID": "Tax",
};

// Keyword fallback map -> simple transaction type
const keywordMap: Record<string, string> = {
  "DIVIDEND": "Dividend",
  "REINVEST": "Reinvest",
  "TRANSFER": "Transfer",
  "CHECK": "Deposit", // default assumption
  "PAYMENT": "Payment",
  "DEPOSIT": "Deposit",
  "DEBIT": "Withdrawal",
  "WITHDRAWAL": "Withdrawal",
  "WIRE": "Wire",
  "REDEMPTION": "Redeem",
  "BOUGHT": "Buy",
  "SOLD": "Sell",
  "FEE": "Fee",
  "INTEREST": "Interest",
  "JOURNAL": "Journal",
  "MERGER": "Merger",
  "TAX": "Tax",
};

/**
 * Split transaction string into description, type, and rest (case-insensitive).
 */
export function splitTransactionString(description: string): {
  transactionDescription: string;
  transactionType: string;
  rest: string;
} {
  if (!description) {
    return { transactionDescription: "", transactionType: "MISC", rest: "" };
  }

  const descUpper = description.toUpperCase().trim();

  // Exact prefix match, longest first
  for (const prefix of Object.keys(typeMap).sort((a, b) => b.length - a.length)) {
    if (descUpper.startsWith(prefix)) {
      return {
        transactionDescription: prefix.toUpperCase(),
        transactionType: typeMap[prefix] || "MISC",
        rest: descUpper.substring(prefix.length).trim(),
      };
    }
  }

  // Fallback: keyword search
  for (const [keyword, type] of Object.entries(keywordMap)) {
    if (descUpper.includes(keyword)) {
      return {
        transactionDescription: descUpper,
        transactionType: type,
        rest: description.trim(),
      };
    }
  }

  // No match found
  return { transactionDescription: descUpper, transactionType: "MISC", rest: "" };
}
