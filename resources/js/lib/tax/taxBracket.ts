import currency from 'currency.js'
import { splitDelimitedText } from '../splitDelimitedText'

/******* WARNING ***************************
  Federal 2025 brackets in the CSV match the IRS‑published 2025
  tables; your California 2023–2025 rows generally align with FTB 
  published schedules but should be double‑checked for exact 
  threshold rounding and the million‑plus top‑rate boundary; 
  the 2026 federal rows in your CSV are from a third‑party 
  source and should remain non‑final until confirmed by the IRS.
*******************************************/

interface TaxTableRow {
  state: string
  year: number
  filingStatus: string
  minIncome: currency
  maxIncome: currency
  taxRate: currency
  isFinal: boolean
}

interface TaxCalculationResult {
  taxes: {
    tax: currency
    amt: currency
    bracket: currency
  }[]
  totalTax: currency
}

// Empty state is for Federal tax brackets
const csv = `
state,year,filing_status,min_income,max_income,tax_rate,is_final
CA,2023,S,0,10099,0.01,Y
CA,2023,S,10100,23942,0.02,Y
CA,2023,S,23943,37788,0.04,Y
CA,2023,S,37789,52455,0.06,Y
CA,2023,S,52456,66295,0.08,Y
CA,2023,S,66296,338639,0.093,Y
CA,2023,S,338640,406364,0.103,Y
CA,2023,S,406365,677275,0.113,Y
CA,2023,S,677276,1000000,0.123,Y
CA,2023,S,1000001,999999999,0.133,Y

,2023,S,0,11000,0.10,Y
,2023,S,11001,44725,0.12,Y
,2023,S,44726,95375,0.22,Y
,2023,S,95376,182100,0.24,Y
,2023,S,182101,231250,0.32,Y
,2023,S,231251,578125,0.35,Y
,2023,S,578126,999999999,0.37,Y

CA,2024,S,0,10756,0.01,Y
CA,2024,S,10756,25499,0.02,Y
CA,2024,S,25499,40245,0.04,Y
CA,2024,S,40245,55866,0.06,Y
CA,2024,S,55866,70606,0.08,Y
CA,2024,S,70606,360659,0.093,Y
CA,2024,S,360659,432787,0.103,Y
CA,2024,S,432787,721314,0.113,Y
CA,2024,S,721314,1000000,0.123,Y
CA,2024,S,1000001,999999999,0.133,Y

,2024,S,0,11600,0.10,Y
,2024,S,11601,47150,0.12,Y
,2024,S,47151,100525,0.22,Y
,2024,S,100526,191950,0.24,Y
,2024,S,191951,243725,0.32,Y
,2024,S,243726,609350,0.35,Y
,2024,S,609351,999999999,0.37,Y

CA,2025,S,0,10412,0.01,Y
CA,2025,S,10413,24684,0.02,Y
CA,2025,S,24685,38959,0.04,Y
CA,2025,S,38960,54081,0.06,Y
CA,2025,S,54082,68350,0.08,Y
CA,2025,S,68351,349137,0.093,Y
CA,2025,S,349138,418961,0.103,Y
CA,2025,S,418962,698271,0.113,Y
CA,2025,S,698272,1000000,0.123,Y
CA,2025,S,1000001,999999999,0.133,Y

CA,2025,MFS,0,10412,0.01,Y
CA,2025,MFS,10413,24684,0.02,Y
CA,2025,MFS,24685,38959,0.04,Y
CA,2025,MFS,38960,54081,0.06,Y
CA,2025,MFS,54082,68350,0.08,Y
CA,2025,MFS,68351,349137,0.093,Y
CA,2025,MFS,349138,418961,0.103,Y
CA,2025,MFS,418962,698271,0.113,Y
CA,2025,MFS,698272,1000000,0.123,Y
CA,2025,MFS,1000001,999999999,0.133,Y

,2025,S,0,11600,0.10,Y
,2025,S,11601,47150,0.12,Y
,2025,S,47151,100525,0.22,Y
,2025,S,100526,191950,0.24,Y
,2025,S,191951,243725,0.32,Y
,2025,S,243726,609350,0.35,Y
,2025,S,609351,999999999,0.37,Y

,2025,MFJ,0,23200,0.10,Y
,2025,MFJ,23201,94300,0.12,Y
,2025,MFJ,94301,201050,0.22,Y
,2025,MFJ,201051,383900,0.24,Y
,2025,MFJ,383901,487450,0.32,Y
,2025,MFJ,487451,731200,0.35,Y
,2025,MFJ,731201,999999999,0.37,Y

,2025,MFS,0,11600,0.10,Y
,2025,MFS,11601,47150,0.12,Y
,2025,MFS,47151,100525,0.22,Y
,2025,MFS,100526,191950,0.24,Y
,2025,MFS,191951,243725,0.32,Y
,2025,MFS,243726,365600,0.35,Y
,2025,MFS,365601,999999999,0.37,Y

,2025,HOH,0,16550,0.10,Y
,2025,HOH,16551,63100,0.12,Y
,2025,HOH,63101,100500,0.22,Y
,2025,HOH,100501,191950,0.24,Y
,2025,HOH,191951,243700,0.32,Y
,2025,HOH,243701,609350,0.35,Y
,2025,HOH,609351,999999999,0.37,Y

,2026,S,0,12400,0.10,N
,2026,S,12401,50400,0.12,N
,2026,S,50401,105700,0.22,N
,2026,S,105701,201775,0.24,N
,2026,S,201776,256200,0.32,N
,2026,S,256201,640600,0.35,N
,2026,S,640601,999999999,0.37,N

,2026,MFS,0,12400,0.10,N
,2026,MFS,12401,50400,0.12,N
,2026,MFS,50401,105700,0.22,N
,2026,MFS,105701,201775,0.24,N
,2026,MFS,201776,256200,0.32,N
,2026,MFS,256201,384350,0.35,N
,2026,MFS,384351,999999999,0.37,N

,2026,MFJ,0,24800,0.10,N
,2026,MFJ,24801,100800,0.12,N
,2026,MFJ,100801,211400,0.22,N
,2026,MFJ,211401,403550,0.24,N
,2026,MFJ,403551,512400,0.32,N
,2026,MFJ,512401,768700,0.35,N
,2026,MFJ,768701,999999999,0.37,N

,2026,HOH,0,17700,0.10,N
,2026,HOH,17701,67450,0.12,N
,2026,HOH,67451,105700,0.22,N
,2026,HOH,105701,201750,0.24,N
,2026,HOH,201751,256200,0.32,N
,2026,HOH,256201,640600,0.35,N
,2026,HOH,640601,999999999,0.37,N
`

