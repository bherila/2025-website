/**
 * Standard deductions by year, filing status, and state.
 *
 * Federal: IRS Rev. Proc. (2022-38, 2023-34, 2025-32).
 * California: FTB 540 instructions.
 * New York: IT-201 instructions (IT-201 line 34 standard deduction).
 *
 * Returns 0 for combinations that aren't covered (e.g. a state whose
 * standard deduction hasn't been captured yet). Callers should treat 0
 * as "unknown — do not subtract" rather than "deduction is literally $0".
 */

export type FilingStatus =
  | 'Single'
  | 'Married Filing Jointly'
  | 'Married Filing Separately'
  | 'Head of Household'

type StatusKey = 'single' | 'mfj' | 'mfs' | 'hoh'

const STATUS_KEY: Record<FilingStatus, StatusKey> = {
  'Single': 'single',
  'Married Filing Jointly': 'mfj',
  'Married Filing Separately': 'mfs',
  'Head of Household': 'hoh',
}

type YearTable = Partial<Record<StatusKey, number>>

const SALT_CAP_BY_YEAR: Record<number, number> = {
  2023: 10_000,
  2024: 10_000,
  2025: 40_000,
  2026: 40_000,
}

/** Federal standard deduction by year. */
const FEDERAL: Record<number, YearTable> = {
  2023: { single: 13_850, mfj: 27_700, mfs: 13_850, hoh: 20_800 },
  2024: { single: 14_600, mfj: 29_200, mfs: 14_600, hoh: 21_900 },
  2025: { single: 15_750, mfj: 31_500, mfs: 15_750, hoh: 23_625 },
  2026: { single: 16_100, mfj: 32_200, mfs: 16_100, hoh: 24_150 },
}

/** California FTB 540 standard deduction. */
const CA: Record<number, YearTable> = {
  2023: { single: 5_363, mfj: 10_726, mfs: 5_363, hoh: 10_726 },
  2024: { single: 5_540, mfj: 11_080, mfs: 5_540, hoh: 11_080 },
  2025: { single: 5_540, mfj: 11_080, mfs: 5_540, hoh: 11_080 },
}

/** New York IT-201 standard deduction (flat $8k single / $16,050 MFJ since 2018). */
const NY: Record<number, YearTable> = {
  2023: { single: 8_000, mfj: 16_050, mfs: 8_000, hoh: 11_200 },
  2024: { single: 8_000, mfj: 16_050, mfs: 8_000, hoh: 11_200 },
  2025: { single: 8_000, mfj: 16_050, mfs: 8_000, hoh: 11_200 },
}

const STATE_TABLES: Record<string, Record<number, YearTable>> = {
  CA,
  NY,
}

function getStandardDeductionTable(state = ''): Record<number, YearTable> | undefined {
  return state === '' ? FEDERAL : STATE_TABLES[state]
}

export function getLatestStandardDeductionYear(state = ''): number {
  const table = getStandardDeductionTable(state)
  return table ? Math.max(...Object.keys(table).map(Number)) : 0
}

export function getSaltCap(year: number): number {
  const latestYear = Math.max(...Object.keys(SALT_CAP_BY_YEAR).map(Number))

  return SALT_CAP_BY_YEAR[year] ?? SALT_CAP_BY_YEAR[latestYear] ?? 10_000
}

/**
 * Returns the standard deduction for the given year/state/status.
 * Unknown state or year → 0. Federal uses an empty-string state.
 */
export function getStandardDeduction(
  year: number,
  filingStatus: FilingStatus,
  state = '',
): number {
  const key = STATUS_KEY[filingStatus]
  const table = getStandardDeductionTable(state)
  if (!table) {
    return 0
  }
  const mostRecent = getLatestStandardDeductionYear(state)
  const row = table[year] ?? table[mostRecent]
  return row?.[key] ?? 0
}
