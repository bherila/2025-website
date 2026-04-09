/**
 * Tests for transactionCache.ts
 *
 * We mock the `idb` library so tests run deterministically in jsdom (no real IndexedDB).
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
  it('builds key in {userId}-{accountId}-{year} format', () => {
    expect(buildCacheKey(42, 7, '2024')).toBe('42-7-2024')
  })

  it('works with string user id', () => {
    expect(buildCacheKey('abc', 3, '2023')).toBe('abc-3-2023')
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
    const result = await getCachedTransactions('42-7-2024')
    expect(result).toBeNull()
  })

  it('returns the cached entry when it exists', async () => {
    const rows = makeRows(3)
    const entry = { cacheKey: '42-7-2024', transactions: rows, lastFetched: Date.now() }
    mockStore.set('42-7-2024', entry)

    const result = await getCachedTransactions('42-7-2024')
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
    await setCachedTransactions('1-2-2024', rows)
    expect(mockStore.has('1-2-2024')).toBe(true)
    const stored = mockStore.get('1-2-2024') as { transactions: AccountLineItem[] }
    expect(stored.transactions).toHaveLength(5)
  })

  it('updates lastFetched timestamp', async () => {
    const before = Date.now()
    await setCachedTransactions('1-2-2024', makeRows(1))
    const after = Date.now()
    const stored = mockStore.get('1-2-2024') as { lastFetched: number }
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
    mockStore.set('1-2-2024', { cacheKey: '1-2-2024', transactions: [], lastFetched: 0 })
    await deleteCachedTransactions('1-2-2024')
    expect(mockStore.has('1-2-2024')).toBe(false)
  })

  it('is a no-op when the key does not exist', async () => {
    await expect(deleteCachedTransactions('nonexistent')).resolves.toBeUndefined()
  })
})

describe('clearCacheForUser', () => {
  beforeEach(() => {
    mockStore.clear()
    jest.clearAllMocks()
    mockTx.objectStore.mockReturnValue(mockObjectStore)
    mockObjectStore.getAllKeys.mockImplementation(() => Promise.resolve(Array.from(mockStore.keys())))
    mockObjectStore.delete.mockImplementation((key: string) => {
      mockStore.delete(key)
      return Promise.resolve()
    })
    mockDb.transaction.mockReturnValue(mockTx)
  })

  it('removes only entries belonging to the specified user', async () => {
    mockStore.set('42-1-2024', { cacheKey: '42-1-2024' })
    mockStore.set('42-2-2023', { cacheKey: '42-2-2023' })
    mockStore.set('99-1-2024', { cacheKey: '99-1-2024' })

    await clearCacheForUser(42)

    expect(mockStore.has('42-1-2024')).toBe(false)
    expect(mockStore.has('42-2-2023')).toBe(false)
    expect(mockStore.has('99-1-2024')).toBe(true)
  })

  it('is a no-op when there are no entries for the user', async () => {
    mockStore.set('99-1-2024', { cacheKey: '99-1-2024' })
    await clearCacheForUser(42)
    expect(mockStore.size).toBe(1)
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
    mockStore.set('1-1-2024', {})
    mockStore.set('2-2-2023', {})
    await clearAllCache()
    expect(mockStore.size).toBe(0)
  })
})
