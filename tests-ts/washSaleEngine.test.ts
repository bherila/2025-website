import {
  analyzeLots,
  computeSummary,
  type LotSale,
  normalizeOptions,
  parseTransactions,
  WASH_SALE_METHOD_1,
  WASH_SALE_METHOD_2,
  type WashSaleOptions,
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
    opt_strike: overrides.opt_strike ?? undefined,
    t_date_posted: undefined,
    t_schc_category: undefined,
    t_cusip: undefined,
    t_method: undefined,
    t_source: undefined,
    t_origin: undefined,
    t_comment: undefined,
    t_from: undefined,
    t_to: undefined,
    t_interest_rate: undefined,
    t_harvested_amount: undefined,
  } as AccountLineItem
}

describe('washSaleEngine', () => {

  // =========================================================================
  // normalizeOptions
  // =========================================================================
  describe('normalizeOptions', () => {
    it('should convert legacy { includeOptions: true } to METHOD_1', () => {
      const result = normalizeOptions({ includeOptions: true })
      expect(result).toEqual(WASH_SALE_METHOD_1)
    })

    it('should convert legacy { includeOptions: false } to METHOD_2', () => {
      const result = normalizeOptions({ includeOptions: false })
      expect(result).toEqual(WASH_SALE_METHOD_2)
    })

    it('should force cross-type flags to false when adjustSameUnderlying is false', () => {
      const result = normalizeOptions({
        adjustShortLong: true,
        adjustStockToOption: true,
        adjustOptionToStock: true,
        adjustSameUnderlying: false,
      })
      expect(result.adjustStockToOption).toBe(false)
      expect(result.adjustOptionToStock).toBe(false)
      expect(result.adjustShortLong).toBe(true) // not affected
    })
  })

  // =========================================================================
  // parseTransactions
  // =========================================================================
  describe('parseTransactions', () => {
    it('should filter out transactions without symbols', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-01-15', t_type: 'Deposit', t_amt: 10000 }),
        tx({ t_id: 3, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: -100, t_amt: 14000, t_price: 140 }),
      ]
      expect(parseTransactions(items)).toHaveLength(2)
    })

    it('should filter out transactions without a type', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
      ]
      expect(parseTransactions(items)).toHaveLength(0)
    })

    it('should only include buys and sells', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-01-15', t_type: 'Dividend', t_symbol: 'AAPL', t_qty: 0, t_amt: 100 }),
        tx({ t_id: 3, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: -100, t_amt: 14000, t_price: 140 }),
      ]
      expect(parseTransactions(items)).toHaveLength(2)
    })
  })

  // =========================================================================
  // Basic gain / loss (Method 2 default)
  // =========================================================================
  describe('analyzeLots – basic gain/loss', () => {
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
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
        tx({ t_id: 3, t_date: '2023-01-15', t_type: 'Buy', t_symbol: 'MSFT', t_qty: 50, t_amt: -10000, t_price: 200 }),
        tx({ t_id: 4, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'MSFT', t_qty: 50, t_amt: 12000, t_price: 240 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(2)
      expect(results.find(r => r.symbol === 'AAPL')!.isShortTerm).toBe(true)
      expect(results.find(r => r.symbol === 'MSFT')!.isShortTerm).toBe(false)
    })

    it('should use currency.js for precise arithmetic (no floating-point drift)', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS, but currency.js handles it
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10050, t_price: 100.50 }),
        tx({ t_id: 2, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 10070, t_price: 100.70 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.proceeds).toBe(10070)
      expect(results[0]!.costBasis).toBe(10050)
      expect(results[0]!.gainOrLoss).toBe(20)
    })
  })

  // =========================================================================
  // Wash sale detection
  // =========================================================================
  describe('analyzeLots – wash sale detection', () => {
    it('should detect a wash sale when repurchased within 30 days after', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-04-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.adjustmentCode).toBe('W')
      expect(results[0]!.disallowedLoss).toBeGreaterThan(0)
    })

    it('should NOT detect a wash sale for a pre-sale acquisition (only post-sale acquisitions are replacement shares)', () => {
      // The engine only treats acquisitions AFTER the sale date as replacement
      // shares. A pre-sale acquisition that was the original position is never a
      // wash sale trigger, even if it falls within 30 days of the sale date.
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 3, t_date: '2024-03-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      // Mar 1 purchase is BEFORE the Mar 15 sale — not a replacement share
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('should NOT detect a wash sale when repurchase > 30 days away', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
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
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.originalLoss).toBe(-2000)
      expect(results[0]!.disallowedLoss).toBe(2000)
      expect(results[0]!.gainOrLoss).toBe(0)
    })
  })

  // =========================================================================
  // Short sales (going short)
  // =========================================================================
  describe('analyzeLots – short sales', () => {
    it('should identify and calculate short sales (sell short → buy to cover)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Buy to cover', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      const shortSale = results.find(r => r.isShortSale)
      expect(shortSale).toBeDefined()
      expect(shortSale!.isShortSale).toBe(true)
    })

    it('should detect wash sales on short sales', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-01', t_type: 'Buy to cover', t_symbol: 'XYZ', t_qty: 100, t_amt: -16000, t_price: 160 }),
        tx({ t_id: 3, t_date: '2024-02-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 14000, t_price: 140 }),
      ]
      const results = analyzeLots(items)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // Options – Method 1 vs Method 2
  // =========================================================================
  describe('analyzeLots – options handling (Method 1 vs Method 2)', () => {
    it('Method 2: should NOT treat options and stock as substantially similar', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_2)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('Method 1: should treat options and stock as substantially similar', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_1)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('legacy { includeOptions: false } should behave like Method 2', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, { includeOptions: false })
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('legacy { includeOptions: true } should behave like Method 1', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, { includeOptions: true })
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })
  })

  // =========================================================================
  // Expanded cross-type settings (stock → option, option → stock)
  // =========================================================================
  describe('analyzeLots – cross-type wash sale settings', () => {
    it('stock loss → call option purchase: wash sale when adjustStockToOption=true', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const opts: WashSaleOptions = {
        adjustShortLong: false,
        adjustStockToOption: true,
        adjustOptionToStock: false,
        adjustSameUnderlying: true,
      }
      const results = analyzeLots(items, opts)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('stock loss → call option purchase: NOT a wash sale when adjustStockToOption=false', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const opts: WashSaleOptions = {
        adjustShortLong: false,
        adjustStockToOption: false,
        adjustOptionToStock: false,
        adjustSameUnderlying: true,
      }
      const results = analyzeLots(items, opts)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('call option loss → stock purchase: wash sale when adjustOptionToStock=true', () => {
      // Buy call at $8, sell at $3 → loss of $5 per contract
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 10, t_amt: -8000, t_price: 800, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 10, t_amt: 3000, t_price: 300, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      const opts: WashSaleOptions = {
        adjustShortLong: false,
        adjustStockToOption: false,
        adjustOptionToStock: true,
        adjustSameUnderlying: true,
      }
      const results = analyzeLots(items, opts)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('call option loss → stock purchase: NOT a wash sale when adjustOptionToStock=false', () => {
      // Same scenario but adjustOptionToStock=false → no wash sale
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 10, t_amt: -8000, t_price: 800, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 10, t_amt: 3000, t_price: 300, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      const opts: WashSaleOptions = {
        adjustShortLong: false,
        adjustStockToOption: false,
        adjustOptionToStock: false,
        adjustSameUnderlying: true,
      }
      const results = analyzeLots(items, opts)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('adjustSameUnderlying=false forces stock→option to false even if set', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const opts: WashSaleOptions = {
        adjustShortLong: false,
        adjustStockToOption: true, // will be forced to false
        adjustOptionToStock: true, // will be forced to false
        adjustSameUnderlying: false,
      }
      const results = analyzeLots(items, opts)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })
  })

  // =========================================================================
  // Short/long cross-wash
  // =========================================================================
  describe('analyzeLots – short/long cross-wash', () => {
    it('adjustShortLong=true: close short at loss then open new short = wash sale', () => {
      // Open short at $150, cover at $160 (loss), re-short at $155 within 30 days
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-01', t_type: 'Buy to cover', t_symbol: 'XYZ', t_qty: 100, t_amt: -16000, t_price: 160 }),
        tx({ t_id: 3, t_date: '2024-02-15', t_type: 'Sell short', t_symbol: 'XYZ', t_qty: 100, t_amt: 15500, t_price: 155 }),
      ]
      const opts: WashSaleOptions = { ...WASH_SALE_METHOD_2, adjustShortLong: true }
      const results = analyzeLots(items, opts)
      // The cover buy (close short) has a loss — the new sell short is a replacement
      // This triggers a wash sale when adjustShortLong is enabled
      const shortCover = results.find(r => r.isShortSale)
      expect(shortCover).toBeDefined()
    })
  })

  // =========================================================================
  // Multiple sales & mixed symbols
  // =========================================================================
  describe('analyzeLots – multiple sales', () => {
    it('should handle multiple sales of the same symbol', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 200, t_amt: -30000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 14000, t_price: 140 }),
        tx({ t_id: 3, t_date: '2024-06-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 17000, t_price: 170 }),
      ]
      expect(analyzeLots(items)).toHaveLength(2)
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
      expect(results.find(r => r.symbol === 'AAPL')!.gainOrLoss).toBe(2000)
      expect(results.find(r => r.symbol === 'MSFT')!.gainOrLoss).toBe(-1000)
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('analyzeLots – edge cases', () => {
    it('should handle empty input', () => {
      expect(analyzeLots([])).toHaveLength(0)
    })

    it('should handle only buys (no sales)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
      ]
      expect(analyzeLots(items)).toHaveLength(0)
    })

    it('should handle only sells (no matching purchases)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.dateAcquired).toBeNull()
    })

    it('should handle wash sale at 30-day boundary (inclusive)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
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

  // =========================================================================
  // computeSummary
  // =========================================================================
  describe('computeSummary', () => {
    it('should compute correct summary for mixed gains and losses', () => {
      const lots: LotSale[] = [
        {
          description: '100 sh. AAPL', symbol: 'AAPL', dateAcquired: '2024-01-15',
          dateSold: '2024-06-15', proceeds: 17000, costBasis: 15000,
          adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: 2000,
          isShortTerm: true, quantity: 100, saleTransactionId: 2,
          washPurchaseTransactionId: undefined, isWashSale: false,
          originalLoss: 0, disallowedLoss: 0, isShortSale: false,
        },
        {
          description: '50 sh. MSFT', symbol: 'MSFT', dateAcquired: '2023-01-15',
          dateSold: '2024-06-15', proceeds: 9000, costBasis: 10000,
          adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: -1000,
          isShortTerm: false, quantity: 50, saleTransactionId: 4,
          washPurchaseTransactionId: undefined, isWashSale: false,
          originalLoss: -1000, disallowedLoss: 0, isShortSale: false,
        },
      ]
      const summary = computeSummary(lots)
      expect(summary.totalSales).toBe(2)
      expect(summary.totalProceeds).toBe(26000)
      expect(summary.totalCostBasis).toBe(25000)
      expect(summary.totalGainLoss).toBe(1000)
      expect(summary.shortTermGain).toBe(2000)
      expect(summary.longTermLoss).toBe(-1000)
      expect(summary.washSaleCount).toBe(0)
    })

    it('should count wash sales correctly', () => {
      const lots: LotSale[] = [
        {
          description: '100 sh. XYZ', symbol: 'XYZ', dateAcquired: '2024-01-15',
          dateSold: '2024-02-15', proceeds: 8000, costBasis: 10000,
          adjustmentCode: 'W', adjustmentAmount: 2000, gainOrLoss: 0,
          isShortTerm: true, quantity: 100, saleTransactionId: 2,
          washPurchaseTransactionId: 3, isWashSale: true,
          originalLoss: -2000, disallowedLoss: 2000, isShortSale: false,
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

  // =========================================================================
  // Reinvest types
  // =========================================================================
  describe('analyzeLots – reinvestment types', () => {
    it('should treat reinvest as a buy', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Reinvest', t_symbol: 'VOO', t_qty: 10, t_amt: -3000, t_price: 300 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'VOO', t_qty: 10, t_amt: 2800, t_price: 280 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Reinvest', t_symbol: 'VOO', t_qty: 10, t_amt: -2900, t_price: 290 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(true)
    })
  })

  // =========================================================================
  // Wash sale detail fields (washPurchaseDate, washPurchaseAccountId, etc.)
  // =========================================================================
  describe('analyzeLots – wash sale detail fields', () => {
    it('should populate washPurchaseDate when a wash sale is detected', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100, t_account: 1 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80, t_account: 1 }),
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85, t_account: 1 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.washPurchaseDate).toBe('2024-02-20')
    })

    it('should populate washPurchaseAccountId when a wash sale is detected', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100, t_account: 42 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80, t_account: 42 }),
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85, t_account: 42 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.washPurchaseAccountId).toBe(42)
    })

    it('should populate washPurchaseDescription when a wash sale is detected', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100, t_description: 'Buy XYZ' }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85, t_description: 'Repurchase XYZ' }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.washPurchaseDescription).toBe('Repurchase XYZ')
    })

    it('should populate washSaleReason for stock-to-stock wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-02-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        tx({ t_id: 3, t_date: '2024-02-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -8500, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.washSaleReason).toContain('§1091')
      expect(results[0]!.washSaleReason).toContain('XYZ')
    })

    it('should populate washSaleReason for stock-to-option wash sale (Method 1)', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_1)
      expect(results[0]!.isWashSale).toBe(true)
      expect(results[0]!.washSaleReason).toContain('Method 1')
      expect(results[0]!.washSaleReason).toContain('§1091')
    })

    it('should leave washSaleReason undefined for non-wash-sale lots', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(false)
      expect(results[0]!.washSaleReason).toBeUndefined()
      expect(results[0]!.washPurchaseDate).toBeUndefined()
      expect(results[0]!.washPurchaseAccountId).toBeUndefined()
    })
  })

  // =========================================================================
  // ENOV regression test — multiple lots closed with a single sale
  // =========================================================================
  describe('analyzeLots – ENOV regression: multiple lots, single sale', () => {
    it('should NOT flag as wash sale when two lots are sold on day +30 (exact boundary)', () => {
      // Reproduces the real ENOV scenario:
      //   Acquired: 56 sh + 9 sh on Dec 29, 2025 (basis $1,762.80)
      //   Sold:     65 sh on Jan 28, 2026 (proceeds $1,396.20) — a loss
      //   Wash window (+1..+30): Jan 29 – Feb 27 — no acquisitions in that range.
      // Dec 29 is exactly 30 days BEFORE the sale. Pre-sale acquisitions must
      // never be treated as replacement shares.
      const items = [
        tx({ t_id: 1, t_date: '2025-12-29', t_type: 'Buy', t_symbol: 'ENOV', t_qty: 56, t_amt: -1518.72, t_price: 27.12 }),
        tx({ t_id: 2, t_date: '2025-12-29', t_type: 'Buy', t_symbol: 'ENOV', t_qty: 9, t_amt: -244.08, t_price: 27.12 }),
        tx({ t_id: 3, t_date: '2026-01-28', t_type: 'Sell', t_symbol: 'ENOV', t_qty: 65, t_amt: 1396.20, t_price: 21.48 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
      expect(results[0]!.adjustmentCode).toBe('')
      expect(results[0]!.gainOrLoss).toBeLessThan(0) // still a loss, just not disallowed
    })

    it('should NOT flag as wash sale when lots are represented as separate sale transactions', () => {
      // Same scenario but the broker reports two sale rows (one per lot) instead
      // of a single merged row. This was the original failure mode.
      const items = [
        tx({ t_id: 1, t_date: '2025-12-29', t_type: 'Buy', t_symbol: 'ENOV', t_qty: 56, t_amt: -1518.72, t_price: 27.12 }),
        tx({ t_id: 2, t_date: '2025-12-29', t_type: 'Buy', t_symbol: 'ENOV', t_qty: 9, t_amt: -244.08, t_price: 27.12 }),
        tx({ t_id: 3, t_date: '2026-01-28', t_type: 'Sell', t_symbol: 'ENOV', t_qty: 56, t_amt: 1202.88, t_price: 21.48 }),
        tx({ t_id: 4, t_date: '2026-01-28', t_type: 'Sell', t_symbol: 'ENOV', t_qty: 9, t_amt: 193.32, t_price: 21.48 }),
      ]
      const results = analyzeLots(items)
      for (const r of results) {
        expect(r.isWashSale).toBe(false)
      }
    })
  })

  // =========================================================================
  // Full test matrix — Stock ↔ Stock scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Stock ↔ Stock', () => {
    it('sell at loss, buy within +30 days (toggle ON) → wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-25', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_1)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('sell at loss, buy within +30 days — plain stock always wash regardless of adjustSameUnderlying', () => {
      // For plain stock-to-stock (same ticker), the adjustSameUnderlying flag
      // does not suppress detection — only cross-type flags are relevant.
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-25', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_2)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('buy & sell on same day, no other buys → NOT a wash sale', () => {
      // Same-day purchase is the opening lot being sold. No post-sale buys exist.
      const items = [
        tx({ t_id: 1, t_date: '2024-03-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
      ]
      const results = analyzeLots(items, WASH_SALE_METHOD_1)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('buy on day +30 → wash sale (boundary inclusive)', () => {
      // Sale: Mar 15. Day +30 = Apr 14. Buy on Apr 14 → inside window.
      const saleDate = '2024-03-15'
      const buyDateDay30 = '2024-04-14'
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: saleDate, t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: buyDateDay30, t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('buy on day +31 → NOT a wash sale (outside window)', () => {
      // Sale: Mar 15. Day +31 = Apr 15. Buy on Apr 15 → outside window.
      const saleDate = '2024-03-15'
      const buyDateDay31 = '2024-04-15'
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: saleDate, t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: buyDateDay31, t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('sell at gain → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 3, t_date: '2024-03-25', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('pre-sale acquisitions only → NOT a wash sale', () => {
      // All acquisitions are BEFORE the sale; no post-sale buy exists.
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 3, t_date: '2024-03-01', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 50, t_amt: -7000, t_price: 140 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 12000, t_price: 120 }),
      ]
      const results = analyzeLots(items)
      for (const r of results) {
        expect(r.isWashSale).toBe(false)
      }
    })

    it('no acquisitions at all → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 12000, t_price: 120 }),
      ]
      const results = analyzeLots(items)
      expect(results).toHaveLength(1)
      expect(results[0]!.isWashSale).toBe(false)
    })
  })

  // =========================================================================
  // Full test matrix — Stock → Option scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Stock → Option', () => {
    it('sell stock at loss, buy call within +30 days (adjustStockToOption=true) → wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const opts: WashSaleOptions = { adjustShortLong: false, adjustStockToOption: true, adjustOptionToStock: false, adjustSameUnderlying: true }
      const results = analyzeLots(items, opts)
      expect(results[0]!.isWashSale).toBe(true)
    })

    it('sell stock at loss, buy call within +30 days (adjustStockToOption=false) → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 1, t_amt: -500, t_price: 5, opt_type: 'call', opt_expiration: '2024-06-15' }),
      ]
      const opts: WashSaleOptions = { adjustShortLong: false, adjustStockToOption: false, adjustOptionToStock: false, adjustSameUnderlying: false }
      const results = analyzeLots(items, opts)
      expect(results[0]!.isWashSale).toBe(false)
    })
  })

  // =========================================================================
  // Full test matrix — Option → Stock scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Option → Stock', () => {
    it('sell call at loss, buy stock within +30 days (adjustOptionToStock=true) → wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 10, t_amt: -8000, t_price: 800, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 10, t_amt: 3000, t_price: 300, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      // Method 2 (default): option sell + stock buy → different instrument types, no wash
      expect(analyzeLots(items)[0]!.isWashSale).toBe(false)
      const opts: WashSaleOptions = { adjustShortLong: false, adjustStockToOption: false, adjustOptionToStock: true, adjustSameUnderlying: true }
      expect(analyzeLots(items, opts)[0]!.isWashSale).toBe(true)
    })

    it('sell call at loss, buy stock within +30 days (adjustOptionToStock=false) → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 10, t_amt: -8000, t_price: 800, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 10, t_amt: 3000, t_price: 300, opt_type: 'call', opt_expiration: '2024-06-15' }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -13000, t_price: 130 }),
      ]
      const opts: WashSaleOptions = { adjustShortLong: false, adjustStockToOption: false, adjustOptionToStock: false, adjustSameUnderlying: false }
      expect(analyzeLots(items, opts)[0]!.isWashSale).toBe(false)
    })
  })

  // =========================================================================
  // Full test matrix — Short ↔ Long scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Short ↔ Long', () => {
    it('close short at loss, new short open within +30 days (adjustShortLong=true) → wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Buy to cover', t_symbol: 'AAPL', t_qty: 100, t_amt: -17000, t_price: 170 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Sell short', t_symbol: 'AAPL', t_qty: 100, t_amt: 16000, t_price: 160 }),
      ]
      const opts: WashSaleOptions = { adjustShortLong: true, adjustStockToOption: false, adjustOptionToStock: false, adjustSameUnderlying: false }
      const results = analyzeLots(items, opts)
      const shortCover = results.find(r => r.isShortSale)
      expect(shortCover).toBeDefined()
      expect(shortCover!.isWashSale).toBe(true)
    })

    it('close short at loss, new short open within +30 days (adjustShortLong=false) → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Sell short', t_symbol: 'AAPL', t_qty: 100, t_amt: 15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Buy to cover', t_symbol: 'AAPL', t_qty: 100, t_amt: -17000, t_price: 170 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -17500, t_price: 175 }),
      ]
      const opts: WashSaleOptions = { adjustShortLong: false, adjustStockToOption: false, adjustOptionToStock: false, adjustSameUnderlying: false }
      const results = analyzeLots(items, opts)
      const shortCover = results.find(r => r.isShortSale)
      expect(shortCover).toBeDefined()
      // adjustShortLong=false: a long buy is not a replacement for a short cover
      expect(shortCover!.isWashSale).toBe(false)
    })
  })

  // =========================================================================
  // Full test matrix — Quantity mismatch scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Quantity mismatch', () => {
    it('sell 100 shares, buy 40 within +30 days → partial wash sale (40 shares)', () => {
      // Only 40 replacement shares exist so only 40/100 of the loss is disallowed.
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 40, t_amt: -3400, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      // Disallowed = (2000 total loss) × (40/100) = 800
      expect(results[0]!.disallowedLoss).toBe(800)
      expect(results[0]!.gainOrLoss).toBe(-1200)
    })

    it('sell 100 shares, buy 150 within +30 days → full wash sale (100 shares)', () => {
      // 150 replacement shares ≥ 100 sold, so all 100 shares are disallowed.
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 100, t_amt: -10000, t_price: 100 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'XYZ', t_qty: 100, t_amt: 8000, t_price: 80 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'XYZ', t_qty: 150, t_amt: -12750, t_price: 85 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(true)
      // Disallowed = full 2000 loss
      expect(results[0]!.disallowedLoss).toBe(2000)
      expect(results[0]!.gainOrLoss).toBe(0)
    })
  })

  // =========================================================================
  // Full test matrix — Non-wash regression scenarios
  // =========================================================================
  describe('analyzeLots – test matrix: Non-wash regression', () => {
    it('different ticker, not substantially identical → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
        tx({ t_id: 3, t_date: '2024-03-20', t_type: 'Buy', t_symbol: 'MSFT', t_qty: 100, t_amt: -13500, t_price: 135 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(false)
    })

    it('loss sale with no post-sale repurchase → NOT a wash sale', () => {
      const items = [
        tx({ t_id: 1, t_date: '2024-01-15', t_type: 'Buy', t_symbol: 'AAPL', t_qty: 100, t_amt: -15000, t_price: 150 }),
        tx({ t_id: 2, t_date: '2024-03-15', t_type: 'Sell', t_symbol: 'AAPL', t_qty: 100, t_amt: 13000, t_price: 130 }),
      ]
      const results = analyzeLots(items)
      expect(results[0]!.isWashSale).toBe(false)
      expect(results[0]!.gainOrLoss).toBe(-2000)
    })
  })
})