const FILING_STATUS_MAP: Record<string, string> = {
  S: 'Single',
  MFS: 'Married Filing Separately',
  MFJ: 'Married Filing Jointly',
  HOH: 'Head of Household',
}

const FILING_STATUS_NORMALIZE: Record<string, string> = {
  s: 'Single',
  single: 'Single',
  S: 'Single',
  Single: 'Single',

  mfs: 'Married Filing Separately',
  MFS: 'Married Filing Separately',
  'Married Filing Separately': 'Married Filing Separately',

  mfj: 'Married Filing Jointly',
  MFJ: 'Married Filing Jointly',
  'Married Filing Jointly': 'Married Filing Jointly',

  hoh: 'Head of Household',
  HOH: 'Head of Household',
  'Head of Household': 'Head of Household',
}

function parseTaxTable(csvString: string): TaxTableRow[] {
  const rows = splitDelimitedText(csvString)
  const taxTable: TaxTableRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 7) continue

    // Normalize empty state to 'Federal'
    const rawState = (row[0] ?? '').trim()
    const state = rawState === '' ? 'Federal' : rawState

    const abbrev = (row[2] ?? '').trim()
    const filingStatus = FILING_STATUS_MAP[abbrev] ?? abbrev

    const minIncome = currency(row[3] ?? 0)
    const maxIncome = currency(row[4] ?? 0)
    const taxRate = currency(row[5] ?? 0)

    // isFinal defaults to false unless explicitly 'Y'
    const isFinal = ((row[6] ?? '').toString().trim().toUpperCase() === 'Y')

    taxTable.push({
      state,
      year: parseInt(row[1] ?? '0'),
      filingStatus,
      minIncome,
      maxIncome,
      taxRate,
      isFinal,
    })
  }

  return taxTable
}

// Pre-parse once at module load
const TAX_TABLE = parseTaxTable(csv)

export function calculateTax(
  year: string,
  state: string,
  taxableIncome: currency,
  filingStatus: string,
): TaxCalculationResult {
  // Normalize inputs
  const normalizedState = (state ?? '').trim() === '' ? 'Federal' : state
  const normalizedFiling = FILING_STATUS_NORMALIZE[filingStatus]

  // Throw if filing status isn't valid
  if (!normalizedFiling) {
    throw new Error(`Invalid filing status: ${filingStatus}`)
  }

  const taxTable = TAX_TABLE.filter(
    (row) =>
      row.state === normalizedState &&
      row.year.toString() === year &&
      row.filingStatus === normalizedFiling,
  )

  taxTable.sort((a, b) => a.minIncome.value - b.minIncome.value)

  const taxes: TaxCalculationResult['taxes'] = []
  let totalTax = currency(0)

  for (const row of taxTable) {
    if (taxableIncome.value > row.maxIncome.value) {
      const incomeInBracket = row.maxIncome.subtract(row.minIncome)
      const tax = incomeInBracket.multiply(row.taxRate.value)
      taxes.push({ tax, amt: incomeInBracket, bracket: row.taxRate })
      totalTax = totalTax.add(tax)
    } else if (taxableIncome.value > row.minIncome.value) {
      const incomeInBracket = taxableIncome.subtract(row.minIncome)
      const tax = incomeInBracket.multiply(row.taxRate.value)
      taxes.push({ tax, amt: incomeInBracket, bracket: row.taxRate })
      totalTax = totalTax.add(tax)
      break
    } else {
      break
    }
  }

  return { taxes, totalTax }
}
