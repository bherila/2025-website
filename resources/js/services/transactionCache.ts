/**
 * IndexedDB-backed transaction cache with per-scope incremental sync metadata.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

const DB_NAME = 'transaction-cache'
const DB_VERSION = 4
const TRANSACTIONS_STORE = 'transactionRows'
const METADATA_STORE = 'syncMetadata'
const SCOPE_INDEX = 'scope'

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

interface ScopedRowsIndex {
  getAllKeys(query: string): Promise<IDBValidKey[]>
}

interface ScopedRowsStore {
  delete(key: string): Promise<void>
  index(name: string): ScopedRowsIndex
}

interface TransactionCacheDB extends DBSchema {
  transactionRows: {
    key: string
    value: TransactionRowEntry
    indexes: {
      scope: string
    }
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
      upgrade(db, _oldVersion, _newVersion, transaction) {
        const legacyDb = db as unknown as {
          objectStoreNames: DOMStringList
          deleteObjectStore: (name: string) => void
        }
        if (legacyDb.objectStoreNames.contains('transactions')) {
          legacyDb.deleteObjectStore('transactions')
        }

        const transactionRowsStore = db.objectStoreNames.contains(TRANSACTIONS_STORE)
          ? transaction.objectStore(TRANSACTIONS_STORE)
          : db.createObjectStore(TRANSACTIONS_STORE, { keyPath: 'rowKey' })

        if (!transactionRowsStore.indexNames.contains(SCOPE_INDEX)) {
          transactionRowsStore.createIndex(SCOPE_INDEX, SCOPE_INDEX)
        }

        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'scope' })
        }
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

async function getRowsForScope(db: IDBPDatabase<TransactionCacheDB>, scope: string): Promise<TransactionRowEntry[]> {
  return db.getAllFromIndex(TRANSACTIONS_STORE, SCOPE_INDEX, scope)
}

async function deleteRowsForScope(
  rowsStore: ScopedRowsStore,
  scope: string,
): Promise<void> {
  const rowKeys = await rowsStore.index(SCOPE_INDEX).getAllKeys(scope)
  await Promise.all(rowKeys.map((key) => rowsStore.delete(String(key))))
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

    const rows = await getRowsForScope(db, cacheKey)
    const transactions = rows
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
    await deleteRowsForScope(rowsStore, cacheKey)

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
    const pendingWrites: Promise<unknown>[] = []

    for (const deletion of payload.deleted) {
      pendingWrites.push(rowsStore.delete(rowKey(cacheKey, deletion.t_id)))
    }

    for (const transaction of payload.transactions) {
      const id = transactionId(transaction)
      if (id !== null) {
        pendingWrites.push(rowsStore.put({
          rowKey: rowKey(cacheKey, id),
          scope: cacheKey,
          transaction,
        }))
      }
    }

    pendingWrites.push(tx.objectStore(METADATA_STORE).put({
      scope: cacheKey,
      lastFetched: Date.now(),
      lastSyncedAt: payload.server_time,
    }))
    await Promise.all(pendingWrites)
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
    await deleteRowsForScope(rowsStore, cacheKey)
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
