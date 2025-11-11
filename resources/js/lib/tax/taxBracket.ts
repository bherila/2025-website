import currency from 'currency.js'
import { splitDelimitedText } from '../splitDelimitedText'

interface TaxTableRow {
  state: string
  year: number
  filingStatus: string
  minIncome: currency
  maxIncome: currency
  taxRate: currency
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
state,year,filing_status,min_income,max_income,tax_rate
CA,2023,Single,0,10099,0.01
CA,2023,Single,10100,23942,0.02
CA,2023,Single,23943,37788,0.04
CA,2023,Single,37789,52455,0.06
CA,2023,Single,52456,66295,0.08
CA,2023,Single,66296,338639,0.093
CA,2023,Single,338640,406364,0.103
CA,2023,Single,406365,677275,0.113
CA,2023,Single,677276,1000000,0.123
CA,2023,Single,1000001,999999999,0.133
,2023,Single,0,11000,0.10
,2023,Single,11001,44725,0.12
,2023,Single,44726,95375,0.22
,2023,Single,95376,182100,0.24
,2023,Single,182101,231250,0.32
,2023,Single,231251,578125,0.35
,2023,Single,578126,999999999,0.37
CA,2024,Single,0,10756,0.01
CA,2024,Single,10756,25499,0.02
CA,2024,Single,25499,40245,0.04
CA,2024,Single,40245,55866,0.06
CA,2024,Single,55866,70606,0.08
CA,2024,Single,70606,360659,0.093
CA,2024,Single,360659,432787,0.103
CA,2024,Single,432787,721314,0.113
CA,2024,Single,721314,1000000,0.123
CA,2024,Single,1000001,999999999,0.123
,2024,Single,0,11600,0.10
,2024,Single,11601,47150,0.12
,2024,Single,47151,100525,0.22
,2024,Single,100526,191950,0.24
,2024,Single,191951,243725,0.32
,2024,Single,243726,609350,0.35
,2024,Single,609351,999999999,0.37
,2025,Single,0,11925,0.10
,2025,Single,11926,48475,0.12
,2025,Single,48476,103350,0.22
,2025,Single,103351,197300,0.24
,2025,Single,197301,250525,0.32
,2025,Single,250526,626350,0.35
,2025,Single,626351,999999999,0.37
,2025,Married Jointly,0,23850,0.10
,2025,Married Jointly,23851,96950,0.12
,2025,Married Jointly,96951,206700,0.22
,2025,Married Jointly,206701,394600,0.24
,2025,Married Jointly,394601,501050,0.32
,2025,Married Jointly,501051,751600,0.35
,2025,Married Jointly,751601,999999999,0.37
,2025,Married Filing Separately,0,11925,0.10
,2025,Married Filing Separately,11926,48475,0.12
,2025,Married Filing Separately,48476,103350,0.22
,2025,Married Filing Separately,103351,197300,0.24
,2025,Married Filing Separately,197301,250525,0.32
,2025,Married Filing Separately,250526,375800,0.35
,2025,Married Filing Separately,375801,999999999,0.37
,2025,Head of Household,0,17000,0.10
,2025,Head of Household,17001,64850,0.12
,2025,Head of Household,64851,103350,0.22
,2025,Head of Household,103351,197300,0.24
,2025,Head of Household,197301,250500,0.32
,2025,Head of Household,250501,626350,0.35
,2025,Head of Household,626351,999999999,0.37
CA,2025,Single,0,10412,0.01
CA,2025,Single,10413,24684,0.02
CA,2025,Single,24685,38959,0.04
CA,2025,Single,38960,54081,0.06
CA,2025,Single,54082,68350,0.08
CA,2025,Single,68351,349137,0.093
CA,2025,Single,349138,418961,0.103
CA,2025,Single,418962,698271,0.113
CA,2025,Single,698272,1000000,0.123
CA,2025,Single,1000001,999999999,0.133
CA,2025,Married Filing Separately,0,10412,0.01
CA,2025,Married Filing Separately,10413,24684,0.02
CA,2025,Married Filing Separately,24685,38959,0.04
CA,2025,Married Filing Separately,38960,54081,0.06
CA,2025,Married Filing Separately,54082,68350,0.08
CA,2025,Married Filing Separately,68351,349137,0.093
CA,2025,Married Filing Separately,349138,418961,0.103
CA,2025,Married Filing Separately,418962,698271,0.113
CA,2025,Married Filing Separately,698272,1000000,0.123
CA,2025,Married Filing Separately,1000001,999999999,0.133
`

function parseTaxTable(csvString: string): TaxTableRow[] {
  const rows = splitDelimitedText(csvString)
  const taxTable: TaxTableRow[] = []

  // Skip header row so i=1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    taxTable.push({
      state: row[0],
      year: parseInt(row[1]),
      filingStatus: row[2],
      minIncome: currency(row[3]),
      maxIncome: currency(row[4]),
      taxRate: currency(row[5]),
    })
  }

  return taxTable
}

export function calculateTax(
  year: string,
  state: string,
  taxableIncome: currency,
  filingStatus: string,
): TaxCalculationResult {
  const taxTables = parseTaxTable(csv)
  const taxTable = taxTables.filter(
    (row) => row.state === state && row.year.toString() === year && row.filingStatus === filingStatus,
  )
  taxTable.sort((a, b) => a.minIncome.value - b.minIncome.value)

  let taxes: TaxCalculationResult['taxes'] = []
  let totalTax = currency(0)

  for (const row of taxTable) {
    if (taxableIncome.intValue > row.maxIncome.intValue) {
      let incomeInBracket = row.maxIncome.subtract(row.minIncome)
      let tax = incomeInBracket.multiply(row.taxRate)
      taxes.push({ tax, amt: incomeInBracket, bracket: row.taxRate })
      totalTax = totalTax.add(tax)
    } else if (taxableIncome.intValue > row.minIncome.intValue) {
      let incomeInBracket = taxableIncome.subtract(row.minIncome)
      let tax = incomeInBracket.multiply(row.taxRate)
      taxes.push({ tax, amt: incomeInBracket, bracket: row.taxRate })
      totalTax = totalTax.add(tax)
      break
    } else {
      break
    }
  }

  return { taxes, totalTax }
}
