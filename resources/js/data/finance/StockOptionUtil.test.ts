import { parseOptionDescription } from './StockOptionUtil'

describe('parseOptionDescription', () => {
  describe('E-Trade CSV format', () => {
    it('should parse NIO Put option', () => {
      const result = parseOptionDescription("NIO Jan 20 '23 $85 Put")
      expect(result).toEqual({
        symbol: 'NIO',
        optionType: 'put',
        maturityDate: '2023-01-20',
        strikePrice: 85,
      })
    })

    it('should parse BIDU Call option', () => {
      const result = parseOptionDescription("BIDU Jan 15 '21 $280 Call")
      expect(result).toEqual({
        symbol: 'BIDU',
        optionType: 'call',
        maturityDate: '2021-01-15',
        strikePrice: 280,
      })
    })

    it('should parse ZM Call option', () => {
      const result = parseOptionDescription("ZM Jan 15 '21 $430 Call")
      expect(result).toEqual({
        symbol: 'ZM',
        optionType: 'call',
        maturityDate: '2021-01-15',
        strikePrice: 430,
      })
    })

    it('should parse TSLA Call option', () => {
      const result = parseOptionDescription("TSLA Mar 19 '21 $1000 Call")
      expect(result).toEqual({
        symbol: 'TSLA',
        optionType: 'call',
        maturityDate: '2021-03-19',
        strikePrice: 1000,
      })
    })

    it('should parse option with single digit day', () => {
      const result = parseOptionDescription("AAPL Jan 5 '24 $150.50 Call")
      expect(result).toEqual({
        symbol: 'AAPL',
        optionType: 'call',
        maturityDate: '2024-01-05',
        strikePrice: 150.5,
      })
    })
  })

  describe('QFX format (Fidelity/E-Trade)', () => {
    it('should parse NVDA Call option', () => {
      const result = parseOptionDescription('CALL NVDA   01/05/24   500.000')
      expect(result).toEqual({
        symbol: 'NVDA',
        optionType: 'call',
        maturityDate: '2024-01-05',
        strikePrice: 500,
      })
    })

    it('should parse ZM Call option with tab', () => {
      const result = parseOptionDescription('CALL ZM\t01/12/24\t75.000')
      expect(result).toEqual({
        symbol: 'ZM',
        optionType: 'call',
        maturityDate: '2024-01-12',
        strikePrice: 75,
      })
    })

    it('should parse PUT option', () => {
      const result = parseOptionDescription('PUT MSFT 02/15/24 $400')
      expect(result).toEqual({
        symbol: 'MSFT',
        optionType: 'put',
        maturityDate: '2024-02-15',
        strikePrice: 400,
      })
    })
  })

  describe('Fidelity option symbol format', () => {
    it('should parse ARKK Call option symbol with dash prefix', () => {
      const result = parseOptionDescription('-ARKK210917C127')
      expect(result).toEqual({
        symbol: 'ARKK',
        optionType: 'call',
        maturityDate: '2021-09-17',
        strikePrice: 127,
      })
    })

    it('should parse option symbol without dash prefix', () => {
      const result = parseOptionDescription('TSLA240315P250')
      expect(result).toEqual({
        symbol: 'TSLA',
        optionType: 'put',
        maturityDate: '2024-03-15',
        strikePrice: 250,
      })
    })

    it('should parse option symbol with decimal strike', () => {
      const result = parseOptionDescription('-NVDA241220C550.5')
      expect(result).toEqual({
        symbol: 'NVDA',
        optionType: 'call',
        maturityDate: '2024-12-20',
        strikePrice: 550.5,
      })
    })
  })

  describe('Fidelity option description format', () => {
    it('should parse CALL description with symbol in parentheses', () => {
      const result = parseOptionDescription('CALL (ARKK) ARK ETF TR SEP 17 21 $127 (100 SHS)')
      expect(result).toEqual({
        symbol: 'ARKK',
        optionType: 'call',
        maturityDate: '2021-09-17',
        strikePrice: 127,
      })
    })

    it('should parse PUT description with symbol in parentheses', () => {
      const result = parseOptionDescription('PUT (TSLA) TESLA INC JAN 15 24 $250 (100 SHS)')
      expect(result).toEqual({
        symbol: 'TSLA',
        optionType: 'put',
        maturityDate: '2024-01-15',
        strikePrice: 250,
      })
    })

    it('should parse description with decimal strike', () => {
      const result = parseOptionDescription('CALL (NVDA) NVIDIA CORP DEC 20 24 $550.50 (100 SHS)')
      expect(result).toEqual({
        symbol: 'NVDA',
        optionType: 'call',
        maturityDate: '2024-12-20',
        strikePrice: 550.5,
      })
    })

    it('should parse description with single digit day', () => {
      const result = parseOptionDescription('CALL (AAPL) APPLE INC JAN 5 24 $150 (100 SHS)')
      expect(result).toEqual({
        symbol: 'AAPL',
        optionType: 'call',
        maturityDate: '2024-01-05',
        strikePrice: 150,
      })
    })
  })

  describe('IB space format', () => {
    it('should parse AMZN Call option', () => {
      const result = parseOptionDescription('AMZN 03OCT25 225 C')
      expect(result).toEqual({
        symbol: 'AMZN',
        optionType: 'call',
        maturityDate: '2025-10-03',
        strikePrice: 225,
      })
    })

    it('should parse TSLA Put option', () => {
      const result = parseOptionDescription('TSLA 15JAN24 470 P')
      expect(result).toEqual({
        symbol: 'TSLA',
        optionType: 'put',
        maturityDate: '2024-01-15',
        strikePrice: 470,
      })
    })

    it('should parse option with decimal strike', () => {
      const result = parseOptionDescription('NVDA 20DEC24 550.5 C')
      expect(result).toEqual({
        symbol: 'NVDA',
        optionType: 'call',
        maturityDate: '2024-12-20',
        strikePrice: 550.5,
      })
    })

    it('should handle lowercase input', () => {
      const result = parseOptionDescription('amzn 03oct25 225 c')
      expect(result).toEqual({
        symbol: 'AMZN',
        optionType: 'call',
        maturityDate: '2025-10-03',
        strikePrice: 225,
      })
    })
  })

  describe('IB compact format', () => {
    it('should parse TSLA Call option', () => {
      const result = parseOptionDescription('TSLA  251024C00470000')
      expect(result).toEqual({
        symbol: 'TSLA',
        optionType: 'call',
        maturityDate: '2025-10-24',
        strikePrice: 470,
      })
    })

    it('should parse AMZN Put option', () => {
      const result = parseOptionDescription('AMZN  241220P00180000')
      expect(result).toEqual({
        symbol: 'AMZN',
        optionType: 'put',
        maturityDate: '2024-12-20',
        strikePrice: 180,
      })
    })

    it('should parse option with decimal strike', () => {
      const result = parseOptionDescription('NVDA  240315C00550500')
      expect(result).toEqual({
        symbol: 'NVDA',
        optionType: 'call',
        maturityDate: '2024-03-15',
        strikePrice: 550.5,
      })
    })
  })

  describe('invalid inputs', () => {
    it('should return null for invalid descriptions', () => {
      const invalidDescriptions = [
        'Invalid Description',
        'NIO Jan 20 $85 Put', // Missing year
        "NIO Jan 20 '23 Put", // Missing strike price
        "NIO Jan 20 '23 $85", // Missing option type
        'TSLA 251024C0047000', // Wrong strike format (7 digits instead of 8)
        'AMZN 03OCT225 C', // Missing year digit
        '', // Empty string
      ]

      invalidDescriptions.forEach((description) => {
        expect(parseOptionDescription(description)).toBeNull()
      })
    })
  })
})
