import currency from 'currency.js'

import { getShares, isVested, shareValue, todayIso, toLocalIsoDate } from '@/components/rsu/helpers'

describe('rsu/helpers', () => {
  describe('todayIso', () => {
    it('returns a YYYY-MM-DD string for today', () => {
      expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('toLocalIsoDate', () => {
    it('formats a Date using its local calendar components', () => {
      // `new Date(y, mIndex, d, h, m)` builds a Date in the local zone, so the
      // local components are deterministic regardless of the test runner's TZ.
      // June (month index 5) 15 at 23:30 local would shift to June 16 if we
      // used `.toISOString()` in any zone east of UTC — this asserts we don't.
      const d = new Date(2025, 5, 15, 23, 30, 0)
      expect(toLocalIsoDate(d)).toBe('2025-06-15')
    })

    it('zero-pads single-digit months and days', () => {
      expect(toLocalIsoDate(new Date(2025, 0, 3, 12, 0))).toBe('2025-01-03')
    })
  })

  describe('isVested', () => {
    it('treats vest_date strictly before today as vested', () => {
      expect(isVested({ vest_date: '2020-01-01' }, '2025-06-01')).toBe(true)
    })

    it('treats vest_date equal to today as vested', () => {
      expect(isVested({ vest_date: '2025-06-01' }, '2025-06-01')).toBe(true)
    })

    it('treats vest_date after today as not vested', () => {
      expect(isVested({ vest_date: '2030-12-31' }, '2025-06-01')).toBe(false)
    })

    it('treats missing vest_date as not vested', () => {
      expect(isVested({}, '2025-06-01')).toBe(false)
    })
  })

  describe('getShares', () => {
    it('returns number share counts as-is', () => {
      expect(getShares({ share_count: 42 })).toBe(42)
    })

    it('unwraps currency.js share counts via .value', () => {
      expect(getShares({ share_count: currency(7.5) })).toBe(7.5)
    })

    it('coerces numeric-string share counts (decimal cast) to a number', () => {
      expect(getShares({ share_count: '10.125000' })).toBe(10.125)
    })

    it('returns undefined when share_count is missing', () => {
      expect(getShares({})).toBeUndefined()
    })
  })

  describe('shareValue', () => {
    it('multiplies shares × price using currency.js', () => {
      const v = shareValue(10, 4.5)
      expect(v).not.toBeNull()
      expect(v!.value).toBe(45)
    })

    it('returns null when shares is missing', () => {
      expect(shareValue(undefined, 4.5)).toBeNull()
    })

    it('returns null when price is missing', () => {
      expect(shareValue(10, null)).toBeNull()
      expect(shareValue(10, undefined)).toBeNull()
    })
  })
})
