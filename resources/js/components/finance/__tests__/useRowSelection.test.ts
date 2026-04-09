import { act, renderHook } from '@testing-library/react'

import { makeRows } from '@/__tests__/utils/testDataFactory'

import { useRowSelection } from '../useRowSelection'

function makeClickEvent(opts: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}): React.MouseEvent {
  return { shiftKey: false, ctrlKey: false, metaKey: false, ...opts } as React.MouseEvent
}

describe('useRowSelection', () => {
  it('initial state has empty selection', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    expect(result.current.selectedRowIds.size).toBe(0)
  })

  it('click selects a single row', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    expect(result.current.selectedRowIds).toEqual(new Set([1]))
  })

  it('click on the only selected row deselects it', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    expect(result.current.selectedRowIds.size).toBe(0)
  })

  it('Ctrl+Click adds a row to the selection', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    act(() => {
      result.current.handleRowClick(3, 2, makeClickEvent({ ctrlKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([1, 3]))
  })

  it('Meta+Click (Cmd on Mac) adds a row to the selection', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    act(() => {
      result.current.handleRowClick(2, 1, makeClickEvent({ metaKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([1, 2]))
  })

  it('Ctrl+Click on an already-selected row removes it', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    act(() => {
      result.current.handleRowClick(2, 1, makeClickEvent({ ctrlKey: true }))
    })
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent({ ctrlKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([2]))
  })

  it('Shift+Click selects a range from the anchor', () => {
    const rows = makeRows(5)
    const { result } = renderHook(() => useRowSelection(rows))
    // Anchor on row 2 (index 1)
    act(() => {
      result.current.handleRowClick(2, 1, makeClickEvent())
    })
    // Shift-click on row 5 (index 4) → range [1..4]
    act(() => {
      result.current.handleRowClick(5, 4, makeClickEvent({ shiftKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([2, 3, 4, 5]))
  })

  it('Shift+Click extends backwards', () => {
    const rows = makeRows(5)
    const { result } = renderHook(() => useRowSelection(rows))
    // Anchor on row 4 (index 3)
    act(() => {
      result.current.handleRowClick(4, 3, makeClickEvent())
    })
    // Shift-click on row 1 (index 0) → range [0..3]
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent({ shiftKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([1, 2, 3, 4]))
  })

  it('Shift+Ctrl+Click adds range to existing selection', () => {
    const rows = makeRows(5)
    const { result } = renderHook(() => useRowSelection(rows))
    // Select row 1
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
    })
    // Ctrl+Click row 4 to set new anchor without clearing row 1
    act(() => {
      result.current.handleRowClick(4, 3, makeClickEvent({ ctrlKey: true }))
    })
    // Shift+Ctrl+Click row 5 → adds range [3..4] to the existing selection
    act(() => {
      result.current.handleRowClick(5, 4, makeClickEvent({ shiftKey: true, ctrlKey: true }))
    })
    expect(result.current.selectedRowIds).toEqual(new Set([1, 4, 5]))
  })

  it('clearSelection empties the selection', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    act(() => {
      result.current.handleRowClick(1, 0, makeClickEvent())
      result.current.handleRowClick(2, 1, makeClickEvent({ ctrlKey: true }))
    })
    expect(result.current.selectedRowIds.size).toBe(2)
    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedRowIds.size).toBe(0)
  })

  it('Shift+Click without prior anchor uses the clicked row as anchor', () => {
    const rows = makeRows(3)
    const { result } = renderHook(() => useRowSelection(rows))
    // No prior anchor set
    act(() => {
      result.current.handleRowClick(2, 1, makeClickEvent({ shiftKey: true }))
    })
    // Should simply select the clicked row (anchor = -1, range falls back to single click)
    expect(result.current.selectedRowIds.size).toBe(1)
    expect(result.current.selectedRowIds.has(2)).toBe(true)
  })
})
