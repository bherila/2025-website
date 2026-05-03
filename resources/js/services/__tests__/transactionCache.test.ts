import type { AccountLineItem } from '@/data/finance/AccountLineItem'

const stores = {
  transactionRows: new Map<string, unknown>(),
  syncMetadata: new Map<string, unknown>(),
}

function storeFor(name: keyof typeof stores) {
  return {
    get: jest.fn((key: string) => Promise.resolve(stores[name].get(key))),
    getAll: jest.fn(() => Promise.resolve(Array.from(stores[name].values()))),
    put: jest.fn((value: { rowKey?: string, scope?: string }) => {
      const key = value.rowKey ?? value.scope
      if (key) stores[name].set(key, value)
      return Promise.resolve()
    }),
    delete: jest.fn((key: string) => {
      stores[name].delete(key)
      return Promise.resolve()
    }),
    clear: jest.fn(() => {
      stores[name].clear()
      return Promise.resolve()
    }),
  }
}

const mockDb = {
  get: jest.fn((storeName: keyof typeof stores, key: string) => storeFor(storeName).get(key)),
  getAll: jest.fn((storeName: keyof typeof stores) => storeFor(storeName).getAll()),
  transaction: jest.fn((storeNames: Array<keyof typeof stores> | keyof typeof stores) => ({
    objectStore: jest.fn((storeName: keyof typeof stores) => storeFor(storeName)),
    done: Promise.resolve(),
    store: storeFor(Array.isArray(storeNames) ? storeNames[0] ?? 'transactionRows' : storeNames),
  })),
  objectStoreNames: {
    contains: jest.fn(() => false),
  },
  createObjectStore: jest.fn(),
  deleteObjectStore: jest.fn(),
}

jest.mock('idb', () => ({
  openDB: jest.fn((_name, _version, options) => {
    options?.upgrade?.(mockDb)
    return Promise.resolve(mockDb)
  }),
}))

const mockGet = jest.fn()
jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (url: string) => mockGet(url),
  },
}))

import { makeRow, makeRows } from '@/__tests__/utils/testDataFactory'
import {
  applyTransactionSync,
  buildCacheKey,
  clearAllCache,
  clearCacheForUser,
  deleteCachedTransactions,
  getCachedTransactions,
  setCachedTransactions,
  syncCachedTransactions,
} from '@/services/transactionCache'

function resetStores() {
  stores.transactionRows.clear()
  stores.syncMetadata.clear()
  jest.clearAllMocks()
  mockGet.mockReset()
}

describe('buildCacheKey', () => {
  it('returns a single-account scope when called with just accountId', () => {
    expect(buildCacheKey(7)).toBe('account:7')
  })

  it('returns the account scope when called with legacy (userId, accountId, year) signature', () => {
    expect(buildCacheKey(42, 7, '2024')).toBe('account:7')
  })

  it('returns the all-accounts scope', () => {
    expect(buildCacheKey('all')).toBe('all')
  })
})

describe('transaction cache storage', () => {
  beforeEach(resetStores)

  it('returns null when cache metadata is empty', async () => {
    await expect(getCachedTransactions('account:7')).resolves.toBeNull()
  })

  it('stores transactions under the given scope', async () => {
    await setCachedTransactions('account:33', makeRows(5), '2026-05-03T10:00:00.000Z')

    const cached = await getCachedTransactions('account:33')
    expect(cached?.transactions).toHaveLength(5)
    expect(cached?.lastSyncedAt).toBe('2026-05-03T10:00:00.000Z')
  })

  it('keeps single-account and all-account scopes separate', async () => {
    await setCachedTransactions('account:7', [makeRow({ t_id: 1, t_description: 'single' })])
    await setCachedTransactions('all', [makeRow({ t_id: 1, t_description: 'all' })])

    const single = await getCachedTransactions('account:7')
    const all = await getCachedTransactions('all')

    expect(single?.transactions[0]?.t_description).toBe('single')
    expect(all?.transactions[0]?.t_description).toBe('all')
  })

  it('deletes only the specified scope', async () => {
    await setCachedTransactions('account:7', makeRows(1))
    await setCachedTransactions('all', makeRows(1))

    await deleteCachedTransactions('account:7')

    await expect(getCachedTransactions('account:7')).resolves.toBeNull()
    expect((await getCachedTransactions('all'))?.transactions).toHaveLength(1)
  })
})

describe('applyTransactionSync', () => {
  beforeEach(resetStores)

  it('upserts changed rows and stores sync metadata', async () => {
    await setCachedTransactions('account:7', [makeRow({ t_id: 1, t_description: 'old' })])

    const result = await applyTransactionSync('account:7', {
      server_time: '2026-05-03T11:00:00.000Z',
      transactions: [makeRow({ t_id: 1, t_description: 'new' }), makeRow({ t_id: 2 })],
      deleted: [],
    })

    expect(result?.transactions).toHaveLength(2)
    expect(result?.transactions.find((row: AccountLineItem) => row.t_id === 1)?.t_description).toBe('new')
    expect(result?.lastSyncedAt).toBe('2026-05-03T11:00:00.000Z')
  })

  it('removes rows listed in tombstones', async () => {
    await setCachedTransactions('account:7', makeRows(2))

    const result = await applyTransactionSync('account:7', {
      server_time: '2026-05-03T11:00:00.000Z',
      transactions: [],
      deleted: [{ t_id: 1, t_account: 7, deleted_at: '2026-05-03T10:59:00.000Z' }],
    })

    expect(result?.transactions.map((row) => row.t_id)).toEqual([2])
  })
})

describe('syncCachedTransactions', () => {
  beforeEach(resetStores)

  it('fetches bootstrap sync without since when no metadata exists', async () => {
    mockGet.mockResolvedValue({
      server_time: '2026-05-03T10:00:00.000Z',
      transactions: makeRows(1),
      deleted: [],
    })

    await syncCachedTransactions('account:7', '/api/finance/7/line_items/sync')

    expect(mockGet).toHaveBeenCalledWith('/api/finance/7/line_items/sync')
  })

  it('passes last sync timestamp on incremental sync', async () => {
    await setCachedTransactions('account:7', makeRows(1), '2026-05-03T10:00:00.000Z')
    mockGet.mockResolvedValue({
      server_time: '2026-05-03T11:00:00.000Z',
      transactions: [],
      deleted: [],
    })

    await syncCachedTransactions('account:7', '/api/finance/7/line_items/sync')

    expect(mockGet).toHaveBeenCalledWith('/api/finance/7/line_items/sync?since=2026-05-03T10%3A00%3A00.000Z')
  })
})

describe('clear cache helpers', () => {
  beforeEach(resetStores)

  it('clears every store', async () => {
    await setCachedTransactions('account:7', makeRows(1))
    await setCachedTransactions('all', makeRows(1))

    await clearAllCache()

    await expect(getCachedTransactions('account:7')).resolves.toBeNull()
    await expect(getCachedTransactions('all')).resolves.toBeNull()
  })

  it('clearCacheForUser remains an all-cache compatibility alias', async () => {
    await setCachedTransactions('account:7', makeRows(1))

    await clearCacheForUser(42)

    await expect(getCachedTransactions('account:7')).resolves.toBeNull()
  })
})
