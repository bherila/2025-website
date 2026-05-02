import currency from 'currency.js'

import { ALL_K1_CODES, K1_SPEC_BY_BOX } from '@/components/finance/k1'
import { renderK3SectionsRows } from '@/finance/1116/k3-row-renderer'
import { K1_CODE_ROUTING_NOTES, K1_ROUTING_NOTES } from '@/lib/finance/k1RoutingNotes'
import { normalizeK1Code } from '@/lib/finance/k1Utils'
import { parseMoney } from '@/lib/finance/money'
import type { EstimatedTaxPaymentsData, TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxRow, XlsxSheet, XlsxWorkbook } from '@/types/finance/xlsx-export'

export { K1_CODE_ROUTING_NOTES, K1_ROUTING_NOTES }

function joinNotes(parts: Array<string | null | undefined>): string | undefined {
  const notes = parts.filter((part): part is string => Boolean(part))
  return notes.length > 0 ? notes.join(' | ') : undefined
}

function parseDestinationRows(
  source: string,
  amount: number | undefined,
  routingNote: string | undefined,
): XlsxRow[] {
  if (!routingNote) {
    return [{ description: source, amount, note: 'Status: Unrouted', line: source }]
  }

  const destinations = Array.from(routingNote.matchAll(/>>\s*([^|]+)/g)).map((m) => m[1]?.trim()).filter(Boolean) as string[]
  const lower = routingNote.toLowerCase()
  const status = lower.includes('taxpayer election required') || lower.includes('check k-1 attached statement') || lower.includes('not yet computed') || lower.includes('not yet implemented')
    ? 'User action'
    : lower.includes('suspended') || lower.includes('carryover tracking') || lower.includes('not deductible')
      ? 'Suspended'
      : 'Routed'

  if (destinations.length === 0) {
    return [{
      description: source,
      amount,
      note: `Status: ${status} | ${routingNote}`,
      line: source,
    }]
  }

  return destinations.map((destination, index) => ({
    description: source,
    amount: index === 0 ? amount : undefined,
    line: index === 0 ? source : undefined,
    note: `Destination: ${destination} | Status: ${status}`,
  }))
}

function buildK1WorksheetSheet(entry: NonNullable<TaxReturn1040['k1Docs']>[number]): IndexedSheet {
  const rows: XlsxRow[] = []
  const rawBoxRows = Object.entries(entry.fields)
    .map(([key, value]) => {
      const spec = K1_SPEC_BY_BOX[key]
      const label = spec ? spec.label : `Box ${key}`
      const numeric = typeof value === 'number' ? value : Number(value)
      return {
        box: key,
        label,
        value,
        amount: Number.isFinite(numeric) ? numeric : undefined,
      }
    })

  const partnerInfoRows = rawBoxRows.filter((row) =>
    ['A', 'B', 'E', 'F', 'G', 'H1', 'H2'].includes(row.box) ||
    row.box.startsWith('J_') ||
    row.box.startsWith('K_') ||
    row.box.startsWith('L_'),
  )
  if (partnerInfoRows.length > 0) {
    rows.push({ isHeader: true, description: '1. Partner Info' })
    rows.push(...partnerInfoRows.map((row) => ({
      line: row.box,
      description: row.label,
      ...(row.amount !== undefined ? { amount: row.amount } : { note: String(row.value) }),
    })))
  }

  const part3Rows = rawBoxRows.filter((row) => /^[0-9]/.test(row.box) && !row.box.includes('_'))
  if (part3Rows.length > 0) {
    rows.push({ isHeader: true, description: '2. Part III — Raw K-1 Values (boxes 1–21)' })
    rows.push(...part3Rows.map((row) => ({
      line: row.box,
      description: row.label,
      ...(row.amount !== undefined ? { amount: row.amount } : { note: String(row.value) }),
    })))
  }

  const codedOrder = ['11', '13', '14', '15', '16', '17', '18', '19', '20']
  const codedRows = codedOrder.flatMap((box) => (entry.codes[box] ?? []).map((item) => ({ box, item })))
  if (codedRows.length > 0) {
    rows.push({ isHeader: true, description: '3. Part III — Coded Items' })
    rows.push(...codedRows.map(({ box, item }) => {
      const code = normalizeK1Code(item.code)
      const codeLabel = ALL_K1_CODES[box]?.[code] ?? `Code ${code}`
      const numVal = parseMoney(item.value)
      const routing = K1_CODE_ROUTING_NOTES[box]?.[code]
      const character = item.character === 'short'
        ? 'Character: short-term'
        : item.character === 'long'
          ? 'Character: long-term'
          : undefined
      return {
        line: `${box}${code}`,
        description: `Box ${box} ${code} — ${codeLabel}`,
        ...(numVal !== null ? { amount: numVal } : {}),
        note: joinNotes([
          item.notes ? `Statement: ${item.notes}` : undefined,
          character,
          routing,
          numVal === null && item.value ? `Raw value: ${item.value}` : undefined,
        ]),
      }
    }))
  }

  if (entry.passiveActivities && entry.passiveActivities.length > 0) {
    rows.push({ isHeader: true, description: '3a. Box 11 S — Per-Activity Passive Items (Form 8582)' })
    rows.push(...entry.passiveActivities.map((pa) => ({
      description: pa.name,
      amount: currency(pa.currentIncome).add(pa.currentLoss).value,
      note: `Income: ${currency(pa.currentIncome).format()} | Loss: ${currency(pa.currentLoss).format()} → Form 8582`,
    })))
    rows.push({
      description: 'Total passive activities net',
      amount: entry.passiveActivities.reduce(
        (acc, pa) => acc.add(pa.currentIncome).add(pa.currentLoss),
        currency(0),
      ).value,
      isTotal: true,
    })
  }

  const k3Rows = entry.k3Sections ? renderK3SectionsRows(entry.k3Sections) : []
  if (k3Rows.length > 0) {
    rows.push({ isHeader: true, description: '4. K-3 Summary' })
    rows.push(...k3Rows)
  }

  const routedFieldRows = part3Rows.filter((row) => K1_ROUTING_NOTES[row.box])
  if (codedRows.length > 0 || routedFieldRows.length > 0) {
    rows.push({ isHeader: true, description: '5. Destination Summary — Where each line flows' })
    rows.push(
      ...codedRows.flatMap(({ box, item }) => {
        const code = normalizeK1Code(item.code)
        const amount = parseMoney(item.value) ?? undefined
        const routing = K1_CODE_ROUTING_NOTES[box]?.[code]
        const characterNote = item.character === 'short'
          ? 'Character: short-term'
          : item.character === 'long'
            ? 'Character: long-term'
            : undefined
        return parseDestinationRows(`Box ${box}${code}`, amount, joinNotes([item.notes, characterNote, routing]))
      }),
      ...routedFieldRows.flatMap((row) => parseDestinationRows(
        `Box ${row.box}`,
        row.amount,
        K1_ROUTING_NOTES[row.box],
      )),
    )
  }

  rows.push({ isHeader: true, description: '6. Cross-references' })
  rows.push(
    { description: 'Form 1116 sheet', note: 'See: Form 1116' },
    { description: 'Form 4952 sheet', note: 'See: Form 4952' },
    { description: 'Form 8995 sheet', note: 'See: Form 8995' },
    { description: 'Schedule A sheet', note: 'See: Schedule A' },
    { description: 'Schedule B sheet', note: 'See: Schedule B' },
    { description: 'Schedule D sheet', note: 'See: Schedule D' },
    { description: 'Schedule SE sheet', note: 'See: Schedule SE' },
  )

  return buildSheet(`K-1 ${entry.entityName}`, rows)
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

/** Wrap a builder's plain-XlsxSheet output (or null) into an IndexedSheet for cross-sheet refs. */
function wrapSheet(sheet: XlsxSheet | null): IndexedSheet | null {
  return sheet ? buildSheet(sheet.name, sheet.rows) : null
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

/**
 * Standalone sheet builders that registry entries can wire up via `xlsx.build`.
 * These return plain XlsxSheet (without the rowIndex map) since they have no
 * cross-sheet formula refs that need it. Sheets that need rowIndex (Schedule B,
 * Schedule SE, etc.) stay inline in buildTaxWorkbook for now.
 */

export function buildScheduleCSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.scheduleC) {
    return null
  }
  return {
    name: 'Schedule C',
    rows: [
      {
        line: '31',
        description: 'Net income / (loss)',
        amount: taxReturn.scheduleC.total,
        isTotal: true,
      },
    ],
  }
}

