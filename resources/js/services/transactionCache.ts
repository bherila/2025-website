/**
 * IndexedDB-backed transaction cache with per-scope incremental sync metadata.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

const DB_NAME = 'transaction-cache'
const DB_VERSION = 3
const TRANSACTIONS_STORE = 'transactionRows'
const METADATA_STORE = 'syncMetadata'

export interface TransactionDeletion {
  t_id: number
  t_account: number
  deleted_at: string | null
}

export interface TransactionSyncPayload {
  server_time: string
  transactions: AccountLineItem[]
  deleted: TransactionDeletion[]
}

export interface TransactionCacheEntry {
  cacheKey: string
  transactions: AccountLineItem[]
  lastFetched: number
  lastSyncedAt: string | null
}

interface TransactionRowEntry {
  rowKey: string
  scope: string
  transaction: AccountLineItem
}

interface SyncMetadataEntry {
  scope: string
  lastFetched: number
  lastSyncedAt: string | null
}

interface TransactionCacheDB extends DBSchema {
  transactionRows: {
    key: string
    value: TransactionRowEntry
  }
  syncMetadata: {
    key: string
    value: SyncMetadataEntry
  }
}

let dbPromise: Promise<IDBPDatabase<TransactionCacheDB>> | null = null

function getDb(): Promise<IDBPDatabase<TransactionCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TransactionCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const legacyDb = db as unknown as {
          objectStoreNames: DOMStringList
          deleteObjectStore: (name: string) => void
        }
        if (legacyDb.objectStoreNames.contains('transactions')) {
          legacyDb.deleteObjectStore('transactions')
        }
        if (db.objectStoreNames.contains(TRANSACTIONS_STORE)) {
          db.deleteObjectStore(TRANSACTIONS_STORE)
        }
        if (db.objectStoreNames.contains(METADATA_STORE)) {
          db.deleteObjectStore(METADATA_STORE)
        }
        db.createObjectStore(TRANSACTIONS_STORE, { keyPath: 'rowKey' })
        db.createObjectStore(METADATA_STORE, { keyPath: 'scope' })
      },
    })
  }
  return dbPromise
}

function rowKey(scope: string, transactionId: number): string {
  return `${scope}:${transactionId}`
}

function transactionId(transaction: AccountLineItem): number | null {
  return typeof transaction.t_id === 'number' ? transaction.t_id : null
}

export function buildCacheKey(
  _userIdOrAccountId: number | string,
  accountId?: number | string,
  _year?: string,
): string {
  const rawAccountId = String(accountId ?? _userIdOrAccountId)
  return rawAccountId === 'all' ? 'all' : `account:${rawAccountId}`
}

export async function getCachedTransactions(cacheKey: string): Promise<TransactionCacheEntry | null> {
  try {
    const db = await getDb()
    const metadata = await db.get(METADATA_STORE, cacheKey)
    if (!metadata) {
      return null
    }

    const rows = await db.getAll(TRANSACTIONS_STORE)
    const transactions = rows
      .filter((row) => row.scope === cacheKey)
      .map((row) => row.transaction)
      .sort((a, b) => String(b.t_date).localeCompare(String(a.t_date)))

    return {
      cacheKey,
      transactions,
      lastFetched: metadata.lastFetched,
      lastSyncedAt: metadata.lastSyncedAt,
    }
  } catch {
    return null
  }
}

export async function setCachedTransactions(
  cacheKey: string,
  transactions: AccountLineItem[],
  lastSyncedAt: string | null = null,
): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction([TRANSACTIONS_STORE, METADATA_STORE], 'readwrite')
    const rowsStore = tx.objectStore(TRANSACTIONS_STORE)
    const existingRows = await rowsStore.getAll()

    await Promise.all(
      existingRows
        .filter((row) => row.scope === cacheKey)
        .map((row) => rowsStore.delete(row.rowKey)),
    )

    await Promise.all(
      transactions.map((transaction) => {
        const id = transactionId(transaction)
        if (id === null) {
          return Promise.resolve()
        }

        return rowsStore.put({
          rowKey: rowKey(cacheKey, id),
          scope: cacheKey,
          transaction,
        })
      }),
    )

    await tx.objectStore(METADATA_STORE).put({
      scope: cacheKey,
      lastFetched: Date.now(),
      lastSyncedAt,
    })
    await tx.done
  } catch {
    // Cache failures should never break the app
  }
}

export async function applyTransactionSync(cacheKey: string, payload: TransactionSyncPayload): Promise<TransactionCacheEntry | null> {
  try {
    const db = await getDb()
    const tx = db.transaction([TRANSACTIONS_STORE, METADATA_STORE], 'readwrite')
    const rowsStore = tx.objectStore(TRANSACTIONS_STORE)

    await Promise.all(
      payload.deleted.map((deletion) => rowsStore.delete(rowKey(cacheKey, deletion.t_id))),
    )
    await Promise.all(
      payload.transactions.map((transaction) => {
        const id = transactionId(transaction)
        if (id === null) {
          return Promise.resolve()
        }

        return rowsStore.put({
          rowKey: rowKey(cacheKey, id),
          scope: cacheKey,
          transaction,
        })
      }),
    )
    await tx.objectStore(METADATA_STORE).put({
      scope: cacheKey,
      lastFetched: Date.now(),
      lastSyncedAt: payload.server_time,
    })
    await tx.done

    return getCachedTransactions(cacheKey)
  } catch {
    return null
  }
}

export async function syncCachedTransactions(cacheKey: string, endpoint: string): Promise<TransactionCacheEntry | null> {
  const cached = await getCachedTransactions(cacheKey)
  const params = new URLSearchParams()
  if (cached?.lastSyncedAt) {
    params.set('since', cached.lastSyncedAt)
  }
  const url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint
  const payload = await fetchWrapper.get(url) as TransactionSyncPayload

  return applyTransactionSync(cacheKey, payload)
}

export async function deleteCachedTransactions(cacheKey: string): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction([TRANSACTIONS_STORE, METADATA_STORE], 'readwrite')
    const rowsStore = tx.objectStore(TRANSACTIONS_STORE)
    const existingRows = await rowsStore.getAll()
    await Promise.all(
      existingRows
        .filter((row) => row.scope === cacheKey)
        .map((row) => rowsStore.delete(row.rowKey)),
    )
    await tx.objectStore(METADATA_STORE).delete(cacheKey)
    await tx.done
  } catch {
    // ignore
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction([TRANSACTIONS_STORE, METADATA_STORE], 'readwrite')
    await tx.objectStore(TRANSACTIONS_STORE).clear()
    await tx.objectStore(METADATA_STORE).clear()
    await tx.done
  } catch {
    // ignore
  }
}

export async function clearCacheForUser(_userId: number | string): Promise<void> {
  await clearAllCache()
}
