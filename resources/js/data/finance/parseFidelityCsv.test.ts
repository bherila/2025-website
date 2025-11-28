import { parseFidelityCsv } from './parseFidelityCsv'

describe('parseFidelityCsv function', () => {
  describe('format with Account column (Run Date,Account,...)', () => {
    const csvWithAccount = `Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2025,12345,BOUGHT,AAPL,APPLE INC,Stock,10,150.00,0.00,0.00,0.00,-1500.00,01/17/2025
01/16/2025,12345,SOLD,AAPL,APPLE INC,Stock,5,155.00,0.00,0.00,0.00,775.00,01/18/2025`

    it('parses CSV with Account column correctly', () => {
      const result = parseFidelityCsv(csvWithAccount)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
    })

    it('parses CSV fields correctly', () => {
      const result = parseFidelityCsv(csvWithAccount)
      expect(result[0]).toMatchObject({
        t_date: '2025-01-15',
        t_type: 'BOUGHT',
        t_symbol: 'AAPL',
        t_description: 'APPLE INC',
        t_qty: 10,
        t_price: 150.00,
        t_commission: 0.00,
        t_fee: 0.00,
        t_amt: -1500.00,
        t_date_posted: '2025-01-17',
      })
    })
  })

  describe('format without Account column (Date,Action,...)', () => {
    const csvWithoutAccount = `Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date
11/21/2025,"SHORT VS MARGIN MARK TO MARKET (Margin)",,"No Description",Margin,,0.000,,,,4473.68,Processing,
11/21/2025,"SHORT VS MARGIN MARK TO MARKET (Short)",,"No Description",Short,,0.000,,,,-4473.68,Processing,
11/21/2025,"DIVIDEND RECEIVED APA CORPORATION COM (APA) (Margin)",APA,"APA CORPORATION COM",Margin,,0.000,,,,4,Processing,`

    it('parses CSV without Account column correctly', () => {
      const result = parseFidelityCsv(csvWithoutAccount)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)
    })

    it('parses margin mark to market row correctly', () => {
      const result = parseFidelityCsv(csvWithoutAccount)
      const marginRow = result.find((r) => r.t_type === 'SHORT VS MARGIN MARK TO MARKET (Margin)')
      expect(marginRow).toBeTruthy()
      expect(marginRow).toMatchObject({
        t_date: '2025-11-21',
        t_type: 'SHORT VS MARGIN MARK TO MARKET (Margin)',
        t_description: 'No Description',
        t_price: 0.000,
        t_amt: 4473.68,
        t_account_balance: undefined,
      })
    })

    it('parses dividend row correctly', () => {
      const result = parseFidelityCsv(csvWithoutAccount)
      const dividendRow = result.find((r) => r.t_symbol === 'APA')
      expect(dividendRow).toBeTruthy()
      expect(dividendRow).toMatchObject({
        t_date: '2025-11-21',
        t_type: 'DIVIDEND RECEIVED APA CORPORATION COM (APA) (Margin)',
        t_symbol: 'APA',
        t_description: 'APA CORPORATION COM',
        t_amt: 4,
        t_price: 0.000,
      })
    })

    it('handles Processing settlement date correctly', () => {
      const result = parseFidelityCsv(csvWithoutAccount)
      // When settlement date is "Processing", t_date_posted should be undefined
      expect(result[0]?.t_date_posted).toBeUndefined()
    })
  })

  describe('interchangeable Date headers', () => {
    it('accepts "Run Date" as date column', () => {
      const csvWithRunDate = `Run Date,Action,Symbol,Description,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date
01/15/2025,BOUGHT,AAPL,APPLE INC,10,150.00,0.00,0.00,-1500.00,01/17/2025`
      const result = parseFidelityCsv(csvWithRunDate)
      expect(result.length).toBe(1)
      expect(result[0]?.t_date).toBe('2025-01-15')
      expect(result[0]?.t_amt).toBe(-1500.00)
      expect(result[0]?.t_price).toBe(150.00)
      expect(result[0]?.t_commission).toBe(0.00)
      expect(result[0]?.t_fee).toBe(0.00)
    })

    it('accepts "Date" as date column', () => {
      const csvWithDate = `Date,Action,Symbol,Description,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date
01/15/2025,BOUGHT,AAPL,APPLE INC,10,150.00,0.00,0.00,-1500.00,01/17/2025`
      const result = parseFidelityCsv(csvWithDate)
      expect(result.length).toBe(1)
      expect(result[0]?.t_date).toBe('2025-01-15')
      expect(result[0]?.t_amt).toBe(-1500.00)
      expect(result[0]?.t_price).toBe(150.00)
      expect(result[0]?.t_commission).toBe(0.00)
      expect(result[0]?.t_fee).toBe(0.00)
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty text', () => {
      const result = parseFidelityCsv('')
      expect(result).toEqual([])
    })

    it('returns empty array for unrecognized format', () => {
      const unknownFormat = `Column1,Column2,Column3
value1,value2,value3`
      const result = parseFidelityCsv(unknownFormat)
      expect(result).toEqual([])
    })

    it('returns empty array for header only', () => {
      const headerOnly = `Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date`
      const result = parseFidelityCsv(headerOnly)
      expect(result).toEqual([])
    })

    it('strips disclaimer rows from the end of the file', () => {
      const csvWithDisclaimer = `Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2025,12345,BOUGHT,AAPL,APPLE INC,Stock,10,150.00,0.00,0.00,0.00,-1500.00,01/17/2025
01/16/2025,12345,SOLD,AAPL,APPLE INC,Stock,5,155.00,0.00,0.00,0.00,775.00,01/18/2025



"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for"
"informational purposes only, and is not intended to provide advice, nor should it be construed as an offer to sell, a solicitation of an offer to buy or a"
"recommendation for any security or insurance product by Fidelity or any third party. Data and information shown is based on information known to Fidelity as of the date it was"
"exported and is subject to change. It should not be used in place of your account statements or trade confirmations and is not intended for tax reporting"
"purposes. For more information on the data included in this spreadsheet, including any limitations thereof, go to Fidelity.com."

"Brokerage services are provided by Fidelity Brokeration Services LLC (FBS), 900 Salem Street, Smithfield, RI 02917. Custody and other services provided by National"
"Financial Services LLC (NFS). Both are Fidelity Investment companies and members SIPC, NYSE. Insurance products at Fidelity are distributed by"
"Fidelity Insurance Agency, Inc., and, for certain products, by Fidelity Brokerage Services, Member NYSE, SIPC."

Date downloaded 11/21/2025 12:54 am`
      const result = parseFidelityCsv(csvWithDisclaimer)
      expect(result.length).toBe(2)
      expect(result[0]).toMatchObject({
        t_symbol: 'AAPL',
        t_amt: -1500.00,
        t_price: 150.00,
        t_commission: 0.00,
        t_fee: 0.00,
      })
      expect(result[1]).toMatchObject({
        t_symbol: 'AAPL',
        t_amt: 775.00,
        t_price: 155.00,
        t_commission: 0.00,
        t_fee: 0.00,
      })
    })
  })
})