export function buildScheduleESheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.scheduleE) {
    return null
  }
  return {
    name: 'Schedule E',
    rows: [
      { line: '1', description: 'Total passive income / (loss)', amount: taxReturn.scheduleE.totalPassive },
      { line: '2', description: 'Total nonpassive income / (loss)', amount: taxReturn.scheduleE.totalNonpassive },
      {
        line: '3',
        description: 'Schedule E combined total',
        amount: taxReturn.scheduleE.grandTotal,
        formula: '=C2+C3',
        isTotal: true,
      },
    ],
  }
}

/**
 * Assemble the registry-contributed sheets from a form registry. Each entry
 * with an `xlsx.build` field contributes one sheet (or none if `build` returns
 * null or the sheet has no exportable content). Sheets are sorted by `order`.
 *
 * Used by `buildTaxWorkbook` for the migrated forms; non-migrated sheets stay
 * inline in `buildTaxWorkbook` until their builders are extracted.
 */
export function assembleRegistrySheets(
  taxReturn: TaxReturn1040,
  registry: Record<string, { xlsx?: { sheetName: () => string; order?: number; build: (taxReturn: TaxReturn1040) => XlsxSheet | null } }>,
): XlsxSheet[] {
  const candidates: { order: number; sheet: XlsxSheet }[] = []
  for (const entry of Object.values(registry)) {
    if (!entry.xlsx) {
      continue
    }
    const sheet = entry.xlsx.build(taxReturn)
    if (!sheet || !hasExportableContent(sheet)) {
      continue
    }
    candidates.push({ order: entry.xlsx.order ?? 999, sheet })
  }
  candidates.sort((a, b) => a.order - b.order)
  return candidates.map((c) => c.sheet)
}

export function buildCapitalLossCarryoverSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.capitalLossCarryover?.hasCarryover) {
    return null
  }
  const c = taxReturn.capitalLossCarryover
  return {
    name: 'Capital Loss Carryover',
    rows: [
      { description: 'Net short-term capital gain/(loss)', amount: c.netShortTerm },
      { description: 'Net long-term capital gain/(loss)', amount: c.netLongTerm },
      { description: 'Combined net capital gain/(loss)', amount: c.combined, isTotal: true },
      { description: 'Applied to ordinary income this year (max $3,000)', amount: c.appliedToOrdinaryIncome },
      { description: 'Short-term capital loss carryforward', amount: -c.shortTermCarryover },
      { description: 'Long-term capital loss carryforward', amount: -c.longTermCarryover },
      {
        description: 'Total capital loss carryforward → next year Schedule D',
        amount: -c.totalCarryover,
        isTotal: true,
      },
    ],
  }
}

export function buildForm461Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form461) {
    return null
  }
  const f = taxReturn.form461
  return {
    name: 'Form 461',
    rows: [
      { line: '9', description: 'Line 9 — Aggregate trade/business income (loss)', amount: f.aggregateBusinessIncomeLoss, isTotal: true },
      ...(f.k1Disclosures && f.k1Disclosures.length > 0
        ? [
            { isHeader: true, description: 'K-1 Box 20AJ Support — Informational Only' } as XlsxRow,
            ...f.k1Disclosures.flatMap((row) => [
              { description: `${row.partnerName} — capital gains from trade/business`, amount: row.capitalGains },
              { description: `${row.partnerName} — capital losses from trade/business`, amount: row.capitalLosses },
              { description: `${row.partnerName} — other income from trade/business`, amount: row.otherIncome },
              { description: `${row.partnerName} — other deductions from trade/business`, amount: row.otherDeductions },
              { description: `${row.partnerName} — Box 20AJ disclosed net`, amount: row.net, note: 'Support for Form 461 only; do not separately deduct.' },
            ] satisfies XlsxRow[]),
          ]
        : []),
      { line: '15', description: 'Line 15 — EBL limit (filing-status threshold)', amount: f.eblLimit },
      {
        line: '16',
        description: f.isTriggered
          ? 'Line 16 — Excess business loss → Schedule 1 Line 8p (NOL carryforward)'
          : 'Line 16 — No excess (within limit)',
        amount: f.isTriggered ? -f.excessBusinessLoss : 0,
        isTotal: true,
      },
    ],
  }
}

