import type { TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxRow, XlsxSheet, XlsxWorkbook } from '@/types/finance/xlsx-export'

type IndexedSheet = XlsxSheet & { rowIndex: Map<string, number> }

function buildSheet(name: string, rows: XlsxRow[]): IndexedSheet {
  const rowIndex = new Map<string, number>()
  rows.forEach((row, i) => {
    if (row.description) {
      rowIndex.set(row.description, i + 2)
    }
  })
  return { name, rows, rowIndex }
}

function hasExportableAmount(sheet: XlsxSheet): boolean {
  return sheet.rows.some((row) => row.amount !== undefined && row.amount !== null)
}

function sanitizeTabName(name: string): string {
  const stripped = name.replace(/[\\/*?:[\]]/g, '').trim()
  return (stripped || 'Sheet').slice(0, 31)
}

function dedupeTabNames(sheets: XlsxSheet[]): XlsxSheet[] {
  const used = new Map<string, number>()
  return sheets.map((sheet) => {
    const base = sanitizeTabName(sheet.name)
    const count = used.get(base) ?? 0
    if (count === 0) {
      used.set(base, 1)
      return { ...sheet, name: base }
    }

    let index = count + 1
    let candidate = `${base} (${index})`
    while (candidate.length > 31 || used.has(candidate)) {
      index += 1
      candidate = `${base.slice(0, Math.max(0, 31 - ` (${index})`.length))} (${index})`
    }
    used.set(base, index)
    used.set(candidate, 1)
    return { ...sheet, name: candidate }
  })
}

function quoteSheet(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`
}

function formulaRef(sheetName: string, row: number): string {
  return `=${quoteSheet(sheetName)}!C${row}`
}

export function buildTaxWorkbook(taxReturn: TaxReturn1040): XlsxWorkbook {
  const scheduleBSheet = taxReturn.scheduleB
    ? buildSheet('Schedule B', [
        { isHeader: true, description: 'Part I — Interest Income' },
        ...taxReturn.scheduleB.interestLines.map((line) => ({ description: line.label, amount: line.amount })),
        { line: '4', description: 'Line 4 — Total interest', amount: taxReturn.scheduleB.interestTotal, isTotal: true },
        { isHeader: true, description: 'Part II — Ordinary Dividends' },
        ...taxReturn.scheduleB.dividendLines.map((line) => ({ description: line.label, amount: line.amount })),
        { line: '6', description: 'Line 6 — Total ordinary dividends', amount: taxReturn.scheduleB.dividendTotal, isTotal: true },
        { line: '7', description: 'Line 7 — Qualified dividends', amount: taxReturn.scheduleB.qualifiedDivTotal },
      ])
    : null

  const scheduleCSheet = taxReturn.scheduleC
    ? buildSheet('Schedule C', [
        { line: '31', description: 'Net income / (loss)', amount: taxReturn.scheduleC.total, isTotal: true },
      ])
    : null

  const scheduleDSheet = taxReturn.scheduleD
    ? buildSheet('Schedule D', [
        { line: '16', description: 'Line 16 — Combined net capital gain (loss)', amount: taxReturn.scheduleD.schD_line16, isTotal: true },
        ...(taxReturn.scheduleD.schD_line16 < 0
          ? [{
              line: '21',
              description: `Line 21 — Capital loss applied to ${taxReturn.year} return`,
              amount: taxReturn.scheduleD.schD_line21,
              isTotal: true,
            }]
          : []),
      ])
    : null

  const scheduleESheet = taxReturn.scheduleE
    ? buildSheet('Schedule E', [
        { line: '1', description: 'Total passive income / (loss)', amount: taxReturn.scheduleE.totalPassive },
        { line: '2', description: 'Total nonpassive income / (loss)', amount: taxReturn.scheduleE.totalNonpassive },
        { line: '3', description: 'Schedule E combined total', amount: taxReturn.scheduleE.grandTotal, isTotal: true },
      ])
    : null

  const form4952Sheet = taxReturn.form4952
    ? buildSheet('Form 4952', [
        { line: '3', description: 'Line 3 — Total investment interest', amount: taxReturn.form4952.totalInvIntExpense * -1 },
        { line: '4e', description: 'Line 4e — NII (no QD election)', amount: taxReturn.form4952.niiBefore },
        { line: '6', description: 'Line 6 — Deductible investment interest expense', amount: taxReturn.form4952.deductibleInvestmentInterestExpense, isTotal: true },
        { line: '7', description: 'Line 7 — Disallowed carryforward', amount: taxReturn.form4952.disallowedCarryforward },
      ])
    : null

  const scheduleASheet = taxReturn.scheduleA
    ? buildSheet('Schedule A', [
        {
          line: '9',
          description: 'Line 9 — Investment interest expense (from Form 4952)',
          amount: taxReturn.scheduleA.totalInvIntExpense,
          formula: form4952Sheet?.rowIndex.get('Line 6 — Deductible investment interest expense')
            ? formulaRef('Form 4952', form4952Sheet.rowIndex.get('Line 6 — Deductible investment interest expense')!)
            : undefined,
          isTotal: true,
        },
      ])
    : null

  const form1116Sheet = taxReturn.form1116
    ? buildSheet('Form 1116', [
        { line: '1', description: 'Total foreign passive income', amount: taxReturn.form1116.totalPassiveIncome },
        { line: '2', description: 'Total foreign taxes paid', amount: taxReturn.form1116.totalForeignTaxes, isTotal: true },
      ])
    : null

  const shortDivSheet = taxReturn.shortDividends
    ? buildSheet('Short Dividends', [
        { line: '1', description: 'Total itemized deduction', amount: taxReturn.shortDividends.totalItemizedDeduction },
        { line: '2', description: 'Total cost basis', amount: taxReturn.shortDividends.totalCostBasis },
        { line: '3', description: 'Total unknown', amount: taxReturn.shortDividends.totalUnknown },
      ])
    : null

  const scheduleBLine4 = scheduleBSheet?.rowIndex.get('Line 4 — Total interest')
  const scheduleBLine6 = scheduleBSheet?.rowIndex.get('Line 6 — Total ordinary dividends')
  const scheduleDLine16 = scheduleDSheet?.rowIndex.get('Line 16 — Combined net capital gain (loss)')
  const scheduleDLine21 = scheduleDSheet?.rowIndex.get(`Line 21 — Capital loss applied to ${taxReturn.year} return`)
  const scheduleCNetIncome = scheduleCSheet?.rowIndex.get('Net income / (loss)')
  const scheduleECombined = scheduleESheet?.rowIndex.get('Schedule E combined total')
  const form4952Line6 = form4952Sheet?.rowIndex.get('Line 6 — Deductible investment interest expense')

  const line1a = taxReturn.form1040?.find((line) => line.line === '1a')?.value ?? undefined
  const line2b = scheduleBLine4 ? taxReturn.scheduleB?.interestTotal : undefined
  const line3b = scheduleBLine6 ? taxReturn.scheduleB?.dividendTotal : undefined
  const line7 = scheduleDLine21
    ? taxReturn.scheduleD?.schD_line21
    : scheduleDLine16
      ? taxReturn.scheduleD?.schD_line16
      : undefined
  const line8 = (
    (taxReturn.scheduleC?.total ?? 0) + (taxReturn.scheduleE?.grandTotal ?? 0)
  ) || undefined

  const line9Value = [line1a, line2b, line3b, line7, line8].reduce<number>((sum, val) => sum + Number(val ?? 0), 0)
  const line9FormulaParts = ['C2']
  if (scheduleBLine4) line9FormulaParts.push('C3')
  if (scheduleBLine6) line9FormulaParts.push('C4')
  if (scheduleDLine16 || scheduleDLine21) line9FormulaParts.push('C5')
  if (scheduleCNetIncome || scheduleECombined) line9FormulaParts.push('C6')

  const form1040Sheet = taxReturn.form1040
    ? buildSheet('Form 1040', [
        { line: '1a', description: 'Wages, salaries, tips (W-2, box 1)', amount: line1a },
        {
          line: '2b',
          description: 'Taxable interest',
          amount: line2b,
          formula: scheduleBLine4 ? formulaRef('Schedule B', scheduleBLine4) : undefined,
          note: scheduleBLine4 ? '→ Schedule B' : undefined,
        },
        {
          line: '3b',
          description: 'Ordinary dividends',
          amount: line3b,
          formula: scheduleBLine6 ? formulaRef('Schedule B', scheduleBLine6) : undefined,
          note: scheduleBLine6 ? '→ Schedule B' : undefined,
        },
        {
          line: '7',
          description: 'Capital gain or loss',
          amount: line7,
          formula: scheduleDLine21
            ? formulaRef('Schedule D', scheduleDLine21)
            : scheduleDLine16
              ? formulaRef('Schedule D', scheduleDLine16)
              : undefined,
          note: scheduleDLine16 ? '→ Schedule D' : undefined,
        },
        {
          line: '8',
          description: 'Business income or loss',
          amount: line8,
          formula: [
            scheduleCNetIncome ? formulaRef('Schedule C', scheduleCNetIncome).slice(1) : null,
            scheduleECombined ? formulaRef('Schedule E', scheduleECombined).slice(1) : null,
          ].filter(Boolean).length > 0
            ? `=${[
                scheduleCNetIncome ? formulaRef('Schedule C', scheduleCNetIncome).slice(1) : null,
                scheduleECombined ? formulaRef('Schedule E', scheduleECombined).slice(1) : null,
              ].filter(Boolean).join('+')}`
            : undefined,
          note: scheduleCNetIncome || scheduleECombined ? '→ Schedule C / E' : undefined,
        },
        {
          line: '9',
          description: 'Total income',
          amount: line9Value === 0 ? undefined : line9Value,
          formula: line9FormulaParts.length > 1 ? `=${line9FormulaParts.join('+')}` : undefined,
          isTotal: true,
        },
        {
          line: '20',
          description: 'Foreign tax credit',
          amount: taxReturn.form4952?.deductibleInvestmentInterestExpense,
          formula: form4952Line6 ? formulaRef('Form 4952', form4952Line6) : undefined,
          note: form4952Line6 ? '→ Form 4952' : undefined,
        },
      ])
    : null

  const k1Sheets = (taxReturn.k1Docs ?? []).map((entry) => {
    const rows: XlsxRow[] = [
      { isHeader: true, description: 'Fields' },
      ...Object.entries(entry.fields).map(([key, value]) => ({
        line: key,
        description: `Field ${key}`,
        amount: typeof value === 'number' ? value : undefined,
        note: typeof value === 'string' ? value : undefined,
      })),
      { isHeader: true, description: 'Codes' },
      ...Object.entries(entry.codes).flatMap(([box, items]) => items.map((item) => ({
        line: box,
        description: `Code ${item.code}`,
        note: item.value,
      }))),
    ]
    return buildSheet(`K-1 ${entry.entityName}`, rows)
  })

  const k3Sheets = (taxReturn.k3Docs ?? []).map((entry) => buildSheet(
    `K-3 ${entry.entityName}`,
    entry.sections.map((section) => ({
      description: `${section.sectionId} — ${section.title}`,
      note: JSON.stringify(section.data),
    })),
  ))

  const docs1099Sheets = (taxReturn.docs1099 ?? []).map((entry) => buildSheet(
    `${entry.formType.toUpperCase().replaceAll('_', '-')} ${entry.payerName}`,
    Object.entries(entry.parsedData).map(([key, value]) => ({
      line: key,
      description: key,
      amount: typeof value === 'number' ? value : undefined,
      note: typeof value === 'number' ? undefined : String(value ?? ''),
    })),
  ))

  const orderedSheets = [
    form1040Sheet,
    scheduleASheet,
    scheduleBSheet,
    scheduleCSheet,
    scheduleDSheet,
    scheduleESheet,
    form1116Sheet,
    form4952Sheet,
    shortDivSheet,
    ...k1Sheets,
    ...k3Sheets,
    ...docs1099Sheets,
  ]
    .filter((sheet): sheet is IndexedSheet => Boolean(sheet))
    .filter((sheet) => hasExportableAmount(sheet))

  return {
    filename: `tax-preview-${taxReturn.year}.xlsx`,
    sheets: dedupeTabNames(orderedSheets),
  }
}
