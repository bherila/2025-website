/**
 * Barrel exports for the Form 1116 module.
 */

export { F1116_SPEC } from './F1116_SPEC'
export { default as F1116ReviewPanel } from './F1116ReviewPanel'
export {
  calculateApportionedInterest,
  extractForeignTaxFrom1099Div,
  extractForeignTaxFrom1099Int,
  extractForeignTaxFromK1,
} from './k3-to-1116'
export type {
  F1116Category,
  F1116Data,
  F1116FTCAdjustment,
  F1116WorksheetInput,
  F1116WorksheetResult,
  ForeignTaxSummary,
} from './types'
export { isF1116Data } from './types'
export { default as WorksheetModal } from './WorksheetModal'
