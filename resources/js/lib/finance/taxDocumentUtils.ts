/**
 * Shared utilities for multi-account (broker_1099) tax document operations.
 *
 * These handle matching between TaxDocumentAccountLink rows (the join table)
 * and the per-account entries stored in the parent document's parsed_data array.
 */

import currency from 'currency.js'

import type { ForeignTaxSummary } from '@/finance/1116'
import { extractForeignTaxFromK1 } from '@/finance/1116/k3-to-1116'
import { k1NetIncome } from '@/lib/finance/k1Utils'
import { parseMoney } from '@/lib/finance/money'
import type { FK1StructuredData, MiscRouting, MultiAccountParsedEntry, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { isFK1StructuredData, isLine8MiscRouting } from '@/types/finance/tax-document'

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
  capGain: number | null
  schC: number | null
  other: number | null
  foreignTax: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function valueFromNestedObject(
  data: Record<string, unknown>,
  objectKey: string,
  ...keys: readonly string[]
): unknown {
  const nested = data[objectKey]
  if (!isRecord(nested)) {
    return undefined
  }

  for (const key of keys) {
    if (nested[key] !== undefined) {
      return nested[key]
    }
  }

  return undefined
}

function firstDefinedValue(data: Record<string, unknown>, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (data[key] !== undefined) {
      return data[key]
    }
  }

  return undefined
}

function copyIfPresent(
  normalized: Record<string, unknown>,
  targetKey: string,
  data: Record<string, unknown>,
  ...sourceKeys: readonly string[]
): void {
  const direct = firstDefinedValue(data, ...sourceKeys)
  if (direct !== undefined) {
    normalized[targetKey] = direct
    return
  }

  const boxed = valueFromNestedObject(data, 'boxes', ...sourceKeys)
  if (boxed !== undefined) {
    normalized[targetKey] = boxed
  }
}

/**
 * Normalize the known 1099 extraction variants into the flat keys used by Tax Preview.
 * Some AI/import paths store IRS boxes inside parsed_data.boxes using long IRS labels,
 * while older manual/broker paths store box1a_ordinary, div_1a_total_ordinary, etc.
 */