export function buildForm8582Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form8582 || taxReturn.form8582.activities.length === 0) {
    return null
  }
  const f = taxReturn.form8582
  const activityRows: XlsxRow[] = f.activities.flatMap((a) => [
    ...(a.currentIncome !== 0
      ? [{ description: `${a.activityName}${a.isRentalRealEstate ? ' [Rental RE]' : ''} — Line 1a (income)`, amount: a.currentIncome }]
      : []),
    ...(a.currentLoss !== 0
      ? [{ description: `${a.activityName}${a.isRentalRealEstate ? ' [Rental RE]' : ''} — Line 1b (loss)`, amount: a.currentLoss }]
      : []),
    ...(a.priorYearUnallowed !== 0
      ? [{ description: `${a.activityName} — Line 1c (prior-year unallowed)`, amount: a.priorYearUnallowed }]
      : []),
  ])
  const carryforwardRows: XlsxRow[] = f.activities
    .filter((a) => a.allowedLossThisYear > 0 || a.suspendedLossCarryforward > 0)
    .flatMap((a) => [
      { description: `${a.activityName} — Allowed this year`, amount: a.allowedLossThisYear },
      ...(a.suspendedLossCarryforward > 0
        ? [{ description: `${a.activityName} — Suspended carryforward`, amount: a.suspendedLossCarryforward }]
        : []),
    ])
  const perActivityNetRows: XlsxRow[] = f.activities.map((a) => ({
    description: `${a.activityName}${a.isRentalRealEstate ? ' [Rental RE]' : ''} — Net gain/loss`,
    amount: a.overallGainOrLoss,
  }))
  return {
    name: 'Form 8582',
    rows: [
      { isHeader: true, description: 'Part I — Passive Activities' },
      ...activityRows,
      { line: '1a', description: 'Total passive income', amount: f.totalPassiveIncome, isTotal: true },
      { line: '1b', description: 'Total passive loss', amount: f.totalPassiveLoss },
      ...(f.totalPriorYearUnallowed !== 0
        ? [{ line: '1c', description: 'Prior-year unallowed losses', amount: f.totalPriorYearUnallowed }]
        : []),
      { line: '1d', description: 'Net passive result', amount: f.netPassiveResult, isTotal: true },
      { isHeader: true, description: 'Part II — Special Allowance' },
      { description: 'Modified AGI', amount: f.magi },
      { description: 'Rental real estate special allowance', amount: f.rentalAllowance },
      ...(f.realEstateProfessional
        ? [{ description: 'Real estate professional election (§469(c)(7))', amount: 0 }]
        : []),
      { isHeader: true, description: 'Part III — Allowed vs. Suspended' },
      { description: 'Total allowed passive loss', amount: -f.totalAllowedLoss, isTotal: true },
      { description: 'Net deduction to return', amount: -f.netDeductionToReturn },
      { description: 'Suspended loss — carried forward', amount: -f.totalSuspendedLoss, isTotal: f.isLossLimited },
      ...(carryforwardRows.length > 0
        ? [{ isHeader: true, description: 'Worksheet 5 — Per-Activity Allocation' } as XlsxRow, ...carryforwardRows]
        : []),
      { isHeader: true, description: 'Per-Activity Net Gain/Loss' },
      ...perActivityNetRows,
    ],
  }
}

export function buildForm6251Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form6251) {
    return null
  }
  const f = taxReturn.form6251
  const sourceStart = 3
  const sourceEnd = sourceStart + f.sourceEntries.length - 1
  const rows: XlsxRow[] = [
    { isHeader: true, description: 'K-1 Box 17 / AMT Source Items' },
    ...f.sourceEntries.map((entry) => ({
      description: `${entry.label} — Box 17${entry.code} → Line ${entry.line}`,
      amount: entry.amount,
      note: entry.description,
    })),
    {
      description: 'Total K-1 AMT source items',
      amount: f.sourceEntries.reduce((total, entry) => currency(total).add(entry.amount).value, 0),
      formula: f.sourceEntries.length > 0 ? sumFormula(sourceStart, sourceEnd) : undefined,
      isTotal: true,
    },
    { isHeader: true, description: 'Part I — Alternative Minimum Taxable Income' },
    { line: '1', description: 'Line 1 — Taxable income', amount: f.line1TaxableIncome },
    { line: '2a', description: 'Line 2a — Taxes / standard deduction addback', amount: f.line2aTaxesOrStandardDeduction },
    ...(f.line2cInvestmentInterest !== 0 ? [{ line: '2c', description: 'Line 2c — Investment interest adjustment', amount: f.line2cInvestmentInterest }] : []),
    ...(f.line2dDepletion !== 0 ? [{ line: '2d', description: 'Line 2d — Depletion adjustment', amount: f.line2dDepletion }] : []),
    ...(f.line2kDispositionOfProperty !== 0 ? [{ line: '2k', description: 'Line 2k — Disposition of property', amount: f.line2kDispositionOfProperty }] : []),
    ...(f.line2lPost1986Depreciation !== 0 ? [{ line: '2l', description: 'Line 2l — Post-1986 depreciation', amount: f.line2lPost1986Depreciation }] : []),
    ...(f.line2mPassiveActivities !== 0 ? [{ line: '2m', description: 'Line 2m — Passive activities', amount: f.line2mPassiveActivities }] : []),
    ...(f.line2nLossLimitations !== 0 ? [{ line: '2n', description: 'Line 2n — Loss limitations', amount: f.line2nLossLimitations }] : []),
    ...(f.line2tIntangibleDrillingCosts !== 0 ? [{ line: '2t', description: 'Line 2t — Intangible drilling costs', amount: f.line2tIntangibleDrillingCosts }] : []),
    ...(f.line3OtherAdjustments !== 0 ? [{ line: '3', description: 'Line 3 — Other adjustments', amount: f.line3OtherAdjustments }] : []),
    { line: '4', description: 'Line 4 — Alternative minimum taxable income (AMTI)', amount: f.amti, isTotal: true },
    { isHeader: true, description: 'Part II — Alternative Minimum Tax' },
    {
      line: '5',
      description: 'Line 5 — AMT exemption',
      amount: f.exemption,
      note: `Base ${currency(f.exemptionBase).format()} less phaseout ${currency(f.exemptionReduction).format()}`,
    },
    { line: '6', description: 'Line 6 — AMT tax base after exemption', amount: f.amtTaxBase },
    { line: '7', description: 'Line 7 — AMT before foreign tax credit', amount: f.amtBeforeForeignCredit },
    ...(f.line8AmtForeignTaxCredit > 0 ? [{ line: '8', description: 'Line 8 — AMT foreign tax credit', amount: f.line8AmtForeignTaxCredit }] : []),
    { line: '9', description: 'Line 9 — Tentative minimum tax', amount: f.tentativeMinTax, isTotal: true },
    { line: '10', description: 'Line 10 — Regular tax after credits', amount: f.regularTaxAfterCredits },
    { line: '11', description: 'Line 11 — Alternative minimum tax', amount: f.amt, isTotal: true, note: '→ Schedule 2 Line 2' },
  ]
  if (f.requiresStatementReview) {
    rows.push({ isHeader: true, description: 'Manual review notes' })
    rows.push(...f.manualReviewReasons.map((reason) => ({ description: reason })))
  }
  return { name: 'Form 6251', rows }
}

