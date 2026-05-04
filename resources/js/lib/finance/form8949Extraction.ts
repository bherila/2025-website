import type { Form8949Box, Form8949Lot } from '@/components/finance/Form8949Preview'
import { brokerEntryMatchesLink } from '@/lib/finance/taxDocumentUtils'
import type { MultiAccountParsedEntry, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'

export const BROKER_1099_FORM_TYPES = ['broker_1099', '1099_b', '1099_b_c'] as const
export const BROKER_1099_ENTRY_FORM_TYPES = ['1099_b', '1099_b_c'] as const

export type Broker1099DocumentType = (typeof BROKER_1099_FORM_TYPES)[number]
export type Broker1099EntryFormType = (typeof BROKER_1099_ENTRY_FORM_TYPES)[number]

export interface Broker1099DocumentLinkLike {
  ai_identifier?: string | null
  ai_account_name?: string | null
  account?: { acct_id: number; acct_name: string; acct_number?: string | null } | null
  account_id?: number | null
  id?: number | null
}

export interface Broker1099ParsedDocLike {
  formType?: string
  form_type?: string
  parsedData?: Record<string, unknown> | Record<string, unknown>[]
  accountId?: number | null
  accountName?: string | null
  accountLast4?: string | null
  accountLinks?: Broker1099DocumentLinkLike[]
  payerName?: string
}

export interface Form8949LotSourceMetadata {
  tax_document_id?: number | null
  acct_id?: number
  account_name?: string | null
  account_last4?: string | null
  account_link_id?: number | null
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isBroker1099DocumentType(formType: unknown): formType is Broker1099DocumentType {
  return formType === 'broker_1099'
}

export function isBroker1099EntryType(formType: unknown): formType is Broker1099EntryFormType {
  return formType === '1099_b' || formType === '1099_b_c'
}

export function isForm8949Box(value: unknown): value is Form8949Box {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E' || value === 'F'
}

export function normalizeForm8949Box(value: unknown): Form8949Box | null {
  return isForm8949Box(value) ? value : null
}

export function isTruthyBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function accountLast4FromValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }
  const digits = String(value).replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

export function scalarMoneyValue(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

export function form8949TransactionToLot(
  transaction: unknown,
  metadata: Form8949LotSourceMetadata,
): Form8949Lot | null {
  if (!isPlainRecord(transaction)) {
    return null
  }

  return {
    ...metadata,
    symbol: typeof transaction.symbol === 'string' ? transaction.symbol : null,
    description: typeof transaction.description === 'string' ? transaction.description : null,
    quantity: scalarMoneyValue(transaction.quantity),
    purchase_date: typeof transaction.purchase_date === 'string' ? transaction.purchase_date : null,
    sale_date: typeof transaction.sale_date === 'string' ? transaction.sale_date : null,
    cost_basis: scalarMoneyValue(transaction.cost_basis),
    proceeds: scalarMoneyValue(transaction.proceeds),
    realized_gain_loss: scalarMoneyValue(transaction.realized_gain_loss),
    is_short_term: isTruthyBoolean(transaction.is_short_term),
    lot_source: '1099b',
    form_8949_box: normalizeForm8949Box(transaction.form_8949_box),
    is_covered: typeof transaction.is_covered === 'boolean' ? transaction.is_covered : null,
    accrued_market_discount: scalarMoneyValue(transaction.accrued_market_discount),
    wash_sale_disallowed: scalarMoneyValue(transaction.wash_sale_disallowed),
  }
}

function entryMatchesLink(entry: Record<string, unknown>, link: Broker1099DocumentLinkLike): boolean {
  return brokerEntryMatchesLink(
    {
      account_identifier: typeof entry.account_identifier === 'string' ? entry.account_identifier : null,
      account_name: typeof entry.account_name === 'string' ? entry.account_name : null,
    },
    link,
  )
}

export function broker1099TransactionsToLots(
  parsedData: unknown,
  metadata: Form8949LotSourceMetadata,
): Form8949Lot[] {
  const txList = isPlainRecord(parsedData) && Array.isArray(parsedData.transactions)
    ? parsedData.transactions
    : []

  return txList
    .map((tx) => form8949TransactionToLot(tx, metadata))
    .filter((lot): lot is Form8949Lot => lot !== null)
}

function moneyToCentsKey(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    return ''
  }
  // Round to cents so float jitter doesn't break dedup matches.
  return String(Math.round(n * 100))
}

/**
 * Stable per-transaction signature for deduplicating imported 1099-B lots against
 * persisted `fin_account_lots` rows that originated from the same parsed_data.
 *
 * When a 1099-B is partially reconciled (some transactions split out into share-level
 * lots, others not), we want to keep the persisted lots and drop only the imported
 * transactions whose identity matches one of them — not the entire document's worth.
 */
export function form8949LotSignature(lot: Pick<Form8949Lot, 'tax_document_id' | 'acct_id' | 'symbol' | 'sale_date' | 'proceeds' | 'cost_basis'>): string | null {
  if (lot.tax_document_id == null) {
    return null
  }
  return [
    lot.tax_document_id,
    lot.acct_id ?? '',
    (lot.symbol ?? '').trim().toUpperCase(),
    (lot.sale_date ?? '').trim(),
    moneyToCentsKey(lot.proceeds),
    moneyToCentsKey(lot.cost_basis),
  ].join('|')
}

/**
 * Merge persisted closed lots with imported 1099-B transactions, suppressing imported
 * lots that exactly match a persisted lot (same doc/account/symbol/sale-date/proceeds/basis).
 * Imported lots without a `tax_document_id` are always kept since there's no anchor for dedup.
 */
export function mergeForm8949Lots(persisted: Form8949Lot[], imported: Form8949Lot[]): Form8949Lot[] {
  const persistedSignatures = new Set(
    persisted
      .map((lot) => form8949LotSignature(lot))
      .filter((sig): sig is string => sig !== null),
  )
  const filtered = imported.filter((lot) => {
    const signature = form8949LotSignature(lot)
    return signature === null || !persistedSignatures.has(signature)
  })
  return [...persisted, ...filtered]
}

export function form8949LotsFromTaxDocuments(docs: TaxDocument[], accountId?: number): Form8949Lot[] {
  return docs.flatMap((doc) => {
    if (!doc.is_reviewed || (doc.form_type !== '1099_b' && doc.form_type !== '1099_b_c' && !isBroker1099DocumentType(doc.form_type))) {
      return []
    }

    if (!isBroker1099DocumentType(doc.form_type)) {
      const parsed = isPlainRecord(doc.parsed_data) ? doc.parsed_data : null
      // account_links is the canonical association; doc.account is a legacy field that may
      // be null even when a link resolves the account. Prefer the link's account when available.
      const matchingLink = (doc.account_links ?? []).find((link) => isBroker1099EntryType(link.form_type))
      const resolvedAccountId = doc.account_id ?? matchingLink?.account_id ?? undefined
      if (accountId !== undefined && resolvedAccountId !== accountId) {
        return []
      }
      const last4 = accountLast4FromValue(parsed?.account_number)
        ?? accountLast4FromValue(doc.account?.acct_number)
        ?? accountLast4FromValue(matchingLink?.ai_identifier)
        ?? accountLast4FromValue(matchingLink?.account?.acct_number)
      return broker1099TransactionsToLots(parsed, {
        ...(resolvedAccountId !== undefined ? { acct_id: resolvedAccountId } : {}),
        tax_document_id: doc.id,
        account_name: doc.account?.acct_name ?? matchingLink?.account?.acct_name ?? null,
        account_last4: last4,
        account_link_id: matchingLink?.id ?? null,
      })
    }

    const parsedEntries = Array.isArray(doc.parsed_data) ? doc.parsed_data : []
    return parsedEntries.flatMap((entry) => {
      if (!isPlainRecord(entry) || !isBroker1099EntryType(entry.form_type)) {
        return []
      }

      const parsed = entry.parsed_data
      if (!isPlainRecord(parsed)) {
        return []
      }

      const matchingLink = (doc.account_links ?? []).find((link) =>
        isBroker1099EntryType(link.form_type) && entryMatchesLink(entry, link),
      ) as TaxDocumentAccountLink | undefined

      const linkedAccountId = matchingLink?.account_id ?? undefined
      if (accountId !== undefined && linkedAccountId !== accountId) {
        return []
      }

      const last4 = accountLast4FromValue(entry.account_identifier)
        ?? accountLast4FromValue(parsed.account_number)
        ?? accountLast4FromValue(matchingLink?.ai_identifier)
        ?? accountLast4FromValue(matchingLink?.account?.acct_number)

      return broker1099TransactionsToLots(parsed, {
        ...(linkedAccountId !== undefined ? { acct_id: linkedAccountId } : {}),
        tax_document_id: doc.id,
        account_name: typeof entry.account_name === 'string' ? entry.account_name : matchingLink?.account?.acct_name ?? null,
        account_last4: last4,
        account_link_id: matchingLink?.id ?? null,
      })
    })
  })
}

export function form8949LotsFrom1099ExportDocs(
  docs: Broker1099ParsedDocLike[],
): Form8949Lot[] {
  return docs.flatMap((doc) => {
    if (!isBroker1099DocumentType(doc.formType) && !isBroker1099EntryType(doc.formType)) {
      return []
    }

    if (!Array.isArray(doc.parsedData)) {
      return broker1099TransactionsToLots(doc.parsedData, {
        ...(doc.accountId !== null && doc.accountId !== undefined ? { acct_id: doc.accountId } : {}),
        account_name: doc.accountName ?? null,
        account_last4: doc.accountLast4 ?? null,
      })
    }

    return doc.parsedData.flatMap((entry) => {
      if (!isPlainRecord(entry) || !isBroker1099EntryType(entry.form_type)) {
        return []
      }

      const parsed = entry.parsed_data
      if (!isPlainRecord(parsed)) {
        return []
      }

      const links = doc.accountLinks ?? []
      const matchingLink = links.find((link: Broker1099DocumentLinkLike) => entryMatchesLink(entry, link))
      const linkedAccountId = matchingLink?.account_id ?? undefined
      const last4 = accountLast4FromValue(entry.account_identifier)
        ?? accountLast4FromValue(parsed.account_number)
        ?? accountLast4FromValue(matchingLink?.ai_identifier)
        ?? accountLast4FromValue(matchingLink?.account?.acct_number)

      return broker1099TransactionsToLots(parsed, {
        ...(linkedAccountId !== undefined && linkedAccountId !== null ? { acct_id: linkedAccountId } : {}),
        account_name: typeof entry.account_name === 'string' ? entry.account_name : matchingLink?.account?.acct_name ?? null,
        account_last4: last4,
        account_link_id: matchingLink?.id ?? null,
      })
    })
  })
}

export function multiAccountEntries(
  parsedData: MultiAccountParsedEntry[] | null,
): MultiAccountParsedEntry[] {
  return Array.isArray(parsedData)
    ? parsedData.filter((entry): entry is MultiAccountParsedEntry => isPlainRecord(entry))
    : []
}
