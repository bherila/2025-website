import { act, renderHook } from '@testing-library/react'

import { useTaxRoute } from '../useTaxRoute'

describe('useTaxRoute', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('reads the initial hash on mount', () => {
    window.location.hash = '#/form-1040/sch-1'
    const { result } = renderHook(() => useTaxRoute())
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])
  })

  it('starts empty when hash is missing', () => {
    const { result } = renderHook(() => useTaxRoute())
    expect(result.current.route.columns).toEqual([])
  })

  it('pushColumn appends to the route and updates the hash', () => {
    const { result } = renderHook(() => useTaxRoute())
    act(() => {
      result.current.pushColumn({ form: 'form-1040' })
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }])
    expect(window.location.hash).toBe('#/form-1040')

    act(() => {
      result.current.pushColumn({ form: 'sch-1' })
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])
    expect(window.location.hash).toBe('#/form-1040/sch-1')
  })

  it('replaceFrom drops columns to the right of the replaced depth', () => {
    window.location.hash = '#/form-1040/sch-1/form-1116'
    const { result } = renderHook(() => useTaxRoute())

    act(() => {
      result.current.replaceFrom(1, { form: 'sch-2' })
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-2' }])
    expect(window.location.hash).toBe('#/form-1040/sch-2')
  })

  it('truncateTo keeps the first N columns', () => {
    window.location.hash = '#/form-1040/sch-1/form-1116'
    const { result } = renderHook(() => useTaxRoute())

    act(() => {
      result.current.truncateTo(1)
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }])
    expect(window.location.hash).toBe('#/form-1040')
  })

  it('truncateTo(0) clears the hash', () => {
    window.location.hash = '#/form-1040/sch-1'
    const { result } = renderHook(() => useTaxRoute())

    act(() => {
      result.current.truncateTo(0)
    })
    expect(result.current.route.columns).toEqual([])
    expect(window.location.hash).toBe('')
  })

  it('navigate replaces the entire route', () => {
    const { result } = renderHook(() => useTaxRoute())
    act(() => {
      result.current.navigate({
        columns: [{ form: 'form-1040' }, { form: 'form-1116', instance: 'passive' }],
      })
    })
    expect(window.location.hash).toBe('#/form-1040/form-1116:passive')
  })

  it('responds to external hashchange events (browser back/forward)', () => {
    const { result } = renderHook(() => useTaxRoute())

    act(() => {
      window.location.hash = '#/form-1040/sch-1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])

    act(() => {
      window.location.hash = '#/form-1040'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }])
  })

  it('drops unknown form ids from external hash mutations', () => {
    const { result } = renderHook(() => useTaxRoute())
    act(() => {
      window.location.hash = '#/form-1040/totally-fake/sch-1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.route.columns).toEqual([{ form: 'form-1040' }, { form: 'sch-1' }])
  })

  it('preserves instance keys through push and replace', () => {
    const { result } = renderHook(() => useTaxRoute())

    act(() => {
      result.current.pushColumn({ form: 'form-1040' })
    })
    act(() => {
      result.current.pushColumn({ form: 'form-1116', instance: 'passive' })
    })
    expect(window.location.hash).toBe('#/form-1040/form-1116:passive')

    act(() => {
      result.current.replaceFrom(1, { form: 'form-1116', instance: 'general' })
    })
    expect(window.location.hash).toBe('#/form-1040/form-1116:general')
  })
})