export function buildForm8995Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form8995) {
    return null
  }
  const f = taxReturn.form8995
  const entryStart = 3
  const entryEnd = entryStart + f.entries.length - 1
  const rows: XlsxRow[] = [
    { isHeader: true, description: 'Per-Partnership QBI (Box 20 Code S)' },
    ...f.entries.map((e) => ({ description: `${e.label} — QBI income`, amount: e.qbiIncome })),
    {
      line: '1',
      description: 'Line 1 — Total qualified business income',
      amount: f.totalQBI,
      formula: f.entries.length > 0 ? sumFormula(entryStart, entryEnd) : undefined,
      isTotal: true,
    },
    {
      line: '15',
      description: 'Line 15 — Estimated taxable income',
      amount: f.estimatedTaxableIncome,
      note: 'Total income minus estimated standard deduction',
    },
    {
      line: '16',
      description: 'Line 16 — Net capital gains (enter from Schedule D)',
      note: 'Enter from return — reduces taxable income cap',
    },
    {
      line: '17',
      description: 'Line 17 — Taxable income cap (20% × Line 15)',
      amount: f.taxableIncomeCap,
      isTotal: true,
    },
    {
      line: '13',
      description: 'Line 13 — 20% × total QBI (after netting losses)',
      amount: f.totalQBIComponent,
    },
    {
      line: '13',
      description: 'QBI Deduction — lesser of 20% QBI or taxable income cap',
      amount: f.estimatedDeduction,
      isTotal: true,
      note: '→ Form 1040 Line 13',
    },
  ]
  if (f.aboveThreshold) {
    rows.push({
      description: '⚠ Above threshold — use Form 8995-A; W-2 wage/UBIA limitation applies',
      note: `Threshold: Single $${f.thresholdSingle.toLocaleString()} / MFJ $${f.thresholdMFJ.toLocaleString()}`,
    })
  }
  return { name: 'Form 8995', rows }
}

export function buildForm8959Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form8959 || taxReturn.form8959.additionalTax <= 0) {
    return null
  }
  const f = taxReturn.form8959
  const srcRows: XlsxRow[] =
    f.sources.length > 0
      ? [
          { isHeader: true, description: 'W-2 Sources (Box 1 wages)' },
          ...f.sources.map((s) => ({ description: s.label, amount: s.wages })),
        ]
      : []
  return {
    name: 'Form 8959',
    rows: [
      ...srcRows,
      {
        line: '1',
        description: 'Line 1 — Medicare wages (W-2 Box 1 approx; exact = Box 5)',
        amount: f.wages,
        isTotal: srcRows.length > 0,
        note: 'Box 5 (Medicare wages) may exceed Box 1 when 401k deferrals apply',
      },
      {
        line: '5',
        description: `Line 5 — Threshold (${f.threshold === 200_000 ? 'Single/HOH' : 'MFJ'})`,
        amount: f.threshold,
      },
      { line: '6', description: 'Line 6 — Wages above threshold', amount: f.excessWages },
      {
        line: '7',
        description: 'Line 7 — Additional Medicare Tax (0.9%) → Schedule 2 Line 11',
        amount: f.additionalTax,
        isTotal: true,
      },
    ],
  }
}

export function buildForm8960Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form8960) {
    return null
  }
  const f = taxReturn.form8960
  const rows: XlsxRow[] = [
    { isHeader: true, description: 'Part I — Net Investment Income' },
    ...f.interestSources.map((s) => ({ description: `  ${s.label}`, amount: s.amount })),
    { line: '1', description: 'Taxable interest (Schedule B)', amount: f.taxableInterest, isTotal: f.interestSources.length > 0 },
    ...f.dividendSources.map((s) => ({ description: `  ${s.label}`, amount: s.amount })),
    { line: '2', description: 'Ordinary dividends (Schedule B)', amount: f.ordinaryDividends, isTotal: f.dividendSources.length > 0 },
    { line: '5a', description: 'Net capital gains (Schedule D, capped at 0)', amount: f.netCapGains },
    ...f.passiveSources.map((s) => ({ description: `  ${s.label}`, amount: s.amount })),
    { line: '4a', description: 'Net passive income (K-1 Schedule E)', amount: f.passiveIncome, isTotal: f.passiveSources.length > 0 },
    ...(f.nonpassiveTradingIncome !== 0
      ? [{ line: '4a', description: 'Net nonpassive trading income/loss (K-1 Schedule E)', amount: f.nonpassiveTradingIncome, note: 'Trader-fund ordinary items included in NII.' }]
      : []),
    { line: '8', description: 'Line 8 — Gross NII', amount: f.grossNII, isTotal: true },
    { isHeader: true, description: 'Part II — Deductions' },
    { line: '9a', description: 'Investment interest expense (Form 4952)', amount: -f.investmentInterestExpense },
    { line: '11', description: 'Line 11 — Total deductions', amount: -f.totalDeductions, isTotal: true },
    { isHeader: true, description: 'Part III — NIIT Computation' },
    { line: '12', description: 'Net Investment Income (Line 8 − 11)', amount: f.netInvestmentIncome, isTotal: true },
    { line: '13', description: 'Modified AGI (estimated)', amount: f.magi },
    { line: '14', description: `Threshold (${f.threshold === 200_000 ? 'Single/HOH' : 'MFJ'})`, amount: f.threshold },
    { line: '15', description: 'MAGI excess over threshold', amount: f.magiExcess },
    {
      line: '17',
      description: 'NIIT (3.8% × lesser of Line 12 or 15) → Schedule 2 Line 12',
      amount: f.niitTax,
      isTotal: true,
    },
  ]
  return { name: 'Form 8960', rows }
}

