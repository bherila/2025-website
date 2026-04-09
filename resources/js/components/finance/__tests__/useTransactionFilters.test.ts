import { act, renderHook } from '@testing-library/react'

import { makeRow } from '@/__tests__/utils/testDataFactory'

import { useTransactionFilters } from '../useTransactionFilters'

describe('useTransactionFilters', () => {
  it('initial state: all data passes through', () => {
    const rows = [makeRow({ t_id: 1 }), makeRow({ t_id: 2 })]
    const { result } = renderHook(() => useTransactionFilters(rows))
    expect(result.current.filteredData).toHaveLength(2)
  })

  it('dateFilter: matches rows whose t_date contains the filter string', () => {
    const rows = [
      makeRow({ t_id: 1, t_date: '2024-03-15' }),
      makeRow({ t_id: 2, t_date: '2023-11-01' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setDateFilter('2024') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('descriptionFilter: case-insensitive substring match', () => {
    const rows = [
      makeRow({ t_id: 1, t_description: 'Apple purchase' }),
      makeRow({ t_id: 2, t_description: 'Google sale' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setDescriptionFilter('APPLE') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('typeFilter: case-insensitive match including dash for missing type', () => {
    const rows = [
      makeRow({ t_id: 1, t_type: 'BUY' }),
      makeRow({ t_id: 2, t_type: undefined }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setTypeFilter('buy') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('symbolFilter: case-insensitive match', () => {
    const rows = [
      makeRow({ t_id: 1, t_symbol: 'AAPL' }),
      makeRow({ t_id: 2, t_symbol: 'GOOG' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setSymbolFilter('aapl') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('amountFilter: matches rows whose t_amt string contains the filter', () => {
    const rows = [
      makeRow({ t_id: 1, t_amt: 100 }),
      makeRow({ t_id: 2, t_amt: -50 }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setAmountFilter('100') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('memoFilter: matches rows whose t_comment contains the filter (case-insensitive)', () => {
    const rows = [
      makeRow({ t_id: 1, t_comment: 'Office expense' }),
      makeRow({ t_id: 2, t_comment: 'Travel' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setMemoFilter('OFFICE') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('tagFilter: matches rows whose tags include a matching label', () => {
    const rows = [
      makeRow({ t_id: 1, tags: [{ tag_id: 1, tag_label: 'business', tag_userid: '1', tag_color: 'blue' }] }),
      makeRow({ t_id: 2, tags: [{ tag_id: 2, tag_label: 'personal', tag_userid: '1', tag_color: 'red' }] }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setTagFilter('business') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('multiple filters combine with AND logic', () => {
    const rows = [
      makeRow({ t_id: 1, t_date: '2024-03-15', t_symbol: 'AAPL' }),
      makeRow({ t_id: 2, t_date: '2024-03-15', t_symbol: 'GOOG' }),
      makeRow({ t_id: 3, t_date: '2023-01-01', t_symbol: 'AAPL' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => {
      result.current.setDateFilter('2024')
      result.current.setSymbolFilter('AAPL')
    })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('clearing filters restores all rows', () => {
    const rows = [makeRow({ t_id: 1 }), makeRow({ t_id: 2 })]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setDateFilter('2024') })
    expect(result.current.filteredData).toHaveLength(2)
    act(() => { result.current.setDateFilter('') })
    expect(result.current.filteredData).toHaveLength(2)
  })

  it('cusipFilter: matches rows whose t_cusip contains the filter', () => {
    const rows = [
      makeRow({ t_id: 1, t_cusip: 'ABC123' }),
      makeRow({ t_id: 2, t_cusip: 'XYZ999' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setCusipFilter('abc') })
    expect(result.current.filteredData).toHaveLength(1)
    const filtered = result.current.filteredData
    expect(filtered[0]?.t_id).toBe(1)
  })

  it('postDateFilter: matches rows whose t_date_posted contains the filter', () => {
    const rows = [
      makeRow({ t_id: 1, t_date_posted: '2024-03-16' }),
      makeRow({ t_id: 2, t_date_posted: '2023-12-31' }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setPostDateFilter('2024') })
    expect(result.current.filteredData).toHaveLength(1)
  })

  it('categoryFilter: matches rows whose t_schc_category contains the filter', () => {
    const rows = [
      makeRow({ t_id: 1, t_schc_category: 'Office Expenses' }),
      makeRow({ t_id: 2, t_schc_category: undefined }),
    ]
    const { result } = renderHook(() => useTransactionFilters(rows))
    act(() => { result.current.setCategoryFilter('office') })
    expect(result.current.filteredData).toHaveLength(1)
  })
})
