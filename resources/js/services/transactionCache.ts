/**
 * transactionCache.ts
 *
 * IndexedDB-backed cache for transaction data.
 * Cache key format: `{accountId}` — account IDs are unique across users,
 * so no user or year scoping is needed. The cache stores ALL transactions
 * for an account (all years) so it can be reused by both the Transactions
 * page (filtered per year in JS) and the Tax Preview (needs all-years data
 * for short dividend analysis etc.).
 *
 * Strategy: show cached data immediately on page load, then revalidate
 * in the background via a full refresh from the API.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

const DB_NAME = 'transaction-cache'
/** Bump version to clear any per-year entries from DB_VERSION=1. */
const DB_VERSION = 2
const STORE_NAME = 'transactions'

export interface TransactionCacheEntry {
  cacheKey: string
  transactions: AccountLineItem[]
  lastFetched: number // unix ms timestamp
}

interface TransactionCacheDB extends DBSchema {
  transactions: {
    key: string
    value: TransactionCacheEntry
  }
}

let dbPromise: Promise<IDBPDatabase<TransactionCacheDB>> | null = null

function getDb(): Promise<IDBPDatabase<TransactionCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TransactionCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 → v2: drop old per-year store and recreate (cache key format changed)
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
        }
      },
    })
  }
  return dbPromise
}

/**
 * Build a cache key from the account ID.
 * The `userId` and `year` parameters are accepted but ignored — they exist
 * only for backwards-compatible call-sites that have not yet been updated.
 *
 * @deprecated Pass only `accountId`. The `userId` and `year` arguments are
 *   no-ops and will be removed in a future cleanup.
 */
export function buildCacheKey(
  _userIdOrAccountId: number | string,
  accountId?: number | string,
  _year?: string,
): string {
  // If called as buildCacheKey(userId, accountId, year) keep old callers working
  return String(accountId ?? _userIdOrAccountId)
}

/**
 * Retrieve cached transactions for an account.
 * Returns null if nothing is cached.
 */
export async function getCachedTransactions(cacheKey: string): Promise<TransactionCacheEntry | null> {
  try {
    const db = await getDb()
    const entry = await db.get(STORE_NAME, cacheKey)
    return entry ?? null
  } catch {
    return null
  }
}

/**
 * Store transactions in the cache for an account.
 */
export async function setCachedTransactions(cacheKey: string, transactions: AccountLineItem[]): Promise<void> {
  try {
    const db = await getDb()
    const entry: TransactionCacheEntry = {
      cacheKey,
      transactions,
      lastFetched: Date.now(),
    }
    await db.put(STORE_NAME, entry)
  } catch {
    // Cache failures should never break the app
  }
}

/**
 * Remove a specific cache entry.
 */
export async function deleteCachedTransactions(cacheKey: string): Promise<void> {
  try {
    const db = await getDb()
    await db.delete(STORE_NAME, cacheKey)
  } catch {
    // ignore
  }
}

/**
 * Clear all cached transaction data.
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDb()
    await db.clear(STORE_NAME)
  } catch {
    // ignore
  }
}

/**
 * @deprecated No-op — cache keys are no longer user-scoped.
 * Call clearAllCache() instead.
 */
export async function clearCacheForUser(_userId: number | string): Promise<void> {
  await clearAllCache()
}
