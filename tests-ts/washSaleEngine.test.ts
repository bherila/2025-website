import {
  analyzeLots,
  computeSummary,
  type LotSale,
  parseTransactions,
} from '@/lib/finance/washSaleEngine'
import type { AccountLineItem } from '@/types/finance/account-line-item'

// Helper to create a minimal AccountLineItem for testing
function tx(overrides: Partial<AccountLineItem> & { t_date: string }): AccountLineItem {
  return {
    t_date: overrides.t_date,
    t_amt: overrides.t_amt,
    t_account_balance: undefined,
    t_price: overrides.t_price,
    t_commission: undefined,
    t_fee: undefined,
    t_id: overrides.t_id,
    t_account: overrides.t_account,
    t_type: overrides.t_type ?? undefined,
    t_symbol: overrides.t_symbol ?? undefined,
    t_qty: overrides.t_qty ?? 0,
    t_description: overrides.t_description ?? undefined,
    opt_type: overrides.opt_type ?? undefined,
    opt_expiration: overrides.opt_expiration ?? undefined,
    t_date_posted: undefined,
    t_schc_category: undefined,
    t_cusip: undefined,
    t_method: undefined,
    t_source: undefined,
    t_origin: undefined,
    opt_strike: undefined,
    t_comment: undefined,
    t_from: undefined,
    t_to: undefined,
    t_interest_rate: undefined,
    t_harvested_amount: undefined,
  } as AccountLineItem
}

