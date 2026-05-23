import { buildRsuChartData } from '@/components/rsu/RsuChart'
import type { IAward } from '@/types/finance'

describe('RsuChart', () => {
  it('builds chart rows in chronological vest-date order', () => {
    const awards: IAward[] = [
      { award_id: 'A2', vest_date: '2026-01-01', share_count: 2, symbol: 'X' },
      { award_id: 'A1', vest_date: '2025-01-01', share_count: 1, symbol: 'X' },
    ]

    const { dataSource } = buildRsuChartData(awards, 'shares')

    expect(dataSource.map((row) => row.vest_date)).toEqual(['2025-01-01', '2026-01-01'])
  })

  it('uses the most recent prior vest price as the value fallback per symbol', () => {
    const awards: IAward[] = [
      { award_id: 'future', vest_date: '2026-01-01', share_count: 3, symbol: 'X', vest_price: 100 },
      { award_id: 'first', vest_date: '2024-01-01', share_count: 2, symbol: 'X', vest_price: 10 },
      { award_id: 'second', vest_date: '2025-01-01', share_count: 4, symbol: 'X' },
    ]

    const { dataSource } = buildRsuChartData(awards, 'value')

    expect(dataSource).toEqual([
      { vest_date: '2024-01-01', first: 20 },
      { vest_date: '2025-01-01', second: 40 },
      { vest_date: '2026-01-01', future: 300 },
    ])
  })
})
