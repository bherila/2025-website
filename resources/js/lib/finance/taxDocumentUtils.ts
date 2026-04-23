/**
 * Shared utilities for multi-account (broker_1099) tax document operations.
 *
 * These handle matching between TaxDocumentAccountLink rows (the join table)
 * and the per-account entries stored in the parent document's parsed_data array.
 */

import { extractForeignTaxFromK1 } from '@/finance/1116/k3-to-1116'
import { k1NetIncome } from '@/lib/finance/k1Utils'
import type { FK1StructuredData, MultiAccountParsedEntry, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { isFK1StructuredData } from '@/types/finance/tax-document'

/**
 * Find the account link that corresponds to a parsed_data entry.
 *
 * When only one link shares the form_type it is returned unconditionally.
 * When multiple links share the form_type, ai_identifier is required to match
 * (both sides must be non-empty); returns undefined when the match is ambiguous.
 */
export function findMatchingLink(
  entry: MultiAccountParsedEntry,
  links: TaxDocumentAccountLink[],
): TaxDocumentAccountLink | undefined {
  const candidates = links.filter(l => l.form_type === entry.form_type)
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) return undefined
  // Multiple candidates — require ai_identifier to match (only when both sides are non-empty).
  const identified = candidates.filter(
    l => l.ai_identifier && entry.account_identifier && l.ai_identifier === entry.account_identifier,
  )
  return identified.length === 1 ? identified[0] : undefined
}

/**
 * Find the parsed_data entry that corresponds to an account link.
 * Inverse of findMatchingLink.
 *
 * When only one entry shares the form_type it is returned unconditionally.
 * When multiple entries share the form_type, ai_identifier is required to match
 * (both sides must be non-empty); returns undefined when the match is ambiguous.
 */
export function findMatchingEntry(
  link: TaxDocumentAccountLink,
  entries: MultiAccountParsedEntry[],
): MultiAccountParsedEntry | undefined {
  const candidates = entries.filter(e => e.form_type === link.form_type)
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) return undefined
  // Multiple candidates — require ai_identifier to match (only when both sides are non-empty).
  const identified = candidates.filter(
    e => link.ai_identifier && e.account_identifier && e.account_identifier === link.ai_identifier,
  )
  return identified.length === 1 ? identified[0] : undefined
}

/**
 * For a broker_1099 / multi-account document whose parsed_data is an array of
 * MultiAccountParsedEntry objects, extract the matching entry's inner parsed_data
 * for the given account link.
 */
export function extractLinkParsedData(
  doc: TaxDocument,
  link: TaxDocumentAccountLink,
): Record<string, unknown> | null {
  if (!Array.isArray(doc.parsed_data)) return null
  const entries = doc.parsed_data as unknown as MultiAccountParsedEntry[]
  const match = findMatchingEntry(link, entries)
  return (match?.parsed_data as Record<string, unknown>) ?? null
}

/**
 * Patch an individual account link's parsed_data back into the parent document's
 * parsed_data array, returning the updated array.
 */
export function patchLinkParsedDataInArray(
  doc: TaxDocument,
  link: TaxDocumentAccountLink,
  updatedEntry: Record<string, unknown>,
): MultiAccountParsedEntry[] {
  if (!Array.isArray(doc.parsed_data)) return []
  const entries = [...(doc.parsed_data as unknown as MultiAccountParsedEntry[])]
  const match = findMatchingEntry(link, entries)
  const idx = match ? entries.indexOf(match) : -1
  if (idx >= 0) {
    const existing = entries[idx]!
    entries[idx] = {
      account_identifier: existing.account_identifier,
      account_name: existing.account_name,
      form_type: existing.form_type,
      tax_year: existing.tax_year,
      parsed_data: updatedEntry,
    }
  }
  return entries
}

/**
 * Iterate over reviewed entries in a broker_1099 document's parsed_data array.
 * Yields [entry, link] tuples for each entry that has a matching reviewed link.
 * Skips entries with no parsed_data or no matching reviewed link.
 */
export function* iterateReviewedBrokerEntries(
  doc: TaxDocument,
): Generator<[MultiAccountParsedEntry, TaxDocumentAccountLink]> {
  if (doc.form_type !== 'broker_1099' || !Array.isArray(doc.parsed_data)) return

  const entries = doc.parsed_data as unknown as MultiAccountParsedEntry[]
  const links = doc.account_links ?? []

  for (const entry of entries) {
    const link = findMatchingLink(entry, links)
    if (!link?.is_reviewed || !entry.parsed_data) continue
    yield [entry, link]
  }
}

/**
 * Check whether a document has any reviewed content — either the parent is reviewed,
 * or at least one account link is reviewed (for multi-account docs).
 */
export function hasReviewedContent(doc: TaxDocument): boolean {
  return doc.is_reviewed || (doc.account_links ?? []).some(l => l.is_reviewed)
}

