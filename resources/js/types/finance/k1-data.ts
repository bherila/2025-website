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
  /**
   * Capital-gain character override.
   *
   * Used today for Box 11 code S (non-portfolio capital gain/loss): partnerships
   * such as AQR break the single line into multiple ST/LT sub-amounts via the
   * supplemental statement. When extraction can't classify the character from
   * the notes, the user can pin it here so Schedule D routes to line 5 (ST) vs
   * line 12 (LT) deterministically.
   */
  character?: 'short' | 'long'
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
 * Section 199A Statement A — attached to Box 20 Code Z (TY 2023+).
 *
 * Extracted from the supporting statement that partnerships attach to their K-1
 * to report QBI deduction components for each trade or business.
 */
export interface StatementA {
  /** Name of the trade or business (from Statement A header, if present). */
  tradeName?: string
  /** QBI income (loss) from this activity — mirrors the Box 20 Code Z dollar amount. */
  qualifiedBusinessIncome: number
  /** W-2 wages paid by the entity — used for the W-2 wage limitation on Form 8995-A. */
  w2Wages: number
  /** UBIA (Unadjusted Basis Immediately After Acquisition) of qualified property. */
  ubia: number
  /** REIT dividends allocated to partner (§199A(e)(3)). */
  reitDividends: number
  /** Qualified PTP income (§199A(e)(5)). */
  ptpIncome: number
  /** Whether this is a Specified Service Trade or Business — deduction phases out above threshold. */
  isSstb: boolean
}

/**
 * One §469 passive activity reported by the partnership via supplemental statement
 * (present when Box 23 = true — more than one activity is passive).
 * Each entry maps to one row in Form 8582 Part V.
 */
export interface K1PassiveActivity {
  /** Activity description from the partnership's supplemental statement. */
  name: string
  /** Net current-year income from this activity (>= 0). Reported in Part V column (a). */
  currentIncome: number
  /** Net current-year loss from this activity (<= 0). Reported in Part V column (b). */
  currentLoss: number
}

/**
 * Document-level elections that affect how K-3 data is interpreted.
 * Stored in parsed_data alongside the extracted data.
 */
export interface K3Elections {
  /**
   * When true, column (f) "Sourced by Partner" amounts are treated as
   * U.S.-source income for Form 1116 purposes.
   */
  sourcedByPartnerAsUSSource?: boolean
}

/**
 * Structured K-1 / K-3 data stored in parsed_data (schemaVersion "2026.1").
 *
 * - `fields`     — all flat boxes (A–O, 1–10, 12) keyed by box identifier
 * - `codes`      — coded boxes (11, 13–20) keyed by box number, each an array of K1CodeItem
 * - `statementA` — §199A Statement A (extracted from Box 20 Code Z attachment, TY 2023+)
 * - `k3`         — Schedule K-3 sections (foreign tax reporting)
 * - `k3Elections` — document-level elections affecting K-3 interpretation
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
  /** §199A Statement A data extracted from the attachment to Box 20 Code Z (TY 2023+). */
  statementA?: StatementA
  /**
   * Passive activities from the partnership's supplemental statement
   * (populated when Box 23 = true — more than one activity is passive).
   * Each entry is one §469 activity for Form 8582 Part V (All Other Passive Activities).
   */
  passiveActivities?: K1PassiveActivity[]
  k3?: {
    sections: K3Section[]
  }
  k3Elections?: K3Elections
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
