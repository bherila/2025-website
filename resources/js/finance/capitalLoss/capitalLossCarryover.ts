/**
 * Capital loss carryover computation.
 *
 * When total capital losses exceed $3,000 (the annual offset limit against ordinary income),
 * the excess carries forward indefinitely and retains its ST/LT character.
 *
 * IRS ordering rules (Schedule D instructions):
 *   1. Net ST and LT gains/losses separately.
 *   2. If both are losses: the $3k offset comes from ST first, then LT.
 *   3. The unused portion of each carries to the next year.
 *
 * Source: IRC §1212; Schedule D instructions.
 */

import currency from 'currency.js'

export const CAPITAL_LOSS_ANNUAL_LIMIT = 3_000

export interface CapitalLossCarryover {
  /** Net short-term capital gain/(loss) this year (Schedule D line 7). */
  netShortTerm: number
  /** Net long-term capital gain/(loss) this year (Schedule D line 15). */
  netLongTerm: number
  /** Combined net gain/(loss) (Schedule D line 16). */
  combined: number
  /** Amount of loss applied to ordinary income this year (max $3,000, or $1,500 MFS). */
  appliedToOrdinaryIncome: number
  /** Short-term capital loss carried to next year (0 if no carryover). */
  shortTermCarryover: number
  /** Long-term capital loss carried to next year (0 if no carryover). */
  longTermCarryover: number
  /** Total carryover (ST + LT). */
  totalCarryover: number
  /** True when there is any carryover to report. */
  hasCarryover: boolean
}

export function computeCapitalLossCarryover(
  netShortTerm: number,
  netLongTerm: number,
  isMFS = false,
): CapitalLossCarryover {
  const combined = currency(netShortTerm).add(netLongTerm).value
  const limit = isMFS ? 1_500 : CAPITAL_LOSS_ANNUAL_LIMIT

  if (combined >= 0) {
    // Net gain or break-even — no carryover
    return {
      netShortTerm, netLongTerm, combined,
      appliedToOrdinaryIncome: 0,
      shortTermCarryover: 0, longTermCarryover: 0,
      totalCarryover: 0, hasCarryover: false,
    }
  }

  // Net loss: apply up to $3k to ordinary income, carry the rest
  const totalLoss = Math.abs(combined)
  const appliedToOrdinaryIncome = Math.min(totalLoss, limit)
  const remainingLoss = currency(totalLoss).subtract(appliedToOrdinaryIncome).value

  // ST losses absorbed first per IRS ordering
  let shortTermCarryover = 0
  let longTermCarryover = 0

  if (netShortTerm < 0 && netLongTerm < 0) {
    // Both negative: ST applied first, then LT
    const stLoss = Math.abs(netShortTerm)
    const ltLoss = Math.abs(netLongTerm)
    const stApplied = Math.min(stLoss, appliedToOrdinaryIncome)
    const ltApplied = Math.min(ltLoss, appliedToOrdinaryIncome - stApplied)
    shortTermCarryover = currency(stLoss).subtract(stApplied).value
    longTermCarryover = currency(ltLoss).subtract(ltApplied).value
  } else if (netShortTerm < 0) {
    // Only ST loss
    shortTermCarryover = remainingLoss
  } else {
    // Only LT loss (net ST is a gain that offsets some LT loss)
    longTermCarryover = remainingLoss
  }

  const totalCarryover = currency(shortTermCarryover).add(longTermCarryover).value

  return {
    netShortTerm, netLongTerm, combined,
    appliedToOrdinaryIncome,
    shortTermCarryover,
    longTermCarryover,
    totalCarryover,
    hasCarryover: totalCarryover > 0,
  }
}
