import type { ParsedLotRow } from '@/types/finance/lot'

/**
 * Parse a Fidelity "Mon-DD-YYYY" date into "YYYY-MM-DD".
 */
function parseFidelityDate(dateStr: string): string {
    const months: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    }
    const parts = dateStr.split('-')
    if (parts.length !== 3) throw new Error(`Invalid date format: ${dateStr}`)
    const monthStr = parts[0]!
    const month = months[monthStr]
    if (!month) throw new Error(`Invalid month: ${monthStr}`)
    const day = parts[1]!.padStart(2, '0')
    const year = parts[2]!
    return `${year}-${month}-${day}`
}

/**
 * Parse a currency string like "$2.25", "-$0.19", or "--" into a number or null.
 */
function parseCurrency(value: string): number | null {
    const trimmed = value.trim()
    if (trimmed === '--' || trimmed === '') return null
    const negative = trimmed.startsWith('-')
    const cleaned = trimmed.replace(/[$,-]/g, '')
    const num = parseFloat(cleaned)
    if (isNaN(num)) return null
    return negative ? -num : num
}

/**
 * Parse Fidelity TSV lot data.
 *
 * The input format is:
 * Line 1: Security description (e.g. "ISHARES TR GENOMICS IMMUN")
 * Line 2: Header row (tab-separated)
 * Lines 3+: Data rows (tab-separated)
 *
 * Returns { symbol, description, rows }.
 */
export function parseFidelityLotsTsv(text: string): {
    description: string
    rows: ParsedLotRow[]
} {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length < 3) {
        throw new Error('Expected at least 3 lines: description, header, and at least one data row')
    }

    const description = lines[0]!

    // Validate header
    const header = lines[1]!.split('\t').map(h => h.trim())
    const expectedHeaders = ['Acquired', 'Date Sold', 'Quantity', 'Cost Basis', 'Cost Basis Per Share', 'Proceeds', 'Proceeds Per Share', 'Short-Term Gain/Loss', 'Long-Term Gain/Loss']
    for (let i = 0; i < expectedHeaders.length; i++) {
        if (!header[i] || header[i] !== expectedHeaders[i]) {
            throw new Error(`Expected header "${expectedHeaders[i]}" at column ${i + 1}, got "${header[i] || '(missing)'}"`)
        }
    }

    const rows: ParsedLotRow[] = []
    for (let i = 2; i < lines.length; i++) {
        const cols = lines[i]!.split('\t').map(c => c.trim())
        if (cols.length < 9) continue

        const acquired = parseFidelityDate(cols[0]!)
        const dateSold = cols[1] === '--' || cols[1] === '' ? null : parseFidelityDate(cols[1]!)
        const quantity = parseFloat(cols[2]!)
        const costBasis = parseCurrency(cols[3]!)
        const costBasisPerShare = parseCurrency(cols[4]!)
        const proceeds = parseCurrency(cols[5]!)
        const proceedsPerShare = parseCurrency(cols[6]!)
        const shortTermGainLoss = parseCurrency(cols[7]!)
        const longTermGainLoss = parseCurrency(cols[8]!)

        if (isNaN(quantity) || costBasis === null) {
            throw new Error(`Invalid data on line ${i + 1}: quantity or cost basis is not a number`)
        }

        rows.push({
            acquired,
            dateSold,
            quantity,
            costBasis,
            costBasisPerShare: costBasisPerShare ?? 0,
            proceeds,
            proceedsPerShare,
            shortTermGainLoss,
            longTermGainLoss,
        })
    }

    return { description, rows }
}
