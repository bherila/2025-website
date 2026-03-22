/**
 * TXF (Tax eXchange Format) File Export
 *
 * Generates TXF files from IRS Form 8949 lot sale data for import
 * into tax preparation software (TurboTax, H&R Block, etc.).
 *
 * TXF Spec: Each record begins with a type line (V, followed by version),
 * then line-item records identified by reference numbers.
 *
 * Reference numbers used:
 *   321 — Short-term gain/loss (Schedule D Part I / Form 8949 Part I)
 *   323 — Long-term gain/loss  (Schedule D Part II / Form 8949 Part II)
 *
 * Each sale record is a block of lines:
 *   N<refnum>  — Reference number (321 or 323)
 *   C1         — Copy 1
 *   L1         — Line 1
 *   P<desc>    — Description of property
 *   D<date>    — Date acquired (MM/DD/YYYY or "Various")
 *   D<date>    — Date sold (MM/DD/YYYY)
 *   $<amount>  — Sales price / proceeds
 *   $<amount>  — Cost or other basis
 *   $<amount>  — Wash sale loss disallowed (if applicable, may be 0)
 *
 * See docs/finance/LotAnalyzer.md for further context.
 */

import type { LotSale } from './washSaleEngine'

/** Format a date string (YYYY-MM-DD) as MM/DD/YYYY for TXF. */
function formatTxfDate(dateStr: string | null): string {
  if (!dateStr) return 'Various'
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`
  }
  return dateStr
}

/** Format a numeric amount for TXF (fixed 2 decimals). */
function formatTxfAmount(value: number): string {
  return value.toFixed(2)
}

/**
 * Generate TXF content string from an array of LotSale records.
 *
 * @param lots - The lot sale records to export
 * @param year - Optional tax year (used in header comment only)
 * @returns TXF file content as a string
 */
export function generateTxf(lots: LotSale[], year?: string): string {
  const lines: string[] = []

  // TXF header
  lines.push('V042')       // Version 042
  lines.push('AFinance Tool')  // Software name
  lines.push(`D ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`)
  lines.push('^')           // End of header

  for (const lot of lots) {
    // Reference number: 321 for short-term, 323 for long-term
    const refNum = lot.isShortTerm ? '321' : '323'

    lines.push(`N${refNum}`)
    lines.push('C1')
    lines.push('L1')
    lines.push(`P${lot.description}`)
    lines.push(`D${formatTxfDate(lot.dateAcquired)}`)
    lines.push(`D${formatTxfDate(lot.dateSold)}`)
    lines.push(`$${formatTxfAmount(lot.proceeds)}`)
    lines.push(`$${formatTxfAmount(lot.costBasis)}`)

    // If there's a wash sale adjustment, include it
    if (lot.isWashSale && lot.adjustmentAmount !== 0) {
      lines.push(`$${formatTxfAmount(lot.adjustmentAmount)}`)
    }

    lines.push('^')  // End of record
  }

  return lines.join('\r\n') + '\r\n'
}

/**
 * Download TXF content as a file in the browser.
 *
 * @param lots - The lot sale records to export
 * @param year - Tax year (used for filename); 'all' for all years
 */
export function downloadTxf(lots: LotSale[], year: string = 'all'): void {
  const content = generateTxf(lots, year)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const filename = year === 'all' ? 'all.txf' : `${year}.txf`

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
