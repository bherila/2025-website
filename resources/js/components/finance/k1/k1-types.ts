/**
 * K-1 / K-3 component-layer types.
 *
 * Data types (FK1StructuredData, K1FieldValue, etc.) are defined in @/types/finance/k1-data
 * and re-exported here for consumers that import from the component layer.
 *
 * This file adds UI-specific types: K1FieldSpec (drives the spec-based renderer) and
 * K1FieldType.
 */

// Re-export all shared data types from the types layer (single source of truth).
export type { FK1StructuredData, K1CodeItem, K1ExtractionInfo, K1FieldValue, K3Section, StatementA } from '@/types/finance/k1-data'
export { isFK1StructuredData } from '@/types/finance/k1-data'

// ────────────────────────────────────────────────────────────────────────────
// Spec types — drive generic field rendering without ad-hoc switch statements
// ────────────────────────────────────────────────────────────────────────────

export type K1FieldType = 'text' | 'multiLineText' | 'dropdown' | 'check' | 'buttonDetails'

export interface K1FieldSpec {
  /** IRS box identifier: "A"–"O" or "1"–"20" (including "4a", "6b", etc.). */
  box: string
  /** Full IRS label. */
  label: string
  /** Short label used in compact UI. */
  concise: string
  fieldType: K1FieldType
  /** Dropdown options (only when fieldType === "dropdown"). */
  dropdownItems?: string[]
  /** Code definitions keyed by code letter (only when fieldType === "buttonDetails"). */
  codes?: Record<string, string>
  /** Explicit sort order for rendering (lower = first). */
  uiOrder?: number
  /** Panel placement in the two-column review layout. */
  side: 'left' | 'right'
}
