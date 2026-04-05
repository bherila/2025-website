/**
 * Barrel exports for the K-1 module.
 *
 * These can be imported from '@/components/finance/k1'.
 */

export { ALL_K1_CODES, BOX11_CODES, BOX13_CODES, BOX14_CODES, BOX15_CODES, BOX16_CODES, BOX17_CODES, BOX18_CODES, BOX19_CODES, BOX20_CODES } from './k1-codes'
export { K1_CODED_BOXES, K1_SPEC, K1_SPEC_BY_BOX } from './k1-spec'
export type { FK1StructuredData, K1CodeItem, K1ExtractionInfo, K1FieldSpec, K1FieldType, K1FieldValue, K3Section } from './k1-types'
export { isFK1StructuredData } from './k1-types'
export { default as K1CodesModal } from './K1CodesModal'
export { default as K1ReviewPanel } from './K1ReviewPanel'
