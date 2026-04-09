/**
 * transactionCache.ts
 *
 * IndexedDB-backed cache for transaction data.
 * Cache key format: `{userId}-{accountId}-{year}`
 *
 * Strategy: show cached data immediately on page load, then revalidate
 * in the background via a full refresh from the API.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

const DB_NAME = 'transaction-cache'
const DB_VERSION = 1
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
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
        }
      },
    })
  }
  return dbPromise
}

/**
 * Build a cache key from the given parameters.
 */
export function buildCacheKey(userId: number | string, accountId: number | string, year: string): string {
  return `${userId}-${accountId}-${year}`
}

/**
 * Retrieve cached transactions for the given key.
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
 * Store transactions in the cache for the given key.
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
 * Clear all cached data for a specific user (e.g., on logout).
 * Deletes all entries whose cacheKey starts with `{userId}-`.
 */
export async function clearCacheForUser(userId: number | string): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const keys = await store.getAllKeys()
    const prefix = `${userId}-`
    await Promise.all(
      keys
        .filter((k) => k.startsWith(prefix))
        .map((k) => store.delete(k)),
    )
    await tx.done
  } catch {
    // ignore
  }
}

/**
 * Clear the entire transaction cache (e.g., on logout when user ID is unknown).
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDb()
    await db.clear(STORE_NAME)
  } catch {
    // ignore
  }
}
