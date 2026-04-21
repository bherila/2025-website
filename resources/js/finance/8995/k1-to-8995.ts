/**
 * K-1 → Form 8995 / 8995-A mapping module.
 *
 * Extracts Section 199A / QBI deduction components from reviewed K-1 documents
 * and computes the estimated Qualified Business Income Deduction (Form 1040 Line 13).
 *
 * IRS Box 20 code reference (Form 1065 K-1, TY 2023+):
 *   Z  – Section 199A information (QBI income/loss from the activity, with Statement A attached)
 *
 * Statement A fields (W-2 wages, UBIA, SSTB flag) are extracted into FK1StructuredData.statementA
 * by the AI extraction pipeline and used in Form 8995-A computation (Commit 3).
 */

import currency from 'currency.js'

import type { FK1StructuredData } from '@/types/finance/k1-data'

// ── Standard deduction by year (single / MFJ) ────────────────────────────────
// Source: IRS Rev. Proc. for each year.

const STANDARD_DEDUCTION: Record<number, { single: number; mfj: number }> = {
  2018: { single: 12_000, mfj: 24_000 },
  2019: { single: 12_200, mfj: 24_400 },
  2020: { single: 12_400, mfj: 24_800 },
  2021: { single: 12_550, mfj: 25_100 },
  2022: { single: 12_950, mfj: 25_900 },
  2023: { single: 13_850, mfj: 27_700 },
  2024: { single: 14_600, mfj: 29_200 },
  2025: { single: 15_000, mfj: 30_000 },
}

function standardDeduction(year: number, isMarried: boolean): number {
  const row = STANDARD_DEDUCTION[year] ?? STANDARD_DEDUCTION[2025] ?? { single: 15_000, mfj: 30_000 }
  return isMarried ? row.mfj : row.single
}

// ── QBI thresholds by year (Sec. 199A phase-in begins above these amounts) ───
// Source: IRS Rev. Proc. for each year. Phase-in range is +$50k (single) / +$100k (MFJ).

const QBI_THRESHOLD: Record<number, { single: number; mfj: number }> = {
  2018: { single: 157_500, mfj: 315_000 },
  2019: { single: 160_700, mfj: 321_400 },
  2020: { single: 163_300, mfj: 326_600 },
  2021: { single: 164_900, mfj: 329_800 },
  2022: { single: 170_050, mfj: 340_100 },
  2023: { single: 182_050, mfj: 364_200 },
  2024: { single: 191_950, mfj: 383_900 },
  2025: { single: 197_300, mfj: 394_600 },
}

