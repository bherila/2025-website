/**
 * TypeScript types for Schedule K-1 / K-3 structured data.
 *
 * The structured format is stored in fin_tax_documents.parsed_data for k1 form_type documents.
 * It replaces the earlier flat FK1ParsedData interface.
 *
 * schemaVersion "2026.1" — add/increment when IRS form layout changes.
 */

/** Value of a single K-1 field extracted by AI, optionally overridden by user. */
export interface K1FieldValue {
  /** Raw extracted value (string for all types; parse by fieldType in spec). */
  value: string | null
  /** AI confidence 0–1 (omitted for user entries). */
  confidence?: number
  /** When true, re-extraction will not overwrite this field. */
  manualOverride?: boolean
}

/** One code-entry inside a coded K-1 box (e.g. Box 11 code A, Box 13 code G). */
export interface K1CodeItem {
  code: string
  value: string
  notes?: string
  confidence?: number
  manualOverride?: boolean
}

/** A section of Schedule K-3 (Foreign Tax Reporting). */
export interface K3Section {
  sectionId: string
  title: string
  data: Record<string, unknown>
  notes?: string
}

/** Provenance metadata added by the server when saving AI extraction results. */
export interface K1ExtractionInfo {
  model?: string
  version?: string
  timestamp?: string
  confidence?: number
  source?: string
}

/**
 * Structured K-1 data stored in parsed_data.
 *
 * - `fields`  — all flat boxes (A–O, 1–10, 12) keyed by box identifier
 * - `codes`   — coded boxes (11, 13–20) keyed by box number, each an array of code items
 * - `k3`      — Schedule K-3 sections (foreign tax reporting)
 */
export interface FK1StructuredData {
  /** Discriminator – allows UI to distinguish new vs legacy format. */
  schemaVersion: string
  formType: 'K-1-1065' | 'K-1-1120S' | 'K-1-1041' | string
  formId?: string
  pages?: number
  fields: Record<string, K1FieldValue>
  codes: Record<string, K1CodeItem[]>
  k3?: {
    sections: K3Section[]
  }
  raw_text?: string
  warnings?: string[]
  extraction?: K1ExtractionInfo
  createdAt?: string
}

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

/** Type guard — checks whether parsed_data is the new structured K-1 format. */
export function isFK1StructuredData(data: unknown): data is FK1StructuredData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return typeof d['schemaVersion'] === 'string' && typeof d['fields'] === 'object' && typeof d['codes'] === 'object'
}