export function normalize1099ParsedData(
  formType: string | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...data }

  copyIfPresent(normalized, 'payer_name', data, 'payer_name')
  copyIfPresent(normalized, 'payer_tin', data, 'payer_tin')
  copyIfPresent(normalized, 'recipient_name', data, 'recipient_name')
  copyIfPresent(normalized, 'recipient_tin', data, 'recipient_tin', 'recipient_tin_last4')
  copyIfPresent(normalized, 'account_number', data, 'account_number')

  if (formType === '1099_int' || formType === '1099_int_c') {
    copyIfPresent(normalized, 'box1_interest', data, 'box1_interest', 'int_1_interest_income', '1_interest_income')
    copyIfPresent(normalized, 'box2_early_withdrawal', data, 'box2_early_withdrawal', 'int_2_early_withdrawal_penalty', '2_early_withdrawal_penalty')
    copyIfPresent(normalized, 'box3_savings_bond', data, 'box3_savings_bond', 'int_3_us_savings_bonds_treasury', '3_interest_on_us_savings_bonds_and_treasury_obligations')
    copyIfPresent(normalized, 'box4_fed_tax', data, 'box4_fed_tax', 'int_4_federal_tax_withheld', '4_federal_income_tax_withheld')
    copyIfPresent(normalized, 'box5_investment_expense', data, 'box5_investment_expense', 'int_5_investment_expenses', '5_investment_expenses')
    copyIfPresent(normalized, 'box6_foreign_tax', data, 'box6_foreign_tax', 'int_6_foreign_tax_paid', '6_foreign_tax_paid')
    copyIfPresent(normalized, 'box7_foreign_country', data, 'box7_foreign_country', 'int_7_foreign_country', '7_foreign_country_or_us_possession', '7_foreign_country_or_us_territory')
    copyIfPresent(normalized, 'box8_tax_exempt', data, 'box8_tax_exempt', 'int_8_tax_exempt_interest', '8_tax_exempt_interest')
    copyIfPresent(normalized, 'box9_private_activity', data, 'box9_private_activity', 'int_9_specified_private_activity_bond_interest', '9_specified_private_activity_bond_interest', '9_specified_private_activity_bond_interest_amt')
    copyIfPresent(normalized, 'box10_market_discount', data, 'box10_market_discount', 'int_10_market_discount', '10_market_discount', '10_market_discount_covered_lots')
    copyIfPresent(normalized, 'box11_bond_premium', data, 'box11_bond_premium', 'int_11_bond_premium', '11_bond_premium', '11_bond_premium_covered_lots')
    copyIfPresent(normalized, 'box12_treasury_premium', data, 'box12_treasury_premium', 'int_12_treasury_premium', '12_bond_premium_on_treasury_obligations', '12_bond_premium_on_treasury_obligations_covered_lots')
    copyIfPresent(normalized, 'box13_tax_exempt_premium', data, 'box13_tax_exempt_premium', 'int_13_tax_exempt_bond_premium', '13_bond_premium_on_tax_exempt_bond', '13_bond_premium_on_tax_exempt_bonds')
  }

  if (formType === '1099_div' || formType === '1099_div_c') {
    copyIfPresent(normalized, 'box1a_ordinary', data, 'box1a_ordinary', 'box1_ordinary', 'div_1a_total_ordinary', '1a_total_ordinary_dividends')
    copyIfPresent(normalized, 'box1b_qualified', data, 'box1b_qualified', 'box1b', 'div_1b_qualified', '1b_qualified_dividends')
    copyIfPresent(normalized, 'box2a_cap_gain', data, 'box2a_cap_gain', 'div_2a_cap_gain', '2a_total_capital_gain_distributions')
    copyIfPresent(normalized, 'box2b_unrecap_1250', data, 'box2b_unrecap_1250', '2b_unrecaptured_section_1250_gain')
    copyIfPresent(normalized, 'box2c_section_1202', data, 'box2c_section_1202', '2c_section_1202_gain')
    copyIfPresent(normalized, 'box2d_collectibles', data, 'box2d_collectibles', '2d_collectibles_28_percent_gain')
    copyIfPresent(normalized, 'box2e_section_897_ordinary', data, 'box2e_section_897_ordinary', '2e_section_897_ordinary_dividends')
    copyIfPresent(normalized, 'box2f_section_897_cap_gain', data, 'box2f_section_897_cap_gain', '2f_section_897_capital_gain')
    copyIfPresent(normalized, 'box3_nondividend', data, 'box3_nondividend', '3_nondividend_distributions')
    copyIfPresent(normalized, 'box4_fed_tax', data, 'box4_fed_tax', 'div_4_federal_tax_withheld', '4_federal_income_tax_withheld')
    copyIfPresent(normalized, 'box5_section_199a', data, 'box5_section_199a', '5_section_199a_dividends')
    copyIfPresent(normalized, 'box6_investment_expense', data, 'box6_investment_expense', '6_investment_expenses')
    copyIfPresent(normalized, 'box7_foreign_tax', data, 'box7_foreign_tax', 'div_7_foreign_tax_paid', '7_foreign_tax_paid')
    copyIfPresent(normalized, 'box8_foreign_country', data, 'box8_foreign_country', '8_foreign_country_or_us_possession')
    copyIfPresent(normalized, 'box9_cash_liquidation', data, 'box9_cash_liquidation', '9_cash_liquidation_distributions')
    copyIfPresent(normalized, 'box10_noncash_liquidation', data, 'box10_noncash_liquidation', '10_noncash_liquidation_distributions')
    copyIfPresent(normalized, 'box11_exempt_interest', data, 'box11_exempt_interest', 'box12_exempt_interest_dividends', '12_exempt_interest_dividends')
    copyIfPresent(normalized, 'box12_private_activity', data, 'box12_private_activity', 'box13_specified_private_activity_bond_interest_dividends_amt', '13_specified_private_activity_bond_interest_dividends_amt')
    copyIfPresent(normalized, 'box14_state_tax', data, 'box14_state_tax', 'state_tax_withheld')
  }

  if (formType === '1099_misc') {
    copyIfPresent(normalized, 'box1_rents', data, 'box1_rents', 'misc_1_rents', '1_rents')
    copyIfPresent(normalized, 'box2_royalties', data, 'box2_royalties', 'misc_2_royalties', '2_royalties')
    copyIfPresent(normalized, 'box3_other_income', data, 'box3_other_income', 'box3_other', 'misc_3_other_income', '3_other_income')
    copyIfPresent(normalized, 'box4_fed_tax', data, 'box4_fed_tax', 'misc_4_federal_tax_withheld', '4_federal_income_tax_withheld')
    copyIfPresent(normalized, 'box8_substitute_payments', data, 'box8_substitute_payments', 'misc_8_substitute_payments', '8_substitute_payments_in_lieu_of_dividends_or_interest')
  }

  return normalized
}

