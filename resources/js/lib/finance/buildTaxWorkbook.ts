import currency from 'currency.js'

import { ALL_K1_CODES, K1_SPEC_BY_BOX } from '@/components/finance/k1'
import type { TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxRow, XlsxSheet, XlsxWorkbook } from '@/types/finance/xlsx-export'

/**
 * Routing notes for key K-1 boxes, showing where values come from (K-3 source)
 * and where they flow on the return (destination forms/schedules).
 */
const K1_ROUTING_NOTES: Record<string, string> = {
  '5':  '<< K-3, II, line 6 | >> Sch B line 1 / Form 1040 line 2b',
  '21': '<< K-3, III, section 4 (see K-3 for country breakdown)',
}

/** Routing notes for specific box + code combinations. */
const K1_CODE_ROUTING_NOTES: Record<string, Record<string, string>> = {
  '11': { A: '<< K-3, II, line 20 | >> Form 6781 / Sch D line 4 or 11' },
  '13': { L: '<< K-3, II, line 42 | >> Form 4952 line 1 / Sch A line 16 — do NOT enter on Form 8582' },
  '20': {
    A: '>> Form 4952, II, line 4a',
    B: '>> Form 4952, II, line 5',
  },
}

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

function hasExportableContent(sheet: XlsxSheet): boolean {
  return sheet.rows.some(
    (row) => row.amount !== undefined || row.formula !== undefined || row.note !== undefined,
  )
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

/** Build a SUM formula over a range of detail rows (header row excluded), falling back to the computed value. */
function sumFormula(firstDetailExcelRow: number, lastDetailExcelRow: number): string {
  return `=SUM(C${firstDetailExcelRow}:C${lastDetailExcelRow})`
}

export function buildTaxWorkbook(taxReturn: TaxReturn1040): XlsxWorkbook {
  // ── Overview ────────────────────────────────────────────────────────────────
  const overviewSheet = taxReturn.overviewSections && taxReturn.overviewSections.length > 0
    ? (() => {
        const rows: XlsxRow[] = []
        for (const section of taxReturn.overviewSections!) {
          rows.push({ isHeader: true, description: section.heading })
          for (const row of section.rows) {
            rows.push({ description: row.item, amount: row.amount, note: row.note })
          }
        }
        return buildSheet('Overview', rows)
      })()
    : null


  // ── Schedule B ──────────────────────────────────────────────────────────────
  const scheduleBSheet = taxReturn.scheduleB
    ? (() => {
        const intStart = 3 // excel row where first interest line appears (row 2 = header)
        const intLines = taxReturn.scheduleB.interestLines.map((line) => ({
          description: line.label,
          amount: line.amount,
        }))
        const intEnd = intStart + intLines.length - 1
        const intTotalRow = intEnd + 1

        const divStart = intTotalRow + 2 // +1 for total row, +1 for Part II header
        const divLines = taxReturn.scheduleB.dividendLines.map((line) => ({
          description: line.label,
          amount: line.amount,
        }))
        const divEnd = divStart + divLines.length - 1
        const divTotalRow = divEnd + 1
        const qualDivRow = divTotalRow + 1

        const rows: XlsxRow[] = [
          { isHeader: true, description: 'Part I — Interest Income' },
          ...intLines,
          {
            line: '4',
            description: 'Line 4 — Total interest',
            amount: taxReturn.scheduleB.interestTotal,
            formula: intLines.length > 0 ? sumFormula(intStart, intEnd) : undefined,
            isTotal: true,
          },
          { isHeader: true, description: 'Part II — Ordinary Dividends' },
          ...divLines,
          {
            line: '6',
            description: 'Line 6 — Total ordinary dividends',
            amount: taxReturn.scheduleB.dividendTotal,
            formula: divLines.length > 0 ? sumFormula(divStart, divEnd) : undefined,
            isTotal: true,
          },
          {
            line: '7',
            description: 'Line 7 — Qualified dividends',
            amount: taxReturn.scheduleB.qualifiedDivTotal,
          },
        ]
        void intTotalRow
        void divTotalRow
        void qualDivRow
        return buildSheet('Schedule B', rows)
      })()
    : null

  // ── Schedule C ──────────────────────────────────────────────────────────────
  const scheduleCSheet = taxReturn.scheduleC
    ? buildSheet('Schedule C', [
        { line: '31', description: 'Net income / (loss)', amount: taxReturn.scheduleC.total, isTotal: true },
      ])
    : null

  // ── Schedule D ──────────────────────────────────────────────────────────────
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

  // ── Schedule E ──────────────────────────────────────────────────────────────
  const scheduleESheet = taxReturn.scheduleE
    ? buildSheet('Schedule E', [
        { line: '1', description: 'Total passive income / (loss)', amount: taxReturn.scheduleE.totalPassive },
        { line: '2', description: 'Total nonpassive income / (loss)', amount: taxReturn.scheduleE.totalNonpassive },
        {
          line: '3',
          description: 'Schedule E combined total',
          amount: taxReturn.scheduleE.grandTotal,
          formula: '=C2+C3',
          isTotal: true,
        },
      ])
    : null

  // ── Form 4952 ────────────────────────────────────────────────────────────────
  const form4952Sheet = taxReturn.form4952
    ? (() => {
        const srcLines = taxReturn.form4952.invIntSources.map((s) => ({
          description: s.label,
          amount: s.amount,
        }))
        const srcStart = 3
        const srcEnd = srcStart + srcLines.length - 1
        const rows: XlsxRow[] = [
          { isHeader: true, description: 'Investment Interest Expense Sources' },
          ...srcLines,
          {
            line: '3',
            description: 'Line 3 — Total investment interest',
            amount: taxReturn.form4952.totalInvIntExpense * -1,
            formula: srcLines.length > 0 ? `=-SUM(C${srcStart}:C${srcEnd})` : undefined,
          },
          { line: '4e', description: 'Line 4e — NII (no QD election)', amount: taxReturn.form4952.niiBefore },
          {
            line: '6',
            description: 'Line 6 — Deductible investment interest expense',
            amount: taxReturn.form4952.deductibleInvestmentInterestExpense,
            isTotal: true,
          },
          { line: '7', description: 'Line 7 — Disallowed carryforward', amount: taxReturn.form4952.disallowedCarryforward },
        ]
        return buildSheet('Form 4952', rows)
      })()
    : null

  // ── Schedule A ───────────────────────────────────────────────────────────────
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

  // ── Form 1116 ────────────────────────────────────────────────────────────────
  const form1116Sheet = taxReturn.form1116
    ? (() => {
        const f = taxReturn.form1116
        const incLines = f.incomeSources.map((s) => ({ description: s.label, amount: s.amount }))
        const taxLines = f.taxSources.map((s) => ({ description: s.label, amount: s.amount }))
        const genLines = f.generalIncomeSources.map((s) => ({ description: s.label, amount: s.amount }))

        const incStart = 3
        const incEnd = incStart + incLines.length - 1
        const taxStart = incEnd + 3
        const taxEnd = taxStart + taxLines.length - 1

        const rows: XlsxRow[] = [
          { isHeader: true, description: 'Part I — Foreign Source Passive Income' },
          ...incLines,
          {
            line: '1',
            description: 'Total foreign passive income',
            amount: f.totalPassiveIncome,
            formula: incLines.length > 0 ? sumFormula(incStart, incEnd) : undefined,
            isTotal: true,
          },
          { isHeader: true, description: 'Part II — Foreign Taxes Paid' },
          ...taxLines,
          {
            line: '2',
            description: 'Total foreign taxes paid',
            amount: f.totalForeignTaxes,
            formula: taxLines.length > 0 ? sumFormula(taxStart, taxEnd) : undefined,
            isTotal: true,
          },
        ]

        if (genLines.length > 0) {
          rows.push({ isHeader: true, description: 'General Category — Foreign Income' })
          rows.push(...genLines)
          rows.push({ line: 'G1', description: 'Total general category income', amount: f.totalGeneralIncome, isTotal: true })
        }

        if (f.line4bApportionment.length > 0) {
          rows.push({ isHeader: true, description: 'Line 4b — Apportioned Interest Expense (Asset Method)' })
          for (const row of f.line4bApportionment) {
            rows.push({ description: `${row.label} — allocable interest`, amount: row.interestExpense })
            rows.push({ description: `${row.label} — passive ratio`, amount: row.ratio })
            rows.push({ description: `${row.label} — Line 4b`, amount: row.line4b })
          }
          rows.push({ line: '4b', description: 'Total apportioned interest (Line 4b)', amount: f.totalLine4b, isTotal: true })
        }

        if (f.niit) {
          rows.push({ isHeader: true, description: 'Form 8960 — Net Investment Income Tax Estimate' })
          for (const c of f.niit.niiComponents) {
            rows.push({ description: c.label, amount: c.amount })
          }
          rows.push({ description: 'Total Net Investment Income', amount: f.niit.totalNII, isTotal: true })
          rows.push({ description: 'Estimated NIIT (3.8% × NII)', amount: f.niit.niitEstimate })
        }

        if (f.creditVsDeduction) {
          rows.push({ isHeader: true, description: 'Credit vs. Deduction Comparison' })
          rows.push({ description: 'Foreign Tax Credit (Form 1116) — dollar-for-dollar', amount: f.creditVsDeduction.creditValue })
          rows.push({ description: 'Foreign Tax Deduction (Sch. A) — at 37% marginal', amount: f.creditVsDeduction.deductionValue })
        }

        void taxEnd
        return buildSheet('Form 1116', rows)
      })()
    : null

  // ── Short Dividends ──────────────────────────────────────────────────────────
  const shortDivSheet = taxReturn.shortDividends
    ? buildSheet('Short Dividends', [
        { line: '1', description: 'Total itemized deduction', amount: taxReturn.shortDividends.totalItemizedDeduction },
        { line: '2', description: 'Total cost basis', amount: taxReturn.shortDividends.totalCostBasis },
        { line: '3', description: 'Total unknown', amount: taxReturn.shortDividends.totalUnknown },
      ])
    : null

  // ── Form 1040 cross-sheet references ────────────────────────────────────────
  const scheduleBLine4 = scheduleBSheet?.rowIndex.get('Line 4 — Total interest')
  const scheduleBLine6 = scheduleBSheet?.rowIndex.get('Line 6 — Total ordinary dividends')
  const scheduleDLine16 = scheduleDSheet?.rowIndex.get('Line 16 — Combined net capital gain (loss)')
  const scheduleDLine21 = scheduleDSheet?.rowIndex.get(`Line 21 — Capital loss applied to ${taxReturn.year} return`)
  const scheduleCNetIncome = scheduleCSheet?.rowIndex.get('Net income / (loss)')
  const scheduleECombined = scheduleESheet?.rowIndex.get('Schedule E combined total')
  const form1116Line2 = form1116Sheet?.rowIndex.get('Total foreign taxes paid')

  const line1a = taxReturn.form1040?.find((line) => line.line === '1a')?.value ?? undefined
  const line2b = scheduleBLine4 ? taxReturn.scheduleB?.interestTotal : undefined
  const line3b = scheduleBLine6 ? taxReturn.scheduleB?.dividendTotal : undefined
  const line7 = scheduleDLine21
    ? taxReturn.scheduleD?.schD_line21
    : scheduleDLine16
      ? taxReturn.scheduleD?.schD_line16
      : undefined

  // Use currency.js for safe monetary addition; keep undefined for truly unwired values
  const line8Value = currency(taxReturn.scheduleC?.total ?? 0).add(taxReturn.scheduleE?.grandTotal ?? 0).value
  const line8 = (taxReturn.scheduleC || taxReturn.scheduleE) ? line8Value : undefined

  const line9Value = currency(line1a ?? 0)
    .add(line2b ?? 0)
    .add(line3b ?? 0)
    .add(line7 ?? 0)
    .add(line8 ?? 0).value
  const line9 = line9Value !== 0 ? line9Value : undefined

  const line9FormulaParts: string[] = ['C2']
  if (scheduleBLine4) line9FormulaParts.push(`C3`)
  if (scheduleBLine6) line9FormulaParts.push(`C4`)
  if (scheduleDLine16 || scheduleDLine21) line9FormulaParts.push(`C5`)
  if (scheduleCNetIncome || scheduleECombined) line9FormulaParts.push(`C6`)

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
          amount: line9,
          formula: line9FormulaParts.length > 1 ? `=${line9FormulaParts.join('+')}` : undefined,
          isTotal: true,
        },
        {
          line: '20',
          description: 'Foreign tax credit (Form 1116)',
          amount: taxReturn.form1116?.totalForeignTaxes,
          formula: form1116Line2 ? formulaRef('Form 1116', form1116Line2) : undefined,
          note: form1116Line2 ? '→ Form 1116' : undefined,
        },
      ])
    : null

  // ── K-1 / K-3 / 1099 supplemental sheets ────────────────────────────────────
  const k1Sheets = (taxReturn.k1Docs ?? []).map((entry) => {
    const rows: XlsxRow[] = [
      { isHeader: true, description: 'Fields (Boxes A–O, 1–21)' },
      ...Object.entries(entry.fields).map(([key, value]) => {
        const spec = K1_SPEC_BY_BOX[key]
        const label = spec ? spec.label : `Box ${key}`
        const routing = K1_ROUTING_NOTES[key]
        return {
          line: key,
          description: label,
          amount: typeof value === 'number' ? value : undefined,
          note: typeof value === 'string' ? value : routing,
        }
      }),
      { isHeader: true, description: 'Coded Boxes (11, 13–20)' },
      ...Object.entries(entry.codes).flatMap(([box, items]) =>
        items.map((item) => {
          const codeLabel = ALL_K1_CODES[box]?.[item.code.toUpperCase()]
          const description = codeLabel ? `Box ${box} ${item.code} — ${codeLabel}` : `Box ${box} Code ${item.code}`
          const routing = K1_CODE_ROUTING_NOTES[box]?.[item.code.toUpperCase()]
          return {
            line: `${box}${item.code}`,
            description,
            amount: isNaN(Number(item.value)) ? undefined : Number(item.value),
            note: routing ?? (isNaN(Number(item.value)) ? item.value : undefined),
          }
        }),
      ),
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
    overviewSheet,
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
    .filter(hasExportableContent)

  return {
    filename: `tax-preview-${taxReturn.year}.xlsx`,
    sheets: dedupeTabNames(orderedSheets),
  }
}
