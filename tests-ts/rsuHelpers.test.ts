import { isVested, shareValue } from '@/components/rsu/helpers'

describe('RSU helpers', () => {
  it('treats same-day vesting as vested', () => {
    expect(isVested({ vest_date: '2026-06-09' }, '2026-06-09')).toBe(true)
    expect(isVested({ vest_date: '2026-06-10' }, '2026-06-09')).toBe(false)
  })

  it('uses currency math for fractional share values', () => {
    expect(shareValue(1.25, 10)).toBe(12.5)
  })
})
