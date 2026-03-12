import { generateTxf } from '../resources/js/lib/finance/txfExport'
import type { LotSale } from '../resources/js/lib/finance/washSaleEngine'

function makeLot(overrides: Partial<LotSale> = {}): LotSale {
  return {
    description: '100 sh. AAPL',
    symbol: 'AAPL',
    dateAcquired: '2024-01-15',
    dateSold: '2024-06-15',
    proceeds: 17500,
    costBasis: 15000,
    adjustmentCode: '',
    adjustmentAmount: 0,
    gainOrLoss: 2500,
    isShortTerm: true,
    quantity: 100,
    saleTransactionId: 1,
    washPurchaseTransactionId: undefined,
    isWashSale: false,
    originalLoss: 0,
    disallowedLoss: 0,
    isShortSale: false,
    ...overrides,
  }
}

describe('TXF Export', () => {
  describe('generateTxf', () => {
    it('should generate valid TXF header', () => {
      const txf = generateTxf([])
      const lines = txf.split('\r\n')
      expect(lines[0]).toBe('V042')
      expect(lines[1]).toBe('AFinance Tool')
      expect(lines[2]).toMatch(/^D /)
      expect(lines[3]).toBe('^')
    })

    it('should use reference 321 for short-term sales', () => {
      const lot = makeLot({ isShortTerm: true })
      const txf = generateTxf([lot])
      expect(txf).toContain('N321')
    })

    it('should use reference 323 for long-term sales', () => {
      const lot = makeLot({ isShortTerm: false })
      const txf = generateTxf([lot])
      expect(txf).toContain('N323')
    })

    it('should format dates as MM/DD/YYYY', () => {
      const lot = makeLot({ dateAcquired: '2024-01-15', dateSold: '2024-06-15' })
      const txf = generateTxf([lot])
      expect(txf).toContain('D01/15/2024')
      expect(txf).toContain('D06/15/2024')
    })

    it('should use "Various" for null date acquired', () => {
      const lot = makeLot({ dateAcquired: null })
      const txf = generateTxf([lot])
      expect(txf).toContain('DVarious')
    })

    it('should include description', () => {
      const lot = makeLot({ description: '50 sh. TSLA' })
      const txf = generateTxf([lot])
      expect(txf).toContain('P50 sh. TSLA')
    })

    it('should include proceeds and cost basis', () => {
      const lot = makeLot({ proceeds: 17500, costBasis: 15000 })
      const txf = generateTxf([lot])
      expect(txf).toContain('$17500.00')
      expect(txf).toContain('$15000.00')
    })

    it('should include wash sale adjustment when present', () => {
      const lot = makeLot({
        isWashSale: true,
        adjustmentAmount: 500,
        adjustmentCode: 'W',
      })
      const txf = generateTxf([lot])
      expect(txf).toContain('$500.00')
    })

    it('should not include wash sale adjustment when not a wash sale', () => {
      const lot = makeLot({ isWashSale: false, adjustmentAmount: 0 })
      const txf = generateTxf([lot])
      // Should have exactly two $ lines: proceeds and cost basis
      const dollarLines = txf.split('\r\n').filter(l => l.startsWith('$'))
      expect(dollarLines.length).toBe(2)
    })

    it('should end each record with ^', () => {
      const lot = makeLot()
      const txf = generateTxf([lot])
      const lines = txf.split('\r\n').filter(l => l !== '')
      const caretLines = lines.filter(l => l === '^')
      expect(caretLines.length).toBe(2) // header + record
    })

    it('should handle multiple lots', () => {
      const lots = [
        makeLot({ symbol: 'AAPL', isShortTerm: true }),
        makeLot({ symbol: 'GOOG', isShortTerm: false }),
      ]
      const txf = generateTxf(lots)
      expect(txf).toContain('N321')
      expect(txf).toContain('N323')
      expect(txf).toContain('P100 sh. AAPL')
      expect(txf).toContain('P100 sh. AAPL') // description is same for both in makeLot
      // Both records should have their own ^
      const caretCount = txf.split('\r\n').filter(l => l === '^').length
      expect(caretCount).toBe(3) // header + 2 records
    })
  })
})