/** Extract the payer/fund name for display alongside the review button. */
export function getPayerName(doc: TaxDocument, link?: TaxDocumentAccountLink): string | null {
  if (!doc.parsed_data) {
    return null
  }
  if (doc.form_type === 'k1' && isFK1StructuredData(doc.parsed_data)) {
    return (doc.parsed_data as FK1StructuredData).fields['B']?.value?.split('\n')[0] ?? null
  }
  if (Array.isArray(doc.parsed_data)) {
    if (!link) {
      return null
    }
    const entryData = extractLinkParsedData(doc, link)
    return (entryData?.payer_name as string | undefined) ?? null
  }
  return ((doc.parsed_data as Record<string, unknown>).payer_name as string | undefined) ?? null
}

export interface DocAmounts {
  interest: number | null
  dividend: number | null
  other: number | null
  foreignTax: number | null
}

/**
 * Extract structured key amounts (interest / dividend / other / foreign tax) from a
 * reviewed tax document for display in dedicated table columns. Returns nulls for
 * missing values so callers can distinguish "no data" from a legitimate zero.
 *
 * For consolidated broker_1099 docs with multiple per-form links, amounts are
 * attributed to the link whose form_type matches — this avoids double-counting
 * when a single broker PDF exposes both 1099-INT and 1099-DIV child forms for the
 * same account.
 */
export function getDocAmounts(doc: TaxDocument, link?: TaxDocumentAccountLink): DocAmounts {
  const result: DocAmounts = { interest: null, dividend: null, other: null, foreignTax: null }
  const effectiveFormType = link ? link.form_type : doc.form_type
  const effectiveReviewed = link ? link.is_reviewed : doc.is_reviewed
  if (!doc.parsed_data || !effectiveReviewed) {
    return result
  }

  if (doc.form_type === 'broker_1099') {
    // Multi-account broker imports store parsed_data as an array of per-account entries;
    // read the matching entry's inner parsed_data instead of the outer array.
    const p: Record<string, unknown> | null = Array.isArray(doc.parsed_data)
      ? link ? extractLinkParsedData(doc, link) : null
      : (doc.parsed_data as Record<string, unknown>)
    if (!p) {
      return result
    }
    if (effectiveFormType === '1099_int' || effectiveFormType === '1099_int_c') {
      const interest = (p.int_1_interest_income ?? p.box1_interest) as number | undefined
      if (interest != null && interest !== 0) {
        result.interest = interest
      }
      const ft = (p.int_6_foreign_tax_paid ?? p.box6_foreign_tax) as number | undefined
      if (ft != null && ft !== 0) {
        result.foreignTax = ft
      }
    } else if (effectiveFormType === '1099_div' || effectiveFormType === '1099_div_c') {
      const ordDiv = (p.div_1a_total_ordinary ?? p.box1a_ordinary ?? p.box1_ordinary) as number | undefined
      if (ordDiv != null && ordDiv !== 0) {
        result.dividend = ordDiv
      }
      const ft = (p.div_7_foreign_tax_paid ?? p.box7_foreign_tax) as number | undefined
      if (ft != null && ft !== 0) {
        result.foreignTax = ft
      }
    }
    return result
  }

  const p = doc.parsed_data as Record<string, unknown>

  if (effectiveFormType === '1099_int' || effectiveFormType === '1099_int_c') {
    const amt = p.box1_interest as number | undefined
    if (amt != null && amt !== 0) {
      result.interest = amt
    }
    const ft = p.box6_foreign_tax as number | undefined
    if (ft != null && ft !== 0) {
      result.foreignTax = ft
    }
  } else if (effectiveFormType === '1099_div' || effectiveFormType === '1099_div_c') {
    const amt = (p.box1a_ordinary ?? p.box1_ordinary) as number | undefined
    if (amt != null && amt !== 0) {
      result.dividend = amt
    }
    const ft = p.box7_foreign_tax as number | undefined
    if (ft != null && ft !== 0) {
      result.foreignTax = ft
    }
  } else if (effectiveFormType === '1099_misc') {
    const amt = (p.box3_other_income ?? p.box3_other ?? p.box7_nonemployee ?? p.total_amount) as number | undefined
    if (amt != null && amt !== 0) {
      result.other = amt
    }
  } else if (effectiveFormType === 'k1' && isFK1StructuredData(doc.parsed_data)) {
    const k1Data = doc.parsed_data as FK1StructuredData
    const net = k1NetIncome(k1Data)
    if (net !== 0) {
      result.other = net
    }
    const ft = extractForeignTaxFromK1(k1Data)
    if (ft && ft.totalForeignTaxPaid !== 0) {
      result.foreignTax = ft.totalForeignTaxPaid
    }
  }

  return result
}