export function qbiThreshold(year: number): { single: number; mfj: number } {
  return QBI_THRESHOLD[year] ?? QBI_THRESHOLD[2025] ?? { single: 197_300, mfj: 394_600 }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a K-1 value string before parsing: strip $, commas, whitespace; convert (1,234) → -1234. */
function normalizeNumericString(s: string): string {
  const trimmed = s.trim()
  if (!trimmed) return ''
  const isNeg = /^\(.*\)$/.test(trimmed)
  const inner = isNeg ? trimmed.slice(1, -1) : trimmed
  const digits = inner.replace(/[$,\s]/g, '')
  return isNeg ? `-${digits}` : digits
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const normalized = normalizeNumericString(String(v))
  if (!normalized) return 0
  const n = parseFloat(normalized)
  return isFinite(n) ? n : 0
}

/** Filter all code items matching `code` in the given box (there may be multiple per the K-1 spec). */
function getCodeItems(
  codes: FK1StructuredData['codes'],
  box: string,
  code: string,
): NonNullable<FK1StructuredData['codes'][string]> {
  return (codes[box] ?? []).filter(i => i.code.toUpperCase() === code.toUpperCase())
}

/** Sum numeric values from all matching code items. */
function getCodeValue(codes: FK1StructuredData['codes'], box: string, code: string): number {
  return getCodeItems(codes, box, code).reduce((acc, i) => currency(acc).add(toNum(i.value)).value, 0)
}

/** Concatenate notes from all matching code items (newline-separated). */
function getCodeNotes(codes: FK1StructuredData['codes'], box: string, code: string): string {
  return getCodeItems(codes, box, code)
    .map(i => i.notes?.trim() ?? '')
    .filter(n => n !== '')
    .join('\n')
}

// ── Per-K-1 extraction ────────────────────────────────────────────────────────

export interface QBIEntry {
  /** Partnership/entity display name. */
  label: string
  /** Box 20 Code Z — QBI income (loss) from this activity (TY 2023+). */
  qbiIncome: number
  /** W-2 wages paid by the entity — from Statement A. Used for W-2 wage limitation on Form 8995-A. */
  w2Wages: number
  /** REIT dividends — from Statement A (§199A(e)(3)). */
  reitDividends: number
  /** Qualified PTP income — from Statement A (§199A(e)(5)). */
  ptpIncome: number
  /** Whether this is a Specified Service Trade or Business — deduction phases out above threshold. */
  isSstb: boolean
  /** Free-form notes from Box 20 Code Z. */
  sectionNotes: string
  /** 20% × max(qbiIncome, 0) — the raw QBI component before any caps. */
  qbiComponent: number
}

export function extractQBIFromK1(data: FK1StructuredData, label: string): QBIEntry | null {
  // TY 2023+: Section 199A information is reported in Box 20 Code Z (with Statement A attached).
  // Pre-2023 codes S and V are no longer read — see issue #269 for the no-backwards-compat decision.
  const qbiIncome = data.statementA?.qualifiedBusinessIncome ?? getCodeValue(data.codes, '20', 'Z')
  if (qbiIncome === 0) return null

  const sa = data.statementA
  return {
    label,
    qbiIncome,
    w2Wages: sa?.w2Wages ?? 0,
    reitDividends: sa?.reitDividends ?? 0,
    ptpIncome: sa?.ptpIncome ?? 0,
    isSstb: sa?.isSstb ?? false,
    sectionNotes: getCodeNotes(data.codes, '20', 'Z'),
    qbiComponent: currency(Math.max(qbiIncome, 0)).multiply(0.2).value,
  }
}

// ── Aggregate computation ─────────────────────────────────────────────────────

export interface Form8995Lines {
  entries: QBIEntry[]
  /** Sum of all per-K-1 QBI income amounts. */
  totalQBI: number
  /** 20% × max(totalQBI, 0) — losses net across activities before applying the rate (Form 8995 Line 12). */
  totalQBIComponent: number
  /** The totalIncome value passed in (stored for downstream consumers to avoid recomputation). */
  totalIncome: number
  /** Estimated taxable income (total income minus standard deduction). */
  estimatedTaxableIncome: number
  /** Standard deduction actually subtracted (may be less than the full amount if income < standard deduction). */
  stdDedApplied: number
  /** 20% × estimated taxable income — the upper cap on the deduction. */
  taxableIncomeCap: number
  /** Final estimated QBI deduction: min(totalQBIComponent, taxableIncomeCap). */
  estimatedDeduction: number
  /** Whether taxable income exceeds the phase-in threshold (W-2/UBIA limit may apply). */
  aboveThreshold: boolean
  thresholdSingle: number
  thresholdMFJ: number
}

/**
 * Compute Form 8995 lines from reviewed K-1 documents.
 *
 * @param k1Data         Parsed FK1StructuredData objects with their display labels.
 * @param totalIncome    Form 1040 Line 9 (total income estimate).
 * @param year           Tax year — used for threshold and standard deduction lookup.
 * @param isMarried      Filing status (default: false / Single).
 */
export function computeForm8995Lines(
  k1Data: { data: FK1StructuredData; label: string }[],
  totalIncome: number,
  year: number,
  isMarried = false,
): Form8995Lines {
  const entries = k1Data
    .map(({ data, label }) => extractQBIFromK1(data, label))
    .filter((e): e is QBIEntry => e !== null)

  const totalQBI = entries.reduce((acc, e) => currency(acc).add(e.qbiIncome).value, 0)
  // Net losses across all activities before applying 20% (IRS Form 8995 Line 12).
  // Per-entry qbiComponent is kept as 20% × max(entry, 0) for display only.
  const totalQBIComponent = currency(Math.max(totalQBI, 0)).multiply(0.2).value

  const stdDed = standardDeduction(year, isMarried)
  const rawTaxableIncome = currency(totalIncome).subtract(stdDed).value
  const estimatedTaxableIncome = Math.max(rawTaxableIncome, 0)
  const stdDedApplied = currency(totalIncome).subtract(estimatedTaxableIncome).value
  const taxableIncomeCap = currency(estimatedTaxableIncome).multiply(0.2).value
  const estimatedDeduction = currency(Math.min(totalQBIComponent, taxableIncomeCap)).value

  const { single, mfj } = qbiThreshold(year)
  const threshold = isMarried ? mfj : single
  const aboveThreshold = estimatedTaxableIncome > threshold

  return {
    entries,
    totalQBI,
    totalQBIComponent,
    totalIncome,
    estimatedTaxableIncome,
    stdDedApplied,
    taxableIncomeCap,
    estimatedDeduction,
    aboveThreshold,
    thresholdSingle: single,
    thresholdMFJ: mfj,
  }
}