export function buildForm4952Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form4952) {
    return null
  }
  const f = taxReturn.form4952
  const srcLines = f.invIntSources.map((s) => ({
    description: s.label,
    amount: s.amount,
    note: s.scheduleEDeductionEligible
      ? `Allowed ${currency(s.allowedAmount ?? 0).format()} routes to Schedule E Part II; disallowed amount carries forward.`
      : undefined,
  }))
  const srcStart = 3
  const srcEnd = srcStart + srcLines.length - 1
  const expLines = (f.invExpSources ?? []).map((s) => ({ description: s.label, amount: s.amount }))
  const rows: XlsxRow[] = [
    { isHeader: true, description: 'Part I — Investment Interest Expense Sources' },
    ...srcLines,
    {
      line: '3',
      description: 'Line 3 — Total investment interest',
      amount: f.totalInvIntExpense * -1,
      formula: srcLines.length > 0 ? `=-SUM(C${srcStart}:C${srcEnd})` : undefined,
    },
    { isHeader: true, description: 'Part II — Net Investment Income' },
    ...(expLines.length > 0
      ? [
          ...expLines,
          {
            line: '5',
            description: 'Line 5 — Investment expenses (Box 20B)',
            amount: (f.totalInvExp ?? 0) * -1,
            note: 'Reduces NII — Box 20B investment expenses from K-1',
          } as XlsxRow,
        ]
      : []),
    {
      line: '6',
      description: 'Line 6 — Net investment income (Line 4h − Line 5, no QD election)',
      amount: f.niiBefore,
      note: 'Floored at zero; basis for Line 8 deductible interest',
    },
    {
      line: '7',
      description: 'Line 7 — Disallowed investment interest expense carried to next year',
      amount: f.disallowedCarryforward,
    },
    ...(f.scheduleEDeductibleInvestmentInterestExpense > 0
      ? [{
          description: 'Allowed Box 13H routed to Schedule E Part II nonpassive',
          amount: f.scheduleEDeductibleInvestmentInterestExpense,
          note: 'AQR-style K-1 footnote treatment; included in Schedule E, not Schedule A.',
        } as XlsxRow]
      : []),
    {
      line: '8',
      description: 'Line 8 — Investment interest expense deduction (smaller of Line 3 or Line 6)',
      amount: f.deductibleInvestmentInterestExpense,
      isTotal: true,
    },
  ]
  return { name: 'Form 4952', rows }
}

export function buildScheduleSESheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.scheduleSE || taxReturn.scheduleSE.entries.length === 0) {
    return null
  }
  const s = taxReturn.scheduleSE
  const sourceStart = 3
  const sourceEnd = sourceStart + s.entries.length - 1
  return {
    name: 'Schedule SE',
    rows: [
      { isHeader: true, description: 'Part I — Self-Employment Earnings' },
      ...s.entries.map((entry) => ({ description: entry.label, amount: entry.amount })),
      {
        line: '2',
        description: 'Line 2 — Net earnings from self-employment',
        amount: s.netEarningsFromSE,
        formula: s.entries.length > 0 ? sumFormula(sourceStart, sourceEnd) : undefined,
        isTotal: true,
      },
      { line: '4a', description: 'Line 4a — 92.35% of net earnings', amount: s.seTaxableEarnings },
      {
        line: '7',
        description: 'Line 7 — Social Security wage base',
        amount: s.socialSecurityWageBase,
        note:
          s.socialSecurityWages > 0
            ? `Reduced by ${currency(s.socialSecurityWages).format()} already subject to Social Security tax`
            : undefined,
      },
      { line: '8a', description: 'Line 8a — Earnings subject to Social Security tax', amount: s.socialSecurityTaxableEarnings },
      { line: '10', description: 'Line 10 — Social Security tax (12.4%)', amount: s.socialSecurityTax },
      { line: '11', description: 'Line 11 — Medicare tax (2.9%)', amount: s.medicareTax },
      { line: '12', description: 'Line 12 — Self-employment tax → Schedule 2 Line 4', amount: s.seTax, isTotal: true },
      {
        description: 'Form 8959 — Additional Medicare tax on self-employment earnings',
        amount: s.additionalMedicareTax,
        note:
          s.additionalMedicareTaxableEarnings > 0
            ? `${currency(s.additionalMedicareTaxableEarnings).format()} above the ${currency(s.additionalMedicareThreshold).format()} threshold after wages`
            : 'No Additional Medicare tax from self-employment earnings',
      },
      {
        line: '13',
        description: 'Line 13 — Deductible half of self-employment tax → Schedule 1 Line 15',
        amount: s.deductibleSeTax,
        isTotal: true,
      },
    ],
  }
}

export function buildShortDividendsSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.shortDividends) {
    return null
  }
  return {
    name: 'Short Dividends',
    rows: [
      { line: '1', description: 'Total itemized deduction', amount: taxReturn.shortDividends.totalItemizedDeduction },
      { line: '2', description: 'Total cost basis', amount: taxReturn.shortDividends.totalCostBasis },
      { line: '3', description: 'Total unknown', amount: taxReturn.shortDividends.totalUnknown },
    ],
  }
}

export function buildScheduleDSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.scheduleD) {
    return null
  }
  const rows: XlsxRow[] = [
    {
      line: '16',
      description: 'Line 16 — Combined net capital gain (loss)',
      amount: taxReturn.scheduleD.schD_line16,
      isTotal: true,
    },
  ]
  if (taxReturn.scheduleD.schD_line16 < 0) {
    rows.push({
      line: '21',
      description: `Line 21 — Capital loss applied to ${taxReturn.year} return`,
      amount: taxReturn.scheduleD.schD_line21,
      isTotal: true,
    })
  }
  return { name: 'Schedule D', rows }
}

export function buildOverviewSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.overviewSections || taxReturn.overviewSections.length === 0) {
    return null
  }
  const rows: XlsxRow[] = []
  for (const section of taxReturn.overviewSections) {
    rows.push({ isHeader: true, description: section.heading })
    for (const row of section.rows) {
      rows.push({ description: row.item, amount: row.amount, note: row.note })
    }
  }
  return { name: 'Overview', rows }
}

export function buildScheduleBSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.scheduleB) {
    return null
  }
  // Excel rows are 1-based and the header row is row 1, so the first interest
  // detail row is excel row 3 (row 2 is the header card from buildSheet).
  const intStart = 3
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
  return { name: 'Schedule B', rows }
}

