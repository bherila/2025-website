/**
 * K-1 routing notes — single source of truth consumed by:
 *   - buildTaxWorkbook.ts  (XLSX export destination summary)
 *   - k1Utils.ts           (review panel helpers: unrouted codes, destination badges)
 */

/** Routing notes for plain-number K-1 boxes (source ← and destination →). */
export const K1_ROUTING_NOTES: Record<string, string> = {
  '5':  '<< K-3, II, line 6 | >> Sch B line 1 / Form 1040 line 2b',
  '6a': '>> Sch B Part II line 5 / Form 1040 line 3b (ordinary dividends)',
  '6b': '>> Form 1040 line 3a (qualified dividends — subset of Box 6a, do NOT add separately)',
  '21': '<< K-3, III, section 4 (see K-3 for country breakdown)',
}

/** Routing notes for specific box + code combinations. */
export const K1_CODE_ROUTING_NOTES: Record<string, Record<string, string>> = {
  '11': {
    A: '>> Sch E Part II / Sch B (other portfolio income)',
    C: '>> Form 6781 line 1 / Sch D line 4 (ST 40%) + line 11 (LT 60%)',
    S: '>> Form 8582 (per-activity passive income/loss from supplemental statement — passiveActivities field)',
    ZZ: 'Other ordinary income/loss — varies by footnote; check K-1 attached statement. Sec. 988 FX, swap, PFIC MTM items report to Schedule E Part II (nonpassive ordinary).',
  },
  '13': {
    A: '>> Sch A line 12 (charitable contributions — 50% AGI limit)',
    B: '>> Sch A line 12 (charitable contributions — 30% AGI limit)',
    C: '>> Sch A line 12 (noncash contributions — 50% AGI limit)',
    D: '>> Sch A line 12 (noncash contributions — 30% AGI limit)',
    E: '>> Form 8582 (capital loss limitation — passive activity rules apply)',
    F: '>> Form 4562 or Sch A (§59(e)(2) — taxpayer election required)',
    G: '>> Form 4952 line 1 (investment interest expense)',
    H: '>> Form 4952 line 1 (investment interest expense)',
    K: '§67(g) suspended (2% floor misc itemized deduction) — not deductible TY 2018–2025',
    L: '>> Sch A line 16 (portfolio deduction, no 2% floor) — do NOT enter on Form 8582',
    T: '§163(j) excess business interest expense — carryover tracking only',
    V: 'Basis adjustment (§743(b)) — not a current-year deduction',
    W: '>> Sch F line 12 or Sch E (soil & water conservation)',
    AC: '>> Form 4952 line 1 (debt-financed distribution interest expense)',
    AD: '>> Form 4952 line 1 (interest expense on oil/gas)',
    AE: '§67(g) suspended (portfolio income deduction, 2% floor) — not deductible TY 2018–2025',
    ZZ: 'Other deductions — varies by footnote; check K-1 attached statement',
  },
  '14': {
    A: '>> Schedule SE (self-employment tax) | >> Schedule 1 line 15 (deductible half) | >> Form 1040 line 23',
    B: '>> Schedule SE (self-employment tax) | >> Schedule 1 line 15 (deductible half) | >> Form 1040 line 23',
    C: '>> Schedule SE (self-employment tax) | >> Schedule 1 line 15 (deductible half) | >> Form 1040 line 23',
  },
  '17': {
    A: '>> Form 6251 Part I line 2l (post-1986 depreciation adjustment)',
    B: '>> Form 6251 Part I line 2k (adjusted gain or loss)',
    C: '>> Form 6251 Part I line 2d (depletion adjustment)',
    D: '>> Form 6251 Part I line 2t (oil/gas/geothermal gross income — net with code E and statement)',
    E: '>> Form 6251 Part I line 2t (oil/gas/geothermal deductions — net with code D and statement)',
    F: '>> Form 6251 / Form 4626 / Schedule I (Form 1041) per attached AMT statement',
    G: 'Legacy AMT item — review attached statement and Form 6251 line placement',
    H: 'Legacy passive activity AMT adjustment — review Form 6251 Part I line 2m',
  },
  '20': {
    A: '>> Form 4952, II, line 4a',
    B: '>> Form 4952, II, line 5 (investment expenses)',
    Z: '>> Form 8995 / 8995-A — QBI deduction (20% of qualified income, Statement A) | >> Form 1040 Line 13',
    AA: 'Section 704(c) information — informational only; adjusts basis allocation between partners. No current-year deduction.',
    AJ: '>> Form 461 — excess business loss limitation (Schedule 1 line 8p as NOL carryforward if triggered)',
  },
}
