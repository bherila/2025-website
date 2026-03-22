/**
 * Parsed option information with unified format
 */
export interface ParsedOptionInfo {
  symbol: string
  optionType: 'call' | 'put'
  maturityDate: string  // YYYY-MM-DD format
  strikePrice: number
}

/**
 * Parse an option description string from various broker formats.
 * Supports:
 * - E-Trade CSV: "1 AAPL Jan 15 '24 $150.00 Call"
 * - E-Trade/Fidelity QFX: "CALL AAPL 01/15/24 150"
 * - IB space format: "AMZN 03OCT25 225 C"
 * - IB compact format: "TSLA  251024C00470000"
 * 
 * @param description Option description string
 * @returns Parsed option info or null if not parseable
 */
export function parseOptionDescription(description: string): ParsedOptionInfo | null {
  // E-Trade CSV option format: "1 AAPL Jan 15 '24 $150.00 Call"
  const etradeRegex =
    /[\d\s]*([A-Z]+) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) '(\d{2}) \$([\d.]+) (Call|Put)/i

  const etradeMatch = description.replace('\t', ' ').match(etradeRegex)
  if (etradeMatch) {
    const symbol = etradeMatch[1]
    const month = etradeMatch[2]
    const day = etradeMatch[3]
    const year = etradeMatch[4]
    const strikePrice = etradeMatch[5]
    const optionType = etradeMatch[6]
    
    if (!symbol || !month || !day || !year || !strikePrice || !optionType) {
      return null
    }
    
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    // TODO: Handle dates before 1999
    const maturityDate = `20${year}-${(months.indexOf(month.toLowerCase()) + 1).toString().padStart(2, '0')}-${day.padStart(2, '0')}`

    return {
      symbol,
      optionType: optionType.toLowerCase() as 'call' | 'put',
      maturityDate,
      strikePrice: parseFloat(strikePrice),
    }
  }

  // Fidelity/E-Trade QFX option format: "CALL AAPL 01/15/24 150" or "PUT MSFT 02/20/24 $300.50"
  const qfxRegex = /(CALL|PUT)\s+([A-Z]+)\s+(\d{2}\/\d{2}\/\d{2})\s+\$?(\d+(?:\.\d+)?)/i
  const qfxMatch = description.match(qfxRegex)
  if (qfxMatch) {
    const optionType = qfxMatch[1]
    const symbol = qfxMatch[2]
    const expiration = qfxMatch[3]
    const strikePrice = qfxMatch[4]
    
    if (!optionType || !symbol || !expiration || !strikePrice) {
      return null
    }
    
    const [month, day, year] = expiration.split('/')
    // TODO: Handle dates before 1999
    const maturityDate = `20${year}-${month}-${day}`

    return {
      symbol,
      optionType: optionType.toLowerCase() as 'call' | 'put',
      maturityDate,
      strikePrice: parseFloat(strikePrice),
    }
  }

  // Fidelity option symbol format: "-ARKK210917C127" (dash + underlying + YYMMDD + C/P + strike)
  const fidelitySymbolRegex = /^-?([A-Z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/i
  const fidelitySymbolMatch = description.match(fidelitySymbolRegex)
  if (fidelitySymbolMatch) {
    const symbol = fidelitySymbolMatch[1]
    const dateCode = fidelitySymbolMatch[2]
    const optType = fidelitySymbolMatch[3]
    const strike = fidelitySymbolMatch[4]

    if (!symbol || !dateCode || !optType || !strike) {
      return null
    }

    // dateCode: YYMMDD
    const yyyy = `20${dateCode.slice(0, 2)}`
    const mm = dateCode.slice(2, 4)
    const dd = dateCode.slice(4, 6)

    return {
      symbol: symbol.toUpperCase(),
      optionType: optType.toUpperCase() === 'C' ? 'call' : 'put',
      maturityDate: `${yyyy}-${mm}-${dd}`,
      strikePrice: parseFloat(strike),
    }
  }

  // Fidelity option description format: "CALL (ARKK) ARK ETF TR SEP 17 21 $127 (100 SHS)"
  const fidelityDescRegex = /^(CALL|PUT)\s+\(([A-Z]+)\)\s+.+?\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\s+(\d{2})\s+\$(\d+(?:\.\d+)?)/i
  const fidelityDescMatch = description.match(fidelityDescRegex)
  if (fidelityDescMatch) {
    const optionType = fidelityDescMatch[1]
    const symbol = fidelityDescMatch[2]
    const monthStr = fidelityDescMatch[3]
    const day = fidelityDescMatch[4]
    const year = fidelityDescMatch[5]
    const strike = fidelityDescMatch[6]

    if (!optionType || !symbol || !monthStr || !day || !year || !strike) {
      return null
    }

    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const mm = monthMap[monthStr.toUpperCase()] || '01'
    const yyyy = `20${year}`

    return {
      symbol: symbol.toUpperCase(),
      optionType: optionType.toLowerCase() as 'call' | 'put',
      maturityDate: `${yyyy}-${mm}-${day.padStart(2, '0')}`,
      strikePrice: parseFloat(strike),
    }
  }

  // IB space format: "AMZN 03OCT25 225 C" or "TSLA 15JAN24 470 P"
  const ibSpaceRegex = /^(\w+)\s+(\d{2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+([CP])$/i
  const ibSpaceMatch = description.match(ibSpaceRegex)
  if (ibSpaceMatch) {
    const symbol = ibSpaceMatch[1]
    const day = ibSpaceMatch[2]
    const monthStr = ibSpaceMatch[3]
    const year = ibSpaceMatch[4]
    const strike = ibSpaceMatch[5]
    const optType = ibSpaceMatch[6]
    
    if (!symbol || !day || !monthStr || !year || !strike || !optType) {
      return null
    }

    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const mm = monthMap[monthStr.toUpperCase()] || '01'
    const yyyy = `20${year}`

    return {
      symbol: symbol.toUpperCase(),
      optionType: optType.toUpperCase() === 'C' ? 'call' : 'put',
      maturityDate: `${yyyy}-${mm}-${day}`,
      strikePrice: parseFloat(strike),
    }
  }

  // IB compact format: "TSLA  251024C00470000" (symbol + YYMMDD + C/P + strike*1000 padded to 8 digits)
  const ibCompactRegex = /^(\w+)\s+(\d{6})([CP])(\d{8})$/i
  const ibCompactMatch = description.match(ibCompactRegex)
  if (ibCompactMatch) {
    const symbol = ibCompactMatch[1]
    const dateCode = ibCompactMatch[2]
    const optType = ibCompactMatch[3]
    const strikeCode = ibCompactMatch[4]

    if (!symbol || !dateCode || !optType || !strikeCode) {
      return null
    }

    // dateCode: YYMMDD
    const yyyy = `20${dateCode.slice(0, 2)}`
    const mm = dateCode.slice(2, 4)
    const dd = dateCode.slice(4, 6)
    // strikeCode: 00470000 -> 470.0000 (divide by 1000)
    const strikePrice = parseInt(strikeCode, 10) / 1000

    return {
      symbol: symbol.toUpperCase(),
      optionType: optType.toUpperCase() === 'C' ? 'call' : 'put',
      maturityDate: `${yyyy}-${mm}-${dd}`,
      strikePrice,
    }
  }

  return null
}
