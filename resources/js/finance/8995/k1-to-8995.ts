/**
 * K-1 → Form 8995 / 8995-A mapping module.
 *
 * Extracts Section 199A / QBI deduction components from reviewed K-1 documents
 * and computes the estimated Qualified Business Income Deduction (Form 1040 Line 13).
 *
 * IRS Box 20 code reference (Form 1065 K-1):
 *   S  – Section 199A information (QBI income/loss from the activity)
 *   V  – Section 199A UBIA of qualified property
 *
 * Note: W-2 wages are reported in the Section 199A attached statement (not as a
 * separate Box 20 code). They appear in the notes field of Code S when extracted.
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

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isFinite(n) ? n : 0
}

function getCodeValue(codes: FK1StructuredData['codes'], box: string, code: string): number {
  const items = codes[box]
  if (!items) return 0
  const item = items.find(i => i.code.toUpperCase() === code.toUpperCase())
  return item ? toNum(item.value) : 0
}

function getCodeNotes(codes: FK1StructuredData['codes'], box: string, code: string): string {
  const items = codes[box]
  if (!items) return ''
  return items.find(i => i.code.toUpperCase() === code.toUpperCase())?.notes ?? ''
}

// ── Per-K-1 extraction ────────────────────────────────────────────────────────

export interface QBIEntry {
  /** Partnership/entity display name. */
  label: string
  /** Box 20 Code S — QBI income (loss) from this activity. */
  qbiIncome: number
  /** Box 20 Code V — UBIA of qualified property. */
  ubia: number
  /** Free-form notes from Box 20 Code S (may include W-2 wages from the Section 199A statement). */
  sectionNotes: string
  /** 20% × max(qbiIncome, 0) — the raw QBI component before any caps. */
  qbiComponent: number
}

export function extractQBIFromK1(data: FK1StructuredData, label: string): QBIEntry | null {
  const qbiIncome = getCodeValue(data.codes, '20', 'S')
  const ubia = getCodeValue(data.codes, '20', 'V')
  if (qbiIncome === 0 && ubia === 0) return null

  return {
    label,
    qbiIncome,
    ubia,
    sectionNotes: getCodeNotes(data.codes, '20', 'S'),
    qbiComponent: currency(Math.max(qbiIncome, 0)).multiply(0.2).value,
  }
}

// ── Aggregate computation ─────────────────────────────────────────────────────

export interface Form8995Lines {
  entries: QBIEntry[]
  /** Sum of all per-K-1 QBI income amounts. */
  totalQBI: number
  /** Sum of all per-K-1 QBI components (20% of positive QBI each). */
  totalQBIComponent: number
  /** Estimated taxable income (total income minus standard deduction). */
  estimatedTaxableIncome: number
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
  const totalQBIComponent = entries.reduce((acc, e) => currency(acc).add(e.qbiComponent).value, 0)

  const stdDed = standardDeduction(year, isMarried)
  const estimatedTaxableIncome = Math.max(currency(totalIncome).subtract(stdDed).value, 0)
  const taxableIncomeCap = currency(estimatedTaxableIncome).multiply(0.2).value
  const estimatedDeduction = Math.min(totalQBIComponent, taxableIncomeCap)

  const { single, mfj } = qbiThreshold(year)
  const threshold = isMarried ? mfj : single
  const aboveThreshold = estimatedTaxableIncome > threshold

  return {
    entries,
    totalQBI,
    totalQBIComponent,
    estimatedTaxableIncome,
    taxableIncomeCap,
    estimatedDeduction,
    aboveThreshold,
    thresholdSingle: single,
    thresholdMFJ: mfj,
  }
}