export function buildForm1116Sheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  if (!taxReturn.form1116) {
    return null
  }
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

  if (f.creditVsDeduction) {
    rows.push({ isHeader: true, description: 'Credit vs. Deduction Comparison' })
    rows.push({
      description: 'Foreign Tax Credit (Form 1116) — dollar-for-dollar',
      amount: f.creditVsDeduction.creditValue,
    })
    rows.push({
      description: 'Foreign Tax Deduction (Sch. A) — at 37% marginal',
      amount: f.creditVsDeduction.deductionValue,
    })
  }

  if (f.sbpElections && f.sbpElections.length > 0) {
    rows.push({ isHeader: true, description: 'Sourced-by-Partner (Col f) Election' })
    for (const e of f.sbpElections) {
      rows.push({ description: `${e.partnerName} — Col (f) net`, amount: e.sourcedByPartner })
      rows.push({
        description: `${e.partnerName} — Treat col (f) as U.S. source`,
        note: e.active
          ? 'Active — col (f) excluded from foreign income'
          : 'Inactive — col (f) included in foreign income',
      })
    }
  }

  void taxEnd
  return { name: 'Form 1116', rows }
}

/**
 * Schedule A — line 9 (investment interest expense) cross-references Form 4952
 * line 8. The optional `refs.form4952Sheet` enables that formula; without it,
 * the sheet still exports correctly with the computed amount but no formula.
 */
export function buildScheduleASheet(
  taxReturn: TaxReturn1040,
  refs?: { form4952Sheet?: IndexedSheet | null },
): XlsxSheet | null {
  if (!taxReturn.scheduleA) {
    return null
  }
  const a = taxReturn.scheduleA
  const form4952Line8Row = refs?.form4952Sheet?.rowIndex.get(
    'Line 8 — Investment interest expense deduction (smaller of Line 3 or Line 6)',
  )
  const rows: XlsxRow[] = [
    {
      line: '7',
      description: 'Line 7 — State and local taxes paid (SALT, capped at $10,000)',
      amount: a.saltDeduction,
      note: 'W-2 Box 17 + user-entered SALT (state est tax, property tax, sales tax)',
    },
    ...(a.mortgageInterest > 0
      ? [{ line: '8', description: 'Line 8 — Mortgage interest', amount: a.mortgageInterest }]
      : []),
    {
      line: '9',
      description: 'Line 9 — Investment interest expense (from Form 4952)',
      amount: a.totalInvIntExpense,
      formula: form4952Line8Row ? formulaRef('Form 4952', form4952Line8Row) : undefined,
    },
    {
      line: '10',
      description: 'Line 10 — Total interest (mortgage + investment interest)',
      amount: currency(a.mortgageInterest).add(a.totalInvIntExpense).value,
      isTotal: true,
    },
    ...(a.charitable > 0
      ? [{ line: '11', description: 'Lines 11–12 — Charitable contributions', amount: a.charitable }]
      : []),
    ...(currency(a.otherDeductions).add(a.totalOtherItemized).value > 0
      ? [
          {
            line: '16',
            description: 'Line 16 — Other itemized deductions (user-entered + K-1 Box 13L)',
            amount: currency(a.otherDeductions).add(a.totalOtherItemized).value,
          },
        ]
      : []),
    {
      line: '17',
      description: 'Line 17 — Total itemized deductions',
      amount: a.totalItemizedDeductions,
      isTotal: true,
    },
    {
      description: `Standard deduction (${a.shouldItemize ? 'LOWER' : 'HIGHER'} — ${a.shouldItemize ? 'itemize' : 'take standard'})`,
      amount: a.standardDeduction,
      note: a.shouldItemize ? 'Use Schedule A' : 'Use standard deduction',
    },
  ]
  return { name: 'Schedule A', rows }
}

export interface Form1040SheetRefs {
  scheduleBSheet?: IndexedSheet | null
  scheduleCSheet?: IndexedSheet | null
  scheduleDSheet?: IndexedSheet | null
  scheduleESheet?: IndexedSheet | null
  scheduleSESheet?: IndexedSheet | null
  form1116Sheet?: IndexedSheet | null
  form6251Sheet?: IndexedSheet | null
  form8959Sheet?: IndexedSheet | null
  form8960Sheet?: IndexedSheet | null
  form8995Sheet?: IndexedSheet | null
}

/**
 * Form 1040 — references many other sheets via formula refs. Pass `refs`
 * with the wrapped IndexedSheet for each related sheet so the formula
 * targets resolve. Without refs, the sheet still exports correctly with
 * computed amounts but no cross-sheet formulas.
 */