const MISC_PRIMARY_BOX_KEYS = [
  'box1_rents',
  'box2_royalties',
  'box3_other_income',
  'box3_other',
  'box7_nonemployee',
  'total_amount',
] as const

function getNumericValue(
  data: Record<string, unknown>,
  ...keys: readonly string[]
): number | null {
  for (const key of keys) {
    const parsed = parseMoney(data[key] as string | number | null | undefined)
    if (parsed !== null) {
      return parsed
    }
  }

  return null
}

export function hasNonZeroNumericValue(
  data: Record<string, unknown>,
  ...keys: readonly string[]
): boolean {
  return keys.some((key) => {
    const value = getNumericValue(data, key)
    return value !== null && value !== 0
  })
}

function sumNumericValues(
  data: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  let total = currency(0)
  let hasValue = false

  for (const key of keys) {
    const value = getNumericValue(data, key)
    if (value === null) {
      continue
    }
    total = total.add(value)
    hasValue = true
  }

  return hasValue && total.value !== 0 ? total.value : null
}

function inferMiscRouting(parsedData: Record<string, unknown>): MiscRouting | null {
  if (getNumericValue(parsedData, 'box7_nonemployee') !== null) {
    return 'sch_c'
  }

  if (getNumericValue(parsedData, 'box1_rents', 'box2_royalties') !== null) {
    return 'sch_e'
  }

  if (getNumericValue(parsedData, 'box3_other_income', 'box3_other', 'total_amount') !== null) {
    return 'sch_1_line_8'
  }

  return null
}

function applyMiscRouting(
  parsedData: Record<string, unknown>,
  routing: MiscRouting | null,
  result: DocAmounts,
): void {
  if (routing === 'sch_c') {
    result.schC = sumNumericValues(parsedData, MISC_PRIMARY_BOX_KEYS)
    return
  }

  if (routing === 'sch_e' || isLine8MiscRouting(routing)) {
    result.other = sumNumericValues(parsedData, MISC_PRIMARY_BOX_KEYS)
    return
  }

  result.schC = sumNumericValues(parsedData, ['box7_nonemployee'])
  result.other = sumNumericValues(parsedData, ['box1_rents', 'box2_royalties', 'box3_other_income', 'box3_other'])

  if (result.other === null) {
    const inferredRouting = inferMiscRouting(parsedData)
    if (inferredRouting === 'sch_e' || isLine8MiscRouting(inferredRouting)) {
      result.other = sumNumericValues(parsedData, MISC_PRIMARY_BOX_KEYS)
    }
  }
}

