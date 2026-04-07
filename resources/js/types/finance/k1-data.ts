/**
 * Shared K-1 / K-3 data types (non-UI, types-layer).
 *
 * These types describe the structured data stored in fin_tax_documents.parsed_data
 * for K-1 documents (schemaVersion "2026.1").
 *
 * UI-specific types (K1FieldSpec, K1FieldType) live in the component layer.
 */

/** Value of a single K-1 field extracted by AI, optionally overridden by user. */
export interface K1FieldValue {
  /** Raw extracted value (string for all types; parse by fieldType in spec). */
  value: string | null
  /** AI confidence 0–1 (omitted for user entries). */
  confidence?: number
  /** When true, re-extraction will not overwrite this field. */
  manualOverride?: boolean
  /** Optional note or breakdown explanation for this field (e.g., "Gov't interest $X / Other $Y"). */
  notes?: string
}

/** One code-entry inside a coded K-1 box (e.g. Box 11 code A, Box 13 code G). */
export interface K1CodeItem {
  code: string
  /** Amount / narrative as string (parsed to number when needed). */
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
 * Structured K-1 / K-3 data stored in parsed_data (schemaVersion "2026.1").
 *
 * - `fields`  — all flat boxes (A–O, 1–10, 12) keyed by box identifier
 * - `codes`   — coded boxes (11, 13–20) keyed by box number, each an array of K1CodeItem
 * - `k3`      — Schedule K-3 sections (foreign tax reporting)
 * - `extraction` — server-stamped AI provenance metadata
 */
export interface FK1StructuredData {
  /** Discriminator – allows UI to distinguish new vs legacy format. */
  schemaVersion: string
  formType: 'K-1-1065' | 'K-1-1120S' | 'K-1-1041' | string
  formId?: string
  pages?: number | null
  fields: Record<string, K1FieldValue>
  codes: Record<string, K1CodeItem[]>
  k3?: {
    sections: K3Section[]
  }
  raw_text?: string | null
  warnings?: string[] | null
  extraction?: K1ExtractionInfo
  createdAt?: string
}

/**
 * Type guard — checks whether parsed_data is the new structured K-1 format.
 *
 * Validates that `fields` and `codes` are non-null, non-array objects to avoid
 * false positives when those properties are null or an array.
 */
export function isFK1StructuredData(data: unknown): data is FK1StructuredData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const fields = d['fields']
  const codes = d['codes']
  return (
    typeof d['schemaVersion'] === 'string' &&
    fields !== null &&
    typeof fields === 'object' &&
    !Array.isArray(fields) &&
    codes !== null &&
    typeof codes === 'object' &&
    !Array.isArray(codes)
  )
}