export function buildForm1040Sheet(
  taxReturn: TaxReturn1040,
  refs?: Form1040SheetRefs,
): XlsxSheet | null {
  if (!taxReturn.form1040) {
    return null
  }
  const scheduleBLine4 = refs?.scheduleBSheet?.rowIndex.get('Line 4 — Total interest')
  const scheduleBLine6 = refs?.scheduleBSheet?.rowIndex.get('Line 6 — Total ordinary dividends')
  const scheduleDLine16 = refs?.scheduleDSheet?.rowIndex.get('Line 16 — Combined net capital gain (loss)')
  const scheduleDLine21 = refs?.scheduleDSheet?.rowIndex.get(
    `Line 21 — Capital loss applied to ${taxReturn.year} return`,
  )
  const scheduleCNetIncome = refs?.scheduleCSheet?.rowIndex.get('Net income / (loss)')
  const scheduleECombined = refs?.scheduleESheet?.rowIndex.get('Schedule E combined total')
  const form1116Line2 = refs?.form1116Sheet?.rowIndex.get('Total foreign taxes paid')
  const form6251Line11 = refs?.form6251Sheet?.rowIndex.get('Line 11 — Alternative minimum tax')
  const form8995Line13 = refs?.form8995Sheet?.rowIndex.get(
    'QBI Deduction — lesser of 20% QBI or taxable income cap',
  )
  const scheduleSELine12 = refs?.scheduleSESheet?.rowIndex.get(
    'Line 12 — Self-employment tax → Schedule 2 Line 4',
  )
  const scheduleSELine13 = refs?.scheduleSESheet?.rowIndex.get(
    'Line 13 — Deductible half of self-employment tax → Schedule 1 Line 15',
  )
  const scheduleSEAdditionalMedicare = refs?.scheduleSESheet?.rowIndex.get(
    'Form 8959 — Additional Medicare tax on self-employment earnings',
  )
  const form8959Line7 = refs?.form8959Sheet?.rowIndex.get(
    'Line 7 — Additional Medicare Tax (0.9%) → Schedule 2 Line 11',
  )
  const form8960Line17 = refs?.form8960Sheet?.rowIndex.get(
    'NIIT (3.8% × lesser of Line 12 or 15) → Schedule 2 Line 12',
  )
  const schedule2FormulaRefs = [
    form6251Line11 ? formulaRef('Form 6251', form6251Line11).slice(1) : null,
    scheduleSELine12 ? formulaRef('Schedule SE', scheduleSELine12).slice(1) : null,
    scheduleSEAdditionalMedicare ? formulaRef('Schedule SE', scheduleSEAdditionalMedicare).slice(1) : null,
    form8959Line7 ? formulaRef('Form 8959', form8959Line7).slice(1) : null,
    form8960Line17 ? formulaRef('Form 8960', form8960Line17).slice(1) : null,
  ].filter(Boolean)

  const lineMap = new Map((taxReturn.form1040 ?? []).map((line) => [line.line, line.value] as const))

  const line1a = lineMap.get('1a') ?? undefined
  const line2b = lineMap.get('2b') ?? (scheduleBLine4 ? taxReturn.scheduleB?.interestTotal : undefined)
  const line3b = lineMap.get('3b') ?? (scheduleBLine6 ? taxReturn.scheduleB?.dividendTotal : undefined)
  const line4a = lineMap.get('4a') ?? undefined
  const line4b = lineMap.get('4b') ?? undefined
  const line5a = lineMap.get('5a') ?? undefined
  const line5b = lineMap.get('5b') ?? undefined
  const line7 =
    lineMap.get('7') ??
    (scheduleDLine21
      ? taxReturn.scheduleD?.schD_line21
      : scheduleDLine16
        ? taxReturn.scheduleD?.schD_line16
        : undefined)

  const line8 =
    lineMap.get('8') ?? (taxReturn.schedule1 ? taxReturn.schedule1.partI.line10_total : undefined)

  const line9Value = currency(line1a ?? 0)
    .add(line2b ?? 0)
    .add(line3b ?? 0)
    .add(line4b ?? 0)
    .add(line5b ?? 0)
    .add(line7 ?? 0)
    .add(line8 ?? 0).value
  const line9 = lineMap.get('9') ?? (line9Value !== 0 ? line9Value : undefined)
  const line10 = lineMap.get('10') ?? taxReturn.schedule1?.partII.line26_totalAdjustments ?? undefined
  const line11 =
    lineMap.get('11') ??
    (line9 !== undefined || line10 !== undefined
      ? currency(line9 ?? 0).subtract(line10 ?? 0).value
      : undefined)
  const line17 = lineMap.get('17') ?? taxReturn.schedule2?.totalAdditionalTaxes ?? undefined
  const line20 = lineMap.get('20') ?? taxReturn.form1116?.totalForeignTaxes ?? undefined

  // Schedule 1 "other income" residual (1099-MISC routed to line 8) — surfaced
  // as a literal addend in the Excel formula since there's no Schedule 1 sheet
  // to reference. Without this, the line 8 formula previously summed only
  // Schedule C + Schedule E, silently under-reporting line 8 in Excel exports.
  const line8ScheduleCEContribution = currency(taxReturn.scheduleC?.total ?? 0).add(
    taxReturn.scheduleE?.grandTotal ?? 0,
  ).value
  const line8OtherIncomeResidual =
    line8 !== undefined ? currency(line8).subtract(line8ScheduleCEContribution).value : 0
  const line8FormulaTerms: string[] = [
    ...(scheduleCNetIncome ? [formulaRef('Schedule C', scheduleCNetIncome).slice(1)] : []),
    ...(scheduleECombined ? [formulaRef('Schedule E', scheduleECombined).slice(1)] : []),
    ...(line8OtherIncomeResidual !== 0 ? [String(line8OtherIncomeResidual)] : []),
  ]
  const line8Formula = line8FormulaTerms.length > 0 ? `=${line8FormulaTerms.join('+')}` : undefined
  const line8Note =
    line8OtherIncomeResidual !== 0
      ? '→ Schedule C / E + Schedule 1 other income'
      : scheduleCNetIncome || scheduleECombined
        ? '→ Schedule C / E'
        : undefined

  const rows: XlsxRow[] = [
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
    { line: '4a', description: 'IRA distributions', amount: line4a },
    { line: '4b', description: 'IRA taxable amount', amount: line4b },
    { line: '5a', description: 'Pensions and annuities', amount: line5a },
    { line: '5b', description: 'Pension / annuity taxable amount', amount: line5b },
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
      description: 'Additional income (Schedule 1)',
      amount: line8,
      formula: line8Formula,
      note: line8Note,
    },
    { line: '9', description: 'Total income', amount: line9, isTotal: true },
    {
      line: '10',
      description: 'Adjustments to income (Schedule 1)',
      amount: line10,
      formula: scheduleSELine13 ? formulaRef('Schedule SE', scheduleSELine13) : undefined,
      note: scheduleSELine13 ? '→ Schedule SE / Schedule 1' : undefined,
    },
    { line: '11', description: 'Adjusted gross income', amount: line11, isTotal: true },
    {
      line: '13',
      description: 'Qualified business income deduction (Form 8995)',
      amount: taxReturn.form8995?.estimatedDeduction,
      formula: form8995Line13 ? formulaRef('Form 8995', form8995Line13) : undefined,
      note: form8995Line13 ? '→ Form 8995' : undefined,
    },
    {
      line: '17',
      description: 'Other taxes (Schedule 2)',
      amount: line17,
      formula:
        schedule2FormulaRefs.length > 0 ? `=${schedule2FormulaRefs.join('+')}` : undefined,
      note: '→ Form 6251 + Schedule SE + Form 8959 + Form 8960',
    },
    {
      line: '20',
      description: 'Foreign tax credit (Form 1116)',
      amount: line20,
      formula: form1116Line2 ? formulaRef('Form 1116', form1116Line2) : undefined,
      note: form1116Line2 ? '→ Form 1116' : undefined,
    },
  ]

  // Self-reference formulas: line 9 = SUM of constituent income lines, line 11
  // = line 9 − line 10. Row positions are derived from the actual array order
  // so adding/removing rows above doesn't silently break formulas.
  const excelRowOf = (lineLabel: string): number | null => {
    const idx = rows.findIndex((r) => r.line === lineLabel)
    return idx >= 0 ? idx + 2 : null
  }

  const line9SourceRows = ['1a', '2b', '3b', '4b', '5b', '7', '8']
    .map(excelRowOf)
    .filter((r): r is number => r !== null)
  const line9Row = rows.find((r) => r.line === '9')
  if (line9Row && line9 !== undefined && line9SourceRows.length > 1) {
    line9Row.formula = `=${line9SourceRows.map((r) => `C${r}`).join('+')}`
  }

  const line9Pos = excelRowOf('9')
  const line10Pos = excelRowOf('10')
  const line11Row = rows.find((r) => r.line === '11')
  if (line11Row && line11 !== undefined && line9Pos !== null && line10Pos !== null) {
    line11Row.formula = `=C${line9Pos}-C${line10Pos}`
  }

  return { name: 'Form 1040', rows }
}

