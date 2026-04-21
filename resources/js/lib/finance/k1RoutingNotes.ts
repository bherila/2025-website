/**
 * K-1 routing notes — single source of truth consumed by:
 *   - buildTaxWorkbook.ts  (XLSX export destination summary)
 *   - k1Utils.ts           (review panel helpers: unrouted codes, destination badges)
 */

/** Routing notes for plain-number K-1 boxes (source ← and destination →). */
export const K1_ROUTING_NOTES: Record<string, string> = {
  '5':  '<< K-3, II, line 6 | >> Sch B line 1 / Form 1040 line 2b',
  '21': '<< K-3, III, section 4 (see K-3 for country breakdown)',
}

/** Routing notes for specific box + code combinations. */
export const K1_CODE_ROUTING_NOTES: Record<string, Record<string, string>> = {
  '11': {
    A: '>> Sch E Part II / Sch B (other portfolio income)',
    C: '>> Form 6781 line 1 / Sch D line 4 (ST 40%) + line 11 (LT 60%)',
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
    A: '>> Schedule SE (not yet computed — see Form 1040 Line 23)',
    B: '>> Schedule SE (not yet computed — see Form 1040 Line 23)',
    C: '>> Schedule SE (not yet computed — see Form 1040 Line 23)',
  },
  '17': {
    A: '>> Form 6251 (AMT — not yet computed)',
    B: '>> Form 6251 (AMT — not yet computed)',
    C: '>> Form 6251 (AMT — not yet computed)',
    D: '>> Form 6251 (AMT — not yet computed)',
    E: '>> Form 6251 (AMT — not yet computed)',
    F: '>> Form 6251 (AMT — not yet computed)',
    G: '>> Form 6251 (AMT — not yet computed)',
    H: '>> Form 6251 (AMT — not yet computed)',
  },
  '20': {
    A: '>> Form 4952, II, line 4a',
    B: '>> Form 4952, II, line 5 (investment expenses)',
    Z: '>> Form 8995 / 8995-A — QBI deduction (20% of qualified income, Statement A) | >> Form 1040 Line 13',
  },
}
