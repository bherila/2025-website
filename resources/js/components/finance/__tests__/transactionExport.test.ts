/**
 * Tests for transaction export functionality (CSV and JSON)
 */

import { makeRows } from '@/__tests__/utils/testDataFactory'

import { exportToCSV, exportToJSON } from '../transactionExport'

// Mock DOM APIs
window.URL.createObjectURL = jest.fn(() => 'mock-url')
window.URL.revokeObjectURL = jest.fn()

describe('exportToCSV', () => {
  let mockLink: HTMLAnchorElement

  beforeEach(() => {
    // Mock document.createElement
    mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
    } as any
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink)
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('creates CSV with proper headers', () => {
    const rows = makeRows(2, {
      t_date: '2024-01-15',
      t_type: 'BUY',
      t_description: 'Test transaction',
      t_symbol: 'AAPL',
      t_amt: 1500.0,
      t_qty: 10,
      t_price: 150.0,
      t_commission: 5.0,
      t_fee: 1.0,
      t_comment: 'Test memo',
    })

    exportToCSV(rows, 123, '2024')

    // Check Blob was created with CSV content
    const blobCalls = (window.Blob as any).mock?.calls || []
    if (blobCalls.length > 0) {
      const csvContent = blobCalls[0][0][0]
      expect(csvContent).toContain('Date,Type,Description,Symbol,Amount,Qty,Price,Commission,Fee,Memo')
      expect(csvContent).toContain('2024-01-15')
      expect(csvContent).toContain('AAPL')
    }

    // Check filename format
    expect(mockLink.download).toBe('transactions_123_2024.csv')
    expect(mockLink.click).toHaveBeenCalled()
  })

  it('escapes CSV special characters in description', () => {
    const rows = makeRows(1, {
      t_description: 'Transaction with "quotes" and, commas',
    })

    exportToCSV(rows, 456, '2023')

    const blobCalls = (window.Blob as any).mock?.calls || []
    if (blobCalls.length > 0) {
      const csvContent = blobCalls[0][0][0]
      // Quotes should be escaped with double quotes
      expect(csvContent).toContain('""quotes""')
    }
  })

  it('handles empty data gracefully', () => {
    exportToCSV([], 123, '2024')

    // Should not create link or click
    expect(mockLink.click).not.toHaveBeenCalled()
  })

  it('uses "all" as account ID when provided', () => {
    const rows = makeRows(1)

    exportToCSV(rows, 'all', '2025')

    expect(mockLink.download).toBe('transactions_all_2025.csv')
  })

  it('handles transactions with missing optional fields', () => {
    const rows = makeRows(1, {
      t_date: '2024-01-01',
      t_amt: 100,
      t_type: undefined,
      t_symbol: undefined,
      t_qty: undefined,
      t_price: undefined,
      t_commission: undefined,
      t_fee: undefined,
      t_comment: undefined,
    })

    exportToCSV(rows, 789, '2024')

    // Should create CSV with empty fields
    expect(mockLink.click).toHaveBeenCalled()
  })

  it('creates proper Blob with CSV mime type', () => {
    const rows = makeRows(1)
    const mockBlob = jest.fn()
    window.Blob = mockBlob as any

    exportToCSV(rows, 123, '2024')

    expect(mockBlob).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ type: 'text/csv;charset=utf-8;' })
    )
  })
})

describe('exportToJSON', () => {
  let mockLink: HTMLAnchorElement

  beforeEach(() => {
    mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
    } as any
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink)
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('creates JSON with pretty printing', () => {
    const rows = makeRows(2, {
      t_id: 100,
      t_date: '2024-01-15',
      t_description: 'Test transaction',
    })

    exportToJSON(rows, 123, '2024')

    // Check Blob was created with JSON content
    const blobCalls = (window.Blob as any).mock?.calls || []
    if (blobCalls.length > 0) {
      const jsonContent = blobCalls[0][0][0]
      // Should be pretty-printed with indentation
      expect(jsonContent).toContain('  ')
      expect(jsonContent).toContain('"t_id"')
      expect(jsonContent).toContain('"t_date"')
    }

    // Check filename format
    expect(mockLink.download).toBe('transactions_123_2024.json')
    expect(mockLink.click).toHaveBeenCalled()
  })

  it('handles empty data gracefully', () => {
    exportToJSON([], 123, '2024')

    // Should not create link or click
    expect(mockLink.click).not.toHaveBeenCalled()
  })

  it('uses "all" as account ID when provided', () => {
    const rows = makeRows(1)

    exportToJSON(rows, 'all', '2025')

    expect(mockLink.download).toBe('transactions_all_2025.json')
  })

  it('exports all transaction fields', () => {
    const rows = makeRows(1, {
      t_id: 999,
      t_date: '2024-01-15',
      t_type: 'BUY',
      t_description: 'Full transaction',
      t_symbol: 'MSFT',
      t_amt: 2500,
      t_qty: 15,
      t_price: 166.67,
      t_commission: 10,
      t_fee: 2,
      t_comment: 'Investment note',
    })

    exportToJSON(rows, 123, '2024')

    const blobCalls = (window.Blob as any).mock?.calls || []
    if (blobCalls.length > 0) {
      const jsonContent = blobCalls[0][0][0]
      const parsed = JSON.parse(jsonContent)
      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toMatchObject({
        t_id: 999,
        t_date: '2024-01-15',
        t_type: 'BUY',
        t_description: 'Full transaction',
        t_symbol: 'MSFT',
        t_amt: 2500,
      })
    }
  })

  it('creates proper Blob with JSON mime type', () => {
    const rows = makeRows(1)
    const mockBlob = jest.fn()
    window.Blob = mockBlob as any

    exportToJSON(rows, 123, '2024')

    expect(mockBlob).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ type: 'application/json' })
    )
  })

  it('handles special characters in transaction data', () => {
    const rows = makeRows(1, {
      t_description: 'Transaction with "quotes" and special chars: @#$%',
      t_comment: 'Comment with\nnewline and\ttab',
    })

    exportToJSON(rows, 123, '2024')

    const blobCalls = (window.Blob as any).mock?.calls || []
    if (blobCalls.length > 0) {
      const jsonContent = blobCalls[0][0][0]
      // Should be valid JSON
      expect(() => JSON.parse(jsonContent)).not.toThrow()
    }
  })
})
