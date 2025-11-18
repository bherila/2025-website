interface Option {
  symbol: string
  optionType: 'call' | 'put'
  maturityDate: string
  strikePrice: number
}

export function parseOptionDescription(description: string): Option | null {
  // Etrade CSV option format
  const regex1 =
    /[\d\s]*([A-Z]+) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) '(\d{2}) \$([\d.]+) (Call|Put)/i

  const match1 = description.replace('\t', ' ').match(regex1)
  if (match1) {
    const [, symbol, month, day, year, strikePrice, optionType] = match1
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    // TODO: Handle dates before 1999
    const maturityDate = `20${year}-${(months.indexOf(month.toLowerCase()) + 1).toString().padStart(2, '0')}-${day}`

    return {
      symbol,
      optionType: optionType.toLowerCase() as 'call' | 'put',
      maturityDate,
      strikePrice: parseFloat(strikePrice),
    }
  }

  // Quicken QFX option format
  const regex2 = /(CALL|PUT)\s+([A-Z]+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d+(?:\.\d+)?)/
  const match2 = description.match(regex2)
  if (match2) {
    const [, optionType, symbol, expiration, strikePrice] = match2
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

  // Etrade CSV option format with tabs
  const regex3 = /(CALL|PUT)\s+([A-Z]+)\s+(\d{2}\/\d{2}\/\d{2})\s+\$?(\d+(?:\.\d+)?)/
  const match3 = description.match(regex3)
  if (match3) {
    const [, optionType, symbol, expiration, strikePrice] = match3
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

  return null
}
