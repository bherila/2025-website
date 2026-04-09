import { act, renderHook } from '@testing-library/react'

import { makeRows } from '@/__tests__/utils/testDataFactory'

import { useKeyboardNavigation } from '../useKeyboardNavigation'

describe('useKeyboardNavigation', () => {
  const mockVirtualizer = {
    scrollToIndex: jest.fn(),
    getTotalSize: jest.fn(() => 1000),
    getVirtualItems: jest.fn(() => []),
  } as any

  const createMockEvent = (
    key: string,
    options: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}
  ): React.KeyboardEvent => ({
    key,
    shiftKey: options.shiftKey || false,
    ctrlKey: options.ctrlKey || false,
    metaKey: options.metaKey || false,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as any)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('moves focus down with ArrowDown', () => {
    const rows = makeRows(5)
    const setFocusedRowIndex = jest.fn()
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 0,
        setFocusedRowIndex,
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setFocusedRowIndex).toHaveBeenCalledWith(1)
    expect(handleRowClick).toHaveBeenCalledWith(
      2,
      1,
      expect.objectContaining({ shiftKey: false, ctrlKey: false, metaKey: false })
    )
  })

  it('moves focus up with ArrowUp', () => {
    const rows = makeRows(5)
    const setFocusedRowIndex = jest.fn()
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 2,
        setFocusedRowIndex,
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('ArrowUp')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setFocusedRowIndex).toHaveBeenCalledWith(1)
    expect(handleRowClick).toHaveBeenCalledWith(
      2,
      1,
      expect.objectContaining({ shiftKey: false, ctrlKey: false, metaKey: false })
    )
  })

  it('extends selection range with Shift+ArrowDown', () => {
    const rows = makeRows(5)
    const setFocusedRowIndex = jest.fn()
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex,
        displayData: rows,
        selectedRowIds: new Set([2]),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('ArrowDown', { shiftKey: true })
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(handleRowClick).toHaveBeenCalledWith(
      3,
      2,
      expect.objectContaining({ shiftKey: true, ctrlKey: false, metaKey: false })
    )
  })

  it('scrolls into view with virtual scrolling enabled', () => {
    const rows = makeRows(100)
    const setFocusedRowIndex = jest.fn()
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 10,
        setFocusedRowIndex,
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: true,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(11, { align: 'auto' })
  })

  it('selects all with Ctrl+A', () => {
    const rows = makeRows(3)
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 0,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('a', { ctrlKey: true })
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(handleRowClick).toHaveBeenCalledTimes(3)
    expect(handleRowClick).toHaveBeenCalledWith(
      1,
      0,
      expect.objectContaining({ shiftKey: false, ctrlKey: true, metaKey: false })
    )
  })

  it('selects all with Cmd+A (Mac)', () => {
    const rows = makeRows(2)
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 0,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('a', { metaKey: true })
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(handleRowClick).toHaveBeenCalledTimes(2)
  })

  it('clears selection with Escape', () => {
    const rows = makeRows(3)
    const clearSelection = jest.fn()
    const setFocusedRowIndex = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex,
        displayData: rows,
        selectedRowIds: new Set([1, 2]),
        handleRowClick: jest.fn(),
        clearSelection,
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('Escape')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(clearSelection).toHaveBeenCalled()
    expect(setFocusedRowIndex).toHaveBeenCalledWith(-1)
  })

  it('opens details modal with Enter when one row selected', () => {
    const rows = makeRows(3)
    const setSelectedTransaction = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set([2]),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction,
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('Enter')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setSelectedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ t_id: 2 })
    )
  })

  it('opens details modal with Enter for focused row when no selection', () => {
    const rows = makeRows(3)
    const setSelectedTransaction = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction,
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('Enter')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setSelectedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ t_id: 2 })
    )
  })

  it('triggers delete confirmation with Delete key for single selection', () => {
    const rows = makeRows(3)
    const setDeleteConfirmTransaction = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set([2]),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: jest.fn(),
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction,
      })
    )

    const event = createMockEvent('Delete')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setDeleteConfirmTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ t_id: 2 })
    )
  })

  it('triggers batch delete with Delete key for multiple selections', () => {
    const rows = makeRows(5)
    const handleBatchDelete = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set([1, 2, 3]),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: jest.fn(),
        handleBatchDelete,
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('Delete')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(handleBatchDelete).toHaveBeenCalled()
  })

  it('triggers delete confirmation with Backspace key', () => {
    const rows = makeRows(3)
    const setDeleteConfirmTransaction = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set([2]),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: jest.fn(),
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction,
      })
    )

    const event = createMockEvent('Backspace')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setDeleteConfirmTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ t_id: 2 })
    )
  })

  it('does not trigger delete when onDeleteTransaction is not provided', () => {
    const rows = makeRows(3)
    const handleBatchDelete = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set([1, 2]),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete,
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('Delete')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(handleBatchDelete).not.toHaveBeenCalled()
  })

  it('does nothing when displayData is empty', () => {
    const setFocusedRowIndex = jest.fn()
    const handleRowClick = jest.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 0,
        setFocusedRowIndex,
        displayData: [],
        selectedRowIds: new Set(),
        handleRowClick,
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: undefined,
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const event = createMockEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(event)
    })

    expect(setFocusedRowIndex).not.toHaveBeenCalled()
    expect(handleRowClick).not.toHaveBeenCalled()
  })

  it('prevents default for all handled keys', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        focusedRowIndex: 1,
        setFocusedRowIndex: jest.fn(),
        displayData: rows,
        selectedRowIds: new Set(),
        handleRowClick: jest.fn(),
        clearSelection: jest.fn(),
        useVirtualScroll: false,
        virtualizer: mockVirtualizer,
        onDeleteTransaction: jest.fn(),
        handleBatchDelete: jest.fn(),
        setSelectedTransaction: jest.fn(),
        setDeleteConfirmTransaction: jest.fn(),
      })
    )

    const keys = ['ArrowDown', 'ArrowUp', 'a', 'Escape', 'Enter', 'Delete']
    keys.forEach((key) => {
      const event = createMockEvent(key, key === 'a' ? { ctrlKey: true } : {})
      act(() => {
        result.current.handleKeyDown(event)
      })
      expect(event.preventDefault).toHaveBeenCalled()
    })
  })
})