export function buildEstimatedTaxSheet(taxReturn: TaxReturn1040): XlsxSheet | null {
  const estimatedTaxPayments = taxReturn.estimatedTaxPayments
  if (!estimatedTaxPayments || estimatedTaxPayments.priorYearTax <= 0) {
    return null
  }

  const multiplierPercent = Math.round(estimatedTaxPayments.multiplier * 100)
  const agiThresholdMessage =
    estimatedTaxPayments.priorYearAgi > estimatedTaxPayments.agiThresholdApplied
      ? `Above ${currency(estimatedTaxPayments.agiThresholdApplied).format()} threshold → ${multiplierPercent}% method`
      : `At or below ${currency(estimatedTaxPayments.agiThresholdApplied).format()} threshold → ${multiplierPercent}% method`
  const rows: XlsxRow[] = [
    {
      isHeader: true,
      description: `Safe Harbor Method — ${multiplierPercent}% of ${estimatedTaxPayments.planningYear - 1} Tax`,
    },
    {
      description: `${estimatedTaxPayments.planningYear - 1} AGI (prior year)`,
      amount: estimatedTaxPayments.priorYearAgi,
      note: agiThresholdMessage,
    },
    {
      description: `${estimatedTaxPayments.planningYear - 1} total tax (prior year)`,
      amount: estimatedTaxPayments.priorYearTax,
    },
    {
      description: `Safe harbor amount (${multiplierPercent}%)`,
      amount: estimatedTaxPayments.safeHarborAmount,
      isTotal: true,
    },
    {
      description: `Expected ${estimatedTaxPayments.planningYear} federal withholding`,
      amount: estimatedTaxPayments.expectedWithholding,
    },
    {
      description: 'Net estimated tax due',
      amount: estimatedTaxPayments.netDue,
      isTotal: true,
    },
    { isHeader: true, description: `${estimatedTaxPayments.planningYear} Payment Schedule` },
    ...estimatedTaxPayments.quarterlyPayments.map(
      (payment: EstimatedTaxPaymentsData['quarterlyPayments'][number]) => ({
        line: `Q${payment.paymentNumber}`,
        description: `Payment ${payment.paymentNumber} — Due ${payment.dueDate}`,
        amount: payment.amount,
      }),
    ),
  ]

  return { name: 'Est. Tax Payments', rows }
}

export function buildTaxWorkbook(taxReturn: TaxReturn1040): XlsxWorkbook {
  // Each sheet is built via its standalone exported function. `wrapSheet()`
  // adds the `rowIndex` map needed for cross-sheet formula refs (Schedule A
  // line 9 → Form 4952, Form 1040 lines → many). Schedule A and Form 1040
  // take an explicit refs param so their formulas resolve declaratively.
  const overviewSheet = wrapSheet(buildOverviewSheet(taxReturn))
  const scheduleBSheet = wrapSheet(buildScheduleBSheet(taxReturn))
  const scheduleCSheet = wrapSheet(buildScheduleCSheet(taxReturn))
  const scheduleDSheet = wrapSheet(buildScheduleDSheet(taxReturn))
  const scheduleESheet = wrapSheet(buildScheduleESheet(taxReturn))
  const scheduleSESheet = wrapSheet(buildScheduleSESheet(taxReturn))
  const form4952Sheet = wrapSheet(buildForm4952Sheet(taxReturn))
  const scheduleASheet = wrapSheet(buildScheduleASheet(taxReturn, { form4952Sheet }))
  const form1116Sheet = wrapSheet(buildForm1116Sheet(taxReturn))
  const form6251Sheet = wrapSheet(buildForm6251Sheet(taxReturn))
  const form8995Sheet = wrapSheet(buildForm8995Sheet(taxReturn))
  const form8959Sheet = wrapSheet(buildForm8959Sheet(taxReturn))
  const form8960Sheet = wrapSheet(buildForm8960Sheet(taxReturn))
  const capitalLossSheet = wrapSheet(buildCapitalLossCarryoverSheet(taxReturn))
  const form461Sheet = wrapSheet(buildForm461Sheet(taxReturn))
  const form8582Sheet = wrapSheet(buildForm8582Sheet(taxReturn))
  const shortDivSheet = wrapSheet(buildShortDividendsSheet(taxReturn))

  const form1040Sheet = wrapSheet(
    buildForm1040Sheet(taxReturn, {
      scheduleBSheet,
      scheduleCSheet,
      scheduleDSheet,
      scheduleESheet,
      scheduleSESheet,
      form1116Sheet,
      form6251Sheet,
      form8959Sheet,
      form8960Sheet,
      form8995Sheet,
    }),
  )

  // ── K-1 / K-3 / 1099 supplemental sheets (per-doc dynamic — stay inline) ────
  // These don't fit the singleton-per-FormId registry model; one XLSX sheet
  // is produced per document instance, so they're assembled here directly.
  const k1Sheets = (taxReturn.k1Docs ?? []).map((entry) => buildK1WorksheetSheet(entry))

  const k3Sheets = (taxReturn.k3Docs ?? []).map((entry) =>
    buildSheet(`K-3 ${entry.entityName}`, renderK3SectionsRows(entry.sections)),
  )

  const docs1099Sheets = (taxReturn.docs1099 ?? []).map((entry) =>
    buildSheet(
      `${entry.formType.toUpperCase().replaceAll('_', '-')} ${entry.payerName}`,
      Object.entries(entry.parsedData).map(([key, value]) => ({
        line: key,
        description: key,
        amount: typeof value === 'number' ? value : undefined,
        note: typeof value === 'number' ? undefined : String(value ?? ''),
      })),
    ),
  )

  const estTaxSheet = wrapSheet(buildEstimatedTaxSheet(taxReturn))

  const orderedSheets = [
    overviewSheet,
    form1040Sheet,
    scheduleASheet,
    scheduleBSheet,
    scheduleCSheet,
    scheduleDSheet,
    scheduleESheet,
    scheduleSESheet,
    form1116Sheet,
    form6251Sheet,
    form8959Sheet,
    form8960Sheet,
    form8995Sheet,
    form4952Sheet,
    capitalLossSheet,
    form461Sheet,
    form8582Sheet,
    shortDivSheet,
    estTaxSheet,
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