function getSharedForeignTaxAmount(
  doc: TaxDocument,
  link: TaxDocumentAccountLink | undefined,
  foreignTaxSummaries: ForeignTaxSummary[] | undefined,
): number | null {
  if (!foreignTaxSummaries || foreignTaxSummaries.length === 0) {
    return null
  }

  const expectedSourceType = (() => {
    const formType = link?.form_type ?? doc.form_type
    if (formType === '1099_div' || formType === '1099_div_c') {
      return '1099_div'
    }
    if (formType === '1099_int' || formType === '1099_int_c') {
      return '1099_int'
    }
    if (formType === 'k1') {
      return 'k1'
    }

    return null
  })()

  if (!expectedSourceType) {
    return null
  }

  const total = foreignTaxSummaries
    .filter((summary) => {
      if (summary.sourceDocumentId !== doc.id || summary.sourceType !== expectedSourceType) {
        return false
      }

      if (link?.account_id != null && summary.accountId != null && summary.accountId !== link.account_id) {
        return false
      }

      return true
    })
    .reduce((sum, summary) => sum.add(summary.totalForeignTaxPaid), currency(0)).value

  return total === 0 ? null : total
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
export function getDocAmounts(
  doc: TaxDocument,
  link?: TaxDocumentAccountLink,
  foreignTaxSummaries?: ForeignTaxSummary[],
): DocAmounts {
  const result: DocAmounts = { interest: null, dividend: null, capGain: null, schC: null, other: null, foreignTax: null }
  const effectiveFormType = link ? link.form_type : doc.form_type
  const effectiveReviewed = link ? link.is_reviewed : doc.is_reviewed
  if (!doc.parsed_data || !effectiveReviewed) {
    return result
  }

  if (doc.form_type === 'broker_1099') {
    // Multi-account broker imports store parsed_data as an array of per-account entries;
    // read the matching entry's inner parsed_data instead of the outer array.
    const raw: Record<string, unknown> | null = Array.isArray(doc.parsed_data)
      ? link ? extractLinkParsedData(doc, link) : null
      : (doc.parsed_data as Record<string, unknown>)
    if (!raw) {
      return result
    }
    const p = normalize1099ParsedData(effectiveFormType, raw)
    if (effectiveFormType === '1099_int' || effectiveFormType === '1099_int_c') {
      const interest = getNumericValue(p, 'int_1_interest_income', 'box1_interest')
      if (interest != null && interest !== 0) {
        result.interest = interest
      }
      const ft = getNumericValue(p, 'int_6_foreign_tax_paid', 'box6_foreign_tax')
      if (ft != null && ft !== 0) {
        result.foreignTax = ft
      }
    } else if (effectiveFormType === '1099_div' || effectiveFormType === '1099_div_c') {
      const ordDiv = getNumericValue(p, 'div_1a_total_ordinary', 'box1a_ordinary', 'box1_ordinary')
      if (ordDiv != null && ordDiv !== 0) {
        result.dividend = ordDiv
      }
      const capGain = getNumericValue(p, 'div_2a_cap_gain', 'box2a_cap_gain')
      if (capGain != null && capGain !== 0) {
        result.capGain = capGain
      }
      const ft = getNumericValue(p, 'div_7_foreign_tax_paid', 'box7_foreign_tax')
      if (ft != null && ft !== 0) {
        result.foreignTax = ft
      }
    } else if (effectiveFormType === '1099_misc') {
      applyMiscRouting(p, link?.misc_routing ?? doc.misc_routing ?? null, result)
    } else if (effectiveFormType === '1099_nec') {
      const nonemployeeComp = getNumericValue(p, 'box1_nonemployeeComp', 'box1_nonemployee_compensation')
      if (nonemployeeComp != null && nonemployeeComp !== 0) {
        result.schC = nonemployeeComp
      }
    }

    const sharedForeignTax = getSharedForeignTaxAmount(doc, link, foreignTaxSummaries)
    if (sharedForeignTax !== null) {
      result.foreignTax = sharedForeignTax
    }

    return result
  }

  const p = normalize1099ParsedData(effectiveFormType, doc.parsed_data as Record<string, unknown>)

  if (effectiveFormType === '1099_int' || effectiveFormType === '1099_int_c') {
    const amt = getNumericValue(p, 'box1_interest')
    if (amt != null && amt !== 0) {
      result.interest = amt
    }
    const ft = getNumericValue(p, 'box6_foreign_tax')
    if (ft != null && ft !== 0) {
      result.foreignTax = ft
    }
  } else if (effectiveFormType === '1099_div' || effectiveFormType === '1099_div_c') {
    const amt = getNumericValue(p, 'box1a_ordinary', 'box1_ordinary')
    if (amt != null && amt !== 0) {
      result.dividend = amt
    }
    const capGain = getNumericValue(p, 'box2a_cap_gain')
    if (capGain != null && capGain !== 0) {
      result.capGain = capGain
    }
    const ft = getNumericValue(p, 'box7_foreign_tax')
    if (ft != null && ft !== 0) {
      result.foreignTax = ft
    }
  } else if (effectiveFormType === '1099_misc') {
    applyMiscRouting(p, link?.misc_routing ?? doc.misc_routing ?? null, result)
  } else if (effectiveFormType === '1099_nec') {
    const nonemployeeComp = getNumericValue(p, 'box1_nonemployeeComp', 'box1_nonemployee_compensation')
    if (nonemployeeComp != null && nonemployeeComp !== 0) {
      result.schC = nonemployeeComp
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

  const sharedForeignTax = getSharedForeignTaxAmount(doc, link, foreignTaxSummaries)
  if (sharedForeignTax !== null) {
    result.foreignTax = sharedForeignTax
  }

  return result
}
