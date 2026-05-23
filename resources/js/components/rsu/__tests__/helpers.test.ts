import currency from 'currency.js'

import { getShares, isVested, shareValue, todayIso } from '@/components/rsu/helpers'

describe('rsu/helpers', () => {
  describe('todayIso', () => {
    it('returns a YYYY-MM-DD string for today', () => {
      const s = todayIso()
      expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('isVested', () => {
    it('treats vest_date strictly before today as vested', () => {
      expect(isVested({ vest_date: '2020-01-01' }, '2025-06-01')).toBe(true)
    })

    it('treats vest_date equal to today as not vested (future/current vest)', () => {
      expect(isVested({ vest_date: '2025-06-01' }, '2025-06-01')).toBe(false)
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
