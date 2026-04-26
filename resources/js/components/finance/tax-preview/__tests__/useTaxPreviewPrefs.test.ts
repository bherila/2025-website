import { act, renderHook } from '@testing-library/react'

import { useTaxPreviewPrefs } from '../useTaxPreviewPrefs'

const STORAGE_KEY = 'taxPreviewPrefs'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useTaxPreviewPrefs', () => {
  it('hydrates with empty defaults when no prefs exist', () => {
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(result.current.recent).toEqual([])
    expect(result.current.pinned).toEqual([])
    expect(result.current.isPinned('form-1040')).toBe(false)
  })

  it('hydrates from existing stored prefs', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pinnedForms: ['form-1040', 'sch-a'],
        recentForms: { '2025': ['sch-b'] },
      }),
    )
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(result.current.pinned).toEqual(['form-1040', 'sch-a'])
    expect(result.current.recent).toEqual(['sch-b'])
    expect(result.current.isPinned('form-1040')).toBe(true)
  })

  it('discards stored prefs with a wrong schema version', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, pinnedForms: ['form-1040'] }))
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(result.current.pinned).toEqual([])
  })

  it('discards corrupt stored prefs', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json')
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(result.current.recent).toEqual([])
    expect(result.current.pinned).toEqual([])
  })

  it('addRecent prepends, dedupes, and caps at 5', () => {
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    act(() => {
      result.current.addRecent('form-1040')
      result.current.addRecent('sch-1')
      result.current.addRecent('sch-2')
      result.current.addRecent('sch-3')
      result.current.addRecent('sch-a')
      result.current.addRecent('sch-b') // pushes form-1040 off
    })
    expect(result.current.recent).toEqual(['sch-b', 'sch-a', 'sch-3', 'sch-2', 'sch-1'])
  })

  it('addRecent moves an existing id to the front', () => {
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    act(() => {
      result.current.addRecent('form-1040')
      result.current.addRecent('sch-1')
      result.current.addRecent('form-1040')
    })
    expect(result.current.recent).toEqual(['form-1040', 'sch-1'])
  })

  it('recent is scoped per year', () => {
    const { result: y2024 } = renderHook(() => useTaxPreviewPrefs(2024))
    act(() => {
      y2024.current.addRecent('sch-a')
    })
    const { result: y2025 } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(y2025.current.recent).toEqual([])
    act(() => {
      y2025.current.addRecent('form-1040')
    })
    const { result: y2024Reloaded } = renderHook(() => useTaxPreviewPrefs(2024))
    expect(y2024Reloaded.current.recent).toEqual(['sch-a'])
  })

  it('togglePin adds and removes an id', () => {
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    act(() => {
      result.current.togglePin('sch-a')
    })
    expect(result.current.pinned).toEqual(['sch-a'])
    act(() => {
      result.current.togglePin('sch-a')
    })
    expect(result.current.pinned).toEqual([])
  })

  it('togglePin persists to localStorage', () => {
    const { result } = renderHook(() => useTaxPreviewPrefs(2025))
    act(() => {
      result.current.togglePin('sch-b')
    })
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.pinnedForms).toEqual(['sch-b'])
  })

  it('clearRecent only clears the active year', () => {
    const { result: y2024 } = renderHook(() => useTaxPreviewPrefs(2024))
    const { result: y2025 } = renderHook(() => useTaxPreviewPrefs(2025))
    act(() => {
      y2024.current.addRecent('sch-a')
      y2025.current.addRecent('form-1040')
    })
    act(() => {
      y2025.current.clearRecent()
    })
    const { result: y2024Reloaded } = renderHook(() => useTaxPreviewPrefs(2024))
    expect(y2024Reloaded.current.recent).toEqual(['sch-a'])
    const { result: y2025Reloaded } = renderHook(() => useTaxPreviewPrefs(2025))
    expect(y2025Reloaded.current.recent).toEqual([])
  })
})
