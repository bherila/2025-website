/**
 * Tests for transactionCache.ts
 *
 * We mock the `idb` library so tests run deterministically in jsdom (no real IndexedDB).
 *
 * Cache key format changed in DB_VERSION=2: keys are now just `{accountId}` (account IDs
 * are unique across users, so no userId or year scoping is needed). `clearCacheForUser`
 * is now a no-op alias for `clearAllCache`.
 */

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

// ---------------------------------------------------------------------------
// Mock idb
// ---------------------------------------------------------------------------
const mockStore: Map<string, unknown> = new Map()

const mockObjectStore = {
  get: jest.fn((key: string) => Promise.resolve(mockStore.get(key))),
  put: jest.fn((value: { cacheKey: string }) => {
    mockStore.set(value.cacheKey, value)
    return Promise.resolve()
  }),
  delete: jest.fn((key: string) => {
    mockStore.delete(key)
    return Promise.resolve()
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Array.from(mockStore.keys()))),
  clear: jest.fn(() => {
    mockStore.clear()
    return Promise.resolve()
  }),
}

const mockTx = {
  objectStore: jest.fn(() => mockObjectStore),
  done: Promise.resolve(),
}

const mockDb = {
  get: jest.fn((storeName: string, key: string) => mockObjectStore.get(key)),
  put: jest.fn((storeName: string, value: { cacheKey: string }) => mockObjectStore.put(value)),
  delete: jest.fn((storeName: string, key: string) => mockObjectStore.delete(key)),
  clear: jest.fn((storeName: string) => mockObjectStore.clear()),
  transaction: jest.fn(() => mockTx),
}

jest.mock('idb', () => ({
  openDB: jest.fn(() => Promise.resolve(mockDb)),
}))

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------
import { makeRows } from '@/__tests__/utils/testDataFactory'
import {
  buildCacheKey,
  clearAllCache,
  clearCacheForUser,
  deleteCachedTransactions,
  getCachedTransactions,
  setCachedTransactions,
} from '@/services/transactionCache'

describe('buildCacheKey', () => {
  it('returns the accountId as the key when called with just accountId', () => {
    expect(buildCacheKey(7)).toBe('7')
  })

  it('returns the accountId when called with legacy (userId, accountId, year) signature', () => {
    // Old callers pass (userId, accountId, year) — accountId is param 2
    expect(buildCacheKey(42, 7, '2024')).toBe('7')
  })

  it('works with string accountId', () => {
    expect(buildCacheKey('33')).toBe('33')
  })
})

describe('getCachedTransactions', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    // Re-wire mock after clearAllMocks
    mockDb.get.mockImplementation((_, key: string) => mockObjectStore.get(key))
    mockObjectStore.get.mockImplementation((key: string) => Promise.resolve(mockStore.get(key)))
  })

  it('returns null when cache is empty', async () => {
    const result = await getCachedTransactions('7')
    expect(result).toBeNull()
  })

  it('returns the cached entry when it exists', async () => {
    const rows = makeRows(3)
    const entry = { cacheKey: '7', transactions: rows, lastFetched: Date.now() }
    mockStore.set('7', entry)

    const result = await getCachedTransactions('7')
    expect(result).toEqual(entry)
    expect(result?.transactions).toHaveLength(3)
  })
})

describe('setCachedTransactions', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockDb.put.mockImplementation((_, value: { cacheKey: string }) => mockObjectStore.put(value))
    mockObjectStore.put.mockImplementation((value: { cacheKey: string }) => {
      mockStore.set(value.cacheKey, value)
      return Promise.resolve()
    })
  })

  it('stores transactions under the given cache key', async () => {
    const rows = makeRows(5)
    await setCachedTransactions('33', rows)
    expect(mockStore.has('33')).toBe(true)
    const stored = mockStore.get('33') as { transactions: AccountLineItem[] }
    expect(stored.transactions).toHaveLength(5)
  })

  it('updates lastFetched timestamp', async () => {
    const before = Date.now()
    await setCachedTransactions('33', makeRows(1))
    const after = Date.now()
    const stored = mockStore.get('33') as { lastFetched: number }
    expect(stored.lastFetched).toBeGreaterThanOrEqual(before)
    expect(stored.lastFetched).toBeLessThanOrEqual(after)
  })
})

describe('deleteCachedTransactions', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockDb.delete.mockImplementation((_, key: string) => mockObjectStore.delete(key))
    mockObjectStore.delete.mockImplementation((key: string) => {
      mockStore.delete(key)
      return Promise.resolve()
    })
  })

  it('removes the specified cache entry', async () => {
    mockStore.set('33', { cacheKey: '33', transactions: [], lastFetched: 0 })
    await deleteCachedTransactions('33')
    expect(mockStore.has('33')).toBe(false)
  })

  it('is a no-op when the key does not exist', async () => {
    await expect(deleteCachedTransactions('nonexistent')).resolves.toBeUndefined()
  })
})

describe('clearCacheForUser', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockDb.clear.mockImplementation(() => mockObjectStore.clear())
    mockObjectStore.clear.mockImplementation(() => {
      mockStore.clear()
      return Promise.resolve()
    })
  })

  it('clears all cache entries (no longer user-scoped)', async () => {
    mockStore.set('1', { cacheKey: '1' })
    mockStore.set('2', { cacheKey: '2' })
    await clearCacheForUser(42)
    expect(mockStore.size).toBe(0)
  })

  it('is a no-op when the cache is already empty', async () => {
    await expect(clearCacheForUser(42)).resolves.toBeUndefined()
    expect(mockStore.size).toBe(0)
  })
})

describe('clearAllCache', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockDb.clear.mockImplementation(() => mockObjectStore.clear())
    mockObjectStore.clear.mockImplementation(() => {
      mockStore.clear()
      return Promise.resolve()
    })
  })

  it('empties the entire cache store', async () => {
    mockStore.set('1', {})
    mockStore.set('2', {})
    await clearAllCache()
    expect(mockStore.size).toBe(0)
  })
})
