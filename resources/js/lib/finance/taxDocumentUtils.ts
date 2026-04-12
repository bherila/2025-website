/**
 * Shared utilities for multi-account (broker_1099) tax document operations.
 *
 * These handle matching between TaxDocumentAccountLink rows (the join table)
 * and the per-account entries stored in the parent document's parsed_data array.
 */

import type { MultiAccountParsedEntry, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'

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