describe('washSaleEngine', () => {
  describe('parseTransactions', () => {
    it('should filter out transactions without symbols', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-01-15', t_type: 'Deposit', t_amt: 10000 }), // no symbol
        tx({ t_id: 3, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: -100, t_amt: 14000, t_price: 140 }),
      ]
      const result = parseTransactions(items)
      expect(result).toHaveLength(2)
    })

    it('should filter out transactions without a type', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }), // no type
      ]
      const result = parseTransactions(items)
      expect(result).toHaveLength(0)
    })

    it('should only include buys and sells', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-01-15', t_type: 'Dividend', t_symbol: 'AAPL', t_qty: 0, t_amt: 100 }),
        tx({ t_id: 3, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: -100, t_amt: 14000, t_price: 140 }),
      ]
      const result = parseTransactions(items)
      expect(result).toHaveLength(2)
    })
  })

  describe('analyzeLots - basic gain/loss', () => {
    it('should calculate a simple gain', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.proceeds).toBe(17000)
      expect(results[0]!.costBasis).toBe(15000)
      expect(results[0]!.gainOrLoss).toBe(2000)
      expect(results[0]!.isWashSale).toBe(false)
      expect(results[0]!.adjustmentCode).toBe('')
    })

    it('should calculate a simple loss', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.proceeds).toBe(13000)
      expect(results[0]!.costBasis).toBe(15000)
      expect(results[0]!.gainOrLoss).toBe(-2000)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should determine short-term vs long-term correctly', () => {
      const items = [
        // Short-term: held less than 365 days
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
        // Long-term: held more than 365 days
        tx({ t_id: 3, t_date: '2023-01-15', t_type: 'Buy', t_symbol: 'MSFT', t_qty: 50, t_amt: -10000, t_price: 200 }),
        tx({ t_id: 4, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'MSFT', t_qty: 50, t_amt: 12000, t_price: 240 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(2)

      const aaplSale = results.find(r => r.symbol === 'AAPL')!
      expect(aaplSale.isShortTerm).toBe(true)

      const msftSale = results.find(r => r.symbol === 'MSFT')!
      expect(msftSale.isShortTerm).toBe(false)
    })
  })

  describe('analyzeLots - wash sale detection', () => {
    it('should detect a wash sale when repurchased within 30 days after', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        // Repurchase within 30 days after the sale
        tx({ t_id: 3, t_date: '2024-04-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      const sale = results[0]!
      expect(sale.isWashSale).toBe(true)
      expect(sale.adjustmentCode).toBe('W')
      expect(sale.disallowedLoss).toBeGreaterThan(0)
      // The gain/loss should be adjusted
      expect(sale.gainOrLoss).toBeGreaterThan(sale.proceeds - sale.costBasis)
    })

    it('should detect a wash sale when repurchased within 30 days before', () => {
      const items = [
        // Buy the replacement BEFORE the sale (within 30 days)
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 3, t_date: '2024-03-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      const sale = results[0]!
      expect(sale.isWashSale).toBe(true)
      expect(sale.adjustmentCode).toBe('W')
    })

    it('should NOT detect a wash sale when repurchase is more than 30 days away', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        // Repurchase more than 30 days after
        tx({ t_id: 3, t_date: '2024-05-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should NOT trigger wash sale on a gain', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -14000, t_price: 140 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
      expect(results[0]!.gainOrLoss).toBe(2000)
    })

    it('should NOT trigger wash sale for different symbols', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        // Repurchase of a different symbol
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'MSFT', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should handle the disallowed loss amount correctly', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        // Replacement purchase within 30 days
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      const sale = results[0]!
      expect(sale.isWashSale).toBe(true)
      // Loss is $2000 ($8000 - $10000)
      expect(sale.originalLoss).toBe(-2000)
      // Disallowed loss should be $2000 (full amount since qty matches)
      expect(sale.disallowedLoss).toBe(2000)
      // Adjusted gain/loss: -2000 + 2000 = 0
      expect(sale.gainOrLoss).toBe(0)
    })
  })

  describe('analyzeLots - short sales', () => {
    it('should identify short sales', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Buy to cover', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      // The "Sell short" is the sale
      const shortSale = results.find(r => r.isShortSale)
      expect(shortSale).toBeDefined()
      expect(shortSale!.isShortSale).toBe(true)
    })

    it('should detect wash sales on short sales', () => {
      const items = [
        // Short sell at $150
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 15000, t_price: 150 }),
        // Cover at $160 (loss of $1000)
        tx({ t_id: 2, t_date: '2024-02-01', t_type: 'Buy to cover', t_symbol: 'XYZ', t_qty: 100, t_amt: -16000, t_price: 160 }),
        // Short sell again within 30 days
        tx({ t_id: 3, t_date: '2024-02-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 14000, t_price: 140 }),
      ]
      const results = analyzeLots(items)
      // The first short sale should complete (proceeds $15000)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('analyzeLots - options handling', () => {
    it('should NOT treat options and stock as substantially similar by default', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        // Buy call option within 30 days
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, { includeOptions: false })
      expect(results).toHaveLength(1)
      // Should NOT be a wash sale since options are not substantially similar by default
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should treat options and stock as substantially similar when enabled', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        // Buy call option within 30 days
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, { includeOptions: true })
      expect(results).toHaveLength(1)
      // SHOULD be a wash sale when includeOptions is true
      expect(results[0]!.isWashSale).toBe(true)
    })
  })

  describe('analyzeLots - multiple sales', () => {
    it('should handle multiple sales of the same symbol', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 200, t_amt: -30000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 14000, t_price: 140 }),
        tx({ t_id: 3, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(2)
    })

    it('should handle mixed symbols correctly', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-01-01', t_type: 'Buy', t_symbol: 'MSFT', t_qty: 50, t_amt: -10000, t_price: 200 }),
        tx({ t_id: 3, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
        tx({ t_id: 4, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'MSFT', t_qty: 50, t_amt: 9000, t_price: 180 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(2)

      const aaplSale = results.find(r => r.symbol === 'AAPL')!
      expect(aaplSale.gainOrLoss).toBe(2000)

      const msftSale = results.find(r => r.symbol === 'MSFT')!
      expect(msftSale.gainOrLoss).toBe(-1000)
    })
  })

  describe('analyzeLots - edge cases', () => {
    it('should handle empty input', () => {
      const results = analyzeLots([])
      expect(results).toHaveLength(0)
    })

    it('should handle only buys (no sales)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(0)
    })

    it('should handle only sells (no matching purchases)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      // Without a purchase, cost basis should come from price
      expect(results[0]!.dateAcquired).toBeNull()
    })

    it('should handle wash sale at 30-day boundary (inclusive)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        // Exactly 30 days after March 15 is April 14
        tx({ t_id: 3, t_date: '2024-04-14', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('should NOT trigger wash sale at 31 days', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        // 31 days after March 15 is April 15
        tx({ t_id: 3, t_date: '2024-04-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should handle case-insensitive symbol matching', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'aapl', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-04-01', t_type: 'Buy', t_symbol: 'Aapl', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })
  })

  describe('computeSummary', () => {
    it('should compute correct summary for mixed gains and losses', () => {
      const lots: LotSale[] = [
        {
          description: '100 sh. AAPL',
          symbol: 'AAPL',
          dateAcquired: '2024-01-15',
          dateSold: '2024-06-15',
          proceeds: 17000,
          costBasis: 15000,
          adjustmentCode: '',
          adjustmentAmount: 0,
          gainOrLoss: 2000,
          isShortTerm: true,
          quantity: 100,
          saleTransactionId: 2,
          washPurchaseTransactionId: undefined,
          isWashSale: false,
          originalLoss: 0,
          disallowedLoss: 0,
          isShortSale: false,
        },
        {
          description: '50 sh. MSFT',
          symbol: 'MSFT',
          dateAcquired: '2023-01-15',
          dateSold: '2024-06-15',
          proceeds: 9000,
          costBasis: 10000,
          adjustmentCode: '',
          adjustmentAmount: 0,
          gainOrLoss: -1000,
          isShortTerm: false,
          quantity: 50,
          saleTransactionId: 4,
          washPurchaseTransactionId: undefined,
          isWashSale: false,
          originalLoss: -1000,
          disallowedLoss: 0,
          isShortSale: false,
        },
      ]
      const summary = computeSummary(lots)
      expect(summary.totalSales).toBe(2)
      expect(summary.totalProceeds).toBe(26000)
      expect(summary.totalCostBasis).toBe(25000)
      expect(summary.totalGainLoss).toBe(1000)
      expect(summary.shortTermGain).toBe(2000)
      expect(summary.shortTermLoss).toBe(0)
      expect(summary.longTermGain).toBe(0)
      expect(summary.longTermLoss).toBe(-1000)
      expect(summary.washSaleCount).toBe(0)
    })

    it('should count wash sales correctly', () => {
      const lots: LotSale[] = [
        {
          description: '100 sh. XYZ',
          symbol: 'XYZ',
          dateAcquired: '2024-01-15',
          dateSold: '2024-02-15',
          proceeds: 8000,
          costBasis: 10000,
          adjustmentCode: 'W',
          adjustmentAmount: 2000,
          gainOrLoss: 0,
          isShortTerm: true,
          quantity: 100,
          saleTransactionId: 2,
          washPurchaseTransactionId: 3,
          isWashSale: true,
          originalLoss: -2000,
          disallowedLoss: 2000,
          isShortSale: false,
        },
      ]
      const summary = computeSummary(lots)
      expect(summary.washSaleCount).toBe(1)
      expect(summary.totalWashSaleDisallowed).toBe(2000)
    })

    it('should handle empty lots array', () => {
      const summary = computeSummary([])
      expect(summary.totalSales).toBe(0)
      expect(summary.totalGainLoss).toBe(0)
    })
  })

  describe('analyzeLots - reinvestment types', () => {
    it('should treat reinvest as a buy', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Reinvest', t_symbol: 'VOO', t_qty: 10, t_amt: -3000, t_price: 300 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'VOO', t_qty: 10, t_amt: 2800, t_price: 280 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Reinvest', t_symbol: 'VOO', t_qty: 10, t_amt: -2900, t_price: 290 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      // Loss should be detected and wash sale triggered by the reinvest
      expect(results[0]!.isWashSale).toBe(true)
    })
  })
})
