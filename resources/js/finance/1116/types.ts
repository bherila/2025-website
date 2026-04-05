/**
 * Form 1116 (Foreign Tax Credit) type definitions.
 *
 * These mirror the structured K-1 data conventions: all values are stored as strings,
 * with `confidence` and `manualOverride` for AI-extracted fields.
 *
 * schemaVersion "2026.1"
 */

import type { K1FieldValue } from '@/types/finance/k1-data'

/** Known income category codes for Form 1116. */
export type F1116Category = 'passive' | 'general' | 'section901j' | 'sanctioned' | 'lumpsum' | string

/** A single foreign tax credit adjustment entry. */
export interface F1116FTCAdjustment {
  code: string
  value: string
  confidence?: number
}

/** Structured Form 1116 data stored in parsed_data. */
export interface F1116Data {
  schemaVersion: '2026.1'
  formType: '1116'
  /** Income category (passive, general, etc.). */
  category?: F1116Category
  /** Source document(s) this was derived from (e.g. K-1 account_id + K-3 section). */
  sourceRef?: string
  fields: Record<string, K1FieldValue>
  codes: {
    FTCAdjustments?: F1116FTCAdjustment[]
  }
  raw_text?: string | null
  warnings?: string[] | null
  createdAt?: string
}

/** Type guard to check if parsed_data is structured Form 1116 data. */
export function isF1116Data(data: unknown): data is F1116Data {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return d['schemaVersion'] === '2026.1' && d['formType'] === '1116' && typeof d['fields'] === 'object'
}

/**
 * Input for the Form 1116 apportionment worksheet.
 * Used by WorksheetModal to compute Line 4b (apportioned interest expense).
 */
export interface F1116WorksheetInput {
  totalInterestExpense: number
  foreignAdjustedBasis: number
  totalAdjustedBasis: number
}

/** Result of the Form 1116 apportionment worksheet calculation. */
export interface F1116WorksheetResult {
  /** Apportioned foreign interest expense (Line 4b candidate). */
  apportionedForeignInterest: number
  /** foreignAdjustedBasis / totalAdjustedBasis ratio. */
  ratio: number
}

/**
 * Summary of foreign income and taxes extracted from K-1 Box 16 or 1099-DIV Box 7.
 * Used to populate the "Foreign Tax" column in Account Documents table and the
 * 1116 Worksheet Modal.
 */
export interface ForeignTaxSummary {
  /** Total foreign taxes paid/withheld (Box 16 codes I+J, or 1099-DIV box7). */
  totalForeignTaxPaid: number
  /** Foreign income category (passive, general, etc.). */
  category?: F1116Category
  /** Country or territory name. */
  country?: string | undefined
  /** Gross foreign income (Box 16 code B or C). */
  grossForeignIncome?: number | undefined
  /** Source document type. */
  sourceType: 'k1' | '1099_div' | '1099_int'
  /** Account ID the document belongs to. */
  accountId?: number | null
}
