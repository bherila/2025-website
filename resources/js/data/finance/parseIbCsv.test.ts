import { parseIbCsv, parseIbCsvTrades, isIbCsvFormat } from './parseIbCsv'
import { parseMultiSectionCsv, getSectionNames } from '@/lib/multiCsvParser'

describe('parseIbCsv function', () => {
  describe('multiCsvParser', () => {
    const sampleMultiCsv = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers LLC
Statement,Data,Period,"September 1, 2025 - September 30, 2025"
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,BIDU,"2025-09-05, 16:20:00",-100,100,108.65,10000,0,-10000,0,-865,A;O
Trades,Data,Order,Stocks,USD,BIDU,"2025-09-12, 13:46:54",100,114.34,114.78,-11434,-0.7329784,10014.850878,-1419.8821,44,C
Trades,SubTotal,,Stocks,USD,BIDU,,0,,,-1434,-0.7329784,14.850878,-1419.8821,-821,
Trades,Total,,Stocks,USD,,,,,,-1434,-0.7329784,14.850878,-1419.8821,-821,
Interest,Header,Currency,Date,Description,Amount
Interest,Data,SGD,2025-09-04,SGD Credit Interest for Aug-2025,31.51
Interest,Data,Total,,,31.51
Interest,Data,USD,2025-09-04,USD Credit Interest for Aug-2025,4.44
Fees,Header,Subtitle,Currency,Date,Description,Amount
Fees,Data,Other Fees,USD,2025-09-03,Market Data Fee,-10
Fees,Data,Total,,,,0`

    it('parses multi-section CSV into sections', () => {
      const result = parseMultiSectionCsv(sampleMultiCsv)
      const sections = getSectionNames(result)

      expect(sections).toContain('Statement')
      expect(sections).toContain('Trades')
      expect(sections).toContain('Interest')
      expect(sections).toContain('Fees')
    })

    it('parses Statement section data rows', () => {
      const result = parseMultiSectionCsv(sampleMultiCsv)
      const statement = result.sections['Statement']

      expect(statement).toBeDefined()
      expect(statement?.rows.length).toBe(2)
      expect(statement?.rows[0]).toMatchObject({
        'Field Name': 'BrokerName',
        'Field Value': 'Interactive Brokers LLC',
      })
    })

    it('parses Trades section with headers and data', () => {
      const result = parseMultiSectionCsv(sampleMultiCsv)
      const trades = result.sections['Trades']

      expect(trades).toBeDefined()
      expect(trades?.headers).toContain('Symbol')
      expect(trades?.headers).toContain('Date/Time')
      expect(trades?.rows.length).toBe(2) // Only Order rows, not SubTotal/Total
    })

    it('parses SubTotals and Totals separately', () => {
      const result = parseMultiSectionCsv(sampleMultiCsv)
      const trades = result.sections['Trades']

      expect(trades?.subTotals.length).toBe(1)
      expect(trades?.totals.length).toBe(1)
    })
  })

  describe('parseIbCsv trades parsing', () => {
    const tradesCsv = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers LLC
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,BIDU,"2025-09-05, 16:20:00",-100,100,108.65,10000,0,-10000,0,-865,A;O
Trades,Data,Order,Stocks,USD,AAPL,"2025-09-10, 10:30:00",50,175.50,175.00,-8775,-0.50,8775.50,0,-25,O
Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,Security ID,Underlying,Listing Exch,Multiplier,Type,Code
Financial Instrument Information,Data,Stocks,BIDU,BAIDU INC - SPON ADR,35359385,US0567521085,BIDU,NASDAQ,1,ADR,
Financial Instrument Information,Data,Stocks,AAPL,APPLE INC,265598,US0378331005,AAPL,NASDAQ,1,COMMON,`

    it('parses stock trades correctly', () => {
      const result = parseIbCsv(tradesCsv)

      expect(result.trades.length).toBe(2)
    })

    it('extracts trade date correctly from Date/Time field', () => {
      const result = parseIbCsv(tradesCsv)

      expect(result.trades[0]?.t_date).toBe('2025-09-05')
      expect(result.trades[1]?.t_date).toBe('2025-09-10')
    })

    it('extracts symbol and quantity correctly', () => {
      const result = parseIbCsv(tradesCsv)

      expect(result.trades[0]?.t_symbol).toBe('BIDU')
      expect(result.trades[0]?.t_qty).toBe(100) // abs value
      expect(result.trades[1]?.t_symbol).toBe('AAPL')
      expect(result.trades[1]?.t_qty).toBe(50)
    })

    it('determines transaction type from quantity and codes', () => {
      const result = parseIbCsv(tradesCsv)

      // -100 qty with A;O code -> Assignment (A takes precedence)
      expect(result.trades[0]?.t_type).toBe('Assignment')
      // 50 qty with O code -> opening trade (qty > 0 with O code = Buy, not Sell to Open)
      expect(result.trades[1]?.t_type).toBe('Buy')
    })

    it('sets source to IB', () => {
      const result = parseIbCsv(tradesCsv)

      expect(result.trades[0]?.t_source).toBe('IB')
    })
  })

  describe('parseIbCsv options parsing', () => {
    const optionsCsv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Equity and Index Options,USD,AMZN  251003C00225000,"2025-09-24, 12:59:22",2,2.6,2.52,-520,-1.532867,521.532867,0,-16,O
Trades,Data,Order,Equity and Index Options,USD,TSLA  251024C00470000,"2025-09-24, 11:17:18",1,20.08,21.5,-2008,-1.1452085,2009.1452085,0,142,O
Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,Underlying,Listing Exch,Multiplier,Expiry,Delivery Month,Type,Strike,Code
Financial Instrument Information,Data,Equity and Index Options,AMZN  251003C00225000,AMZN 03OCT25 225 C,808933975,AMZN,CBOE,100,2025-10-03,2025-10,C,225,
Financial Instrument Information,Data,Equity and Index Options,TSLA  251024C00470000,TSLA 24OCT25 470 C,812385051,TSLA,CBOE,100,2025-10-24,2025-10,C,470,`

    it('parses option trades correctly', () => {
      const result = parseIbCsv(optionsCsv)

      expect(result.trades.length).toBe(2)
    })

    it('extracts option type from Financial Instrument Information', () => {
      const result = parseIbCsv(optionsCsv)

      expect(result.trades[0]?.opt_type).toBe('call')
      expect(result.trades[1]?.opt_type).toBe('call')
    })

    it('extracts strike price from Financial Instrument Information', () => {
      const result = parseIbCsv(optionsCsv)

      expect(result.trades[0]?.opt_strike).toBe('225')
      expect(result.trades[1]?.opt_strike).toBe('470')
    })

    it('extracts expiration from Financial Instrument Information', () => {
      const result = parseIbCsv(optionsCsv)

      expect(result.trades[0]?.opt_expiration).toBe('2025-10-03')
      expect(result.trades[1]?.opt_expiration).toBe('2025-10-24')
    })

    it('extracts underlying symbol from Financial Instrument Information', () => {
      const result = parseIbCsv(optionsCsv)

      // For options, t_symbol should be the underlying
      expect(result.trades[0]?.t_symbol).toBe('AMZN')
      expect(result.trades[1]?.t_symbol).toBe('TSLA')
    })

    it('builds instrument lookup correctly', () => {
      const result = parseIbCsv(optionsCsv)

      expect(result.instruments.size).toBe(2)
      // Symbols are normalized - multiple spaces become single space
      expect(result.instruments.has('AMZN 251003C00225000')).toBe(true)
      expect(result.instruments.has('TSLA 251024C00470000')).toBe(true)
    })
  })

  describe('parseIbCsv interest parsing', () => {
    const interestCsv = `Interest,Header,Currency,Date,Description,Amount
Interest,Data,SGD,2025-09-04,SGD Credit Interest for Aug-2025,31.51
Interest,Data,Total,,,31.51
Interest,Data,Total in USD,,,24.4284426
Interest,Data,USD,2025-09-04,USD Credit Interest for Aug-2025,4.44
Interest,Data,USD,2025-09-04,USD Debit Interest for Aug-2025,-1.32
Interest,Data,Total,,,3.12`

    it('parses interest transactions correctly', () => {
      const result = parseIbCsv(interestCsv)

      // Should skip Total rows
      expect(result.interest.length).toBe(3)
    })

    it('extracts interest description and amount', () => {
      const result = parseIbCsv(interestCsv)

      const sgdInterest = result.interest.find((i) => i.t_description?.includes('SGD'))
      expect(sgdInterest).toBeDefined()
      expect(sgdInterest?.t_amt).toBe(31.51)
      expect(sgdInterest?.t_type).toBe('Interest')
    })

    it('handles negative interest (debit)', () => {
      const result = parseIbCsv(interestCsv)

      const debitInterest = result.interest.find((i) => i.t_description?.includes('Debit'))
      expect(debitInterest).toBeDefined()
      expect(debitInterest?.t_amt).toBe(-1.32)
    })

    it('adds currency comment for non-USD interest', () => {
      const result = parseIbCsv(interestCsv)

      const sgdInterest = result.interest.find((i) => i.t_description?.includes('SGD'))
      expect(sgdInterest?.t_comment).toBe('Currency: SGD')
    })
  })

  describe('parseIbCsv fees parsing', () => {
    const feesCsv = `Fees,Header,Subtitle,Currency,Date,Description,Amount
Fees,Data,Other Fees,USD,2025-09-03,US Securities Snapshot Bundle,-10
Fees,Data,Other Fees,USD,2025-09-04,OPRA NP L1 for Aug 2025,1.5
Fees,Data,Total,,,,0`

    it('parses fee transactions correctly', () => {
      const result = parseIbCsv(feesCsv)

      // Should skip Total rows
      expect(result.fees.length).toBe(2)
    })

    it('extracts fee description with subtitle', () => {
      const result = parseIbCsv(feesCsv)

      expect(result.fees[0]?.t_description).toContain('Other Fees')
      expect(result.fees[0]?.t_description).toContain('US Securities Snapshot')
    })

    it('extracts fee amount correctly', () => {
      const result = parseIbCsv(feesCsv)

      expect(result.fees[0]?.t_amt).toBe(-10)
      expect(result.fees[1]?.t_amt).toBe(1.5)
    })
  })

  describe('parseIbCsvTrades convenience function', () => {
    const tradesCsv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,AAPL,"2025-09-10, 10:30:00",50,175.50,175.00,-8775,-0.50,8775.50,0,-25,O`

    it('returns only trades array', () => {
      const result = parseIbCsvTrades(tradesCsv)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0]?.t_symbol).toBe('AAPL')
    })
  })

  describe('isIbCsvFormat detection', () => {
    it('detects IB format from Statement,Header line', () => {
      const ibCsv = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers LLC`

      expect(isIbCsvFormat(ibCsv)).toBe(true)
    })

    it('detects IB format from Trades,Header line', () => {
      const ibCsv = `Trades,Header,DataDiscriminator,Asset Category
Trades,Data,Order,Stocks`

      expect(isIbCsvFormat(ibCsv)).toBe(true)
    })

    it('detects IB format from Interactive Brokers mention', () => {
      const ibCsv = `Some Header,Field
Data,Interactive Brokers statement`

      expect(isIbCsvFormat(ibCsv)).toBe(true)
    })

    it('returns false for non-IB CSV format', () => {
      const fidelityCsv = `Run Date,Action,Symbol,Description
01/15/2025,BOUGHT,AAPL,APPLE INC`

      expect(isIbCsvFormat(fidelityCsv)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles empty CSV', () => {
      const result = parseIbCsv('')

      expect(result.trades).toEqual([])
      expect(result.interest).toEqual([])
      expect(result.fees).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('handles CSV with only headers', () => {
      const headerOnlyCsv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol`

      const result = parseIbCsv(headerOnlyCsv)

      expect(result.trades).toEqual([])
    })

    it('handles missing Financial Instrument Information', () => {
      const noInstrumentsCsv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Equity and Index Options,USD,UNKNOWN  251003C00225000,"2025-09-24, 12:59:22",2,2.6,2.52,-520,-1.532867,521.532867,0,-16,O`

      const result = parseIbCsv(noInstrumentsCsv)

      // Should still parse the trade, but without option details from instrument lookup
      expect(result.trades.length).toBe(1)
      expect(result.instruments.size).toBe(0)
    })

    it('skips non-Order rows in Trades section', () => {
      const mixedTradesCsv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,AAPL,"2025-09-10, 10:30:00",50,175.50,175.00,-8775,-0.50,8775.50,0,-25,O
Trades,SubTotal,,Stocks,USD,AAPL,,50,,,-8775,-0.50,8775.50,0,-25,
Trades,Total,,Stocks,USD,,,,,,-8775,-0.50,8775.50,0,-25,`

      const result = parseIbCsv(mixedTradesCsv)

      expect(result.trades.length).toBe(1)
    })
  })
})
