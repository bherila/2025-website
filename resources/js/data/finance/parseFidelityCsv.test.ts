import { parseFidelityCsv, splitTransactionString } from './parseFidelityCsv'

describe('parseFidelityCsv function', () => {
  describe('format with Account column (Run Date,Account,...)', () => {
    const csvWithAccount = `Run Date,Account,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
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
        t_type: 'Buy',
        t_symbol: 'AAPL',
        t_description: 'BOUGHT',
        t_qty: 10,
        t_price: 150.00,
        t_commission: 0.00,
        t_fee: 0.00,
        t_amt: -1500.00,
        t_date_posted: '2025-01-17',
        t_comment: '',
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
      const marginRow = result.find((r) => r.t_description === 'SHORT VS MARGIN MARK TO MARKET' && r.t_amt === 4473.68)
      expect(marginRow).toBeTruthy()
      expect(marginRow).toMatchObject({
        t_date: '2025-11-21',
        t_type: 'MISC',
        t_description: 'SHORT VS MARGIN MARK TO MARKET',
        t_price: 0.000,
        t_amt: 4473.68,
        t_account_balance: undefined,
        t_comment: '(MARGIN)',
      })
    })

    it('parses dividend row correctly', () => {
      const result = parseFidelityCsv(csvWithoutAccount)
      const dividendRow = result.find((r) => r.t_symbol === 'APA')
      expect(dividendRow).toBeTruthy()
      expect(dividendRow).toMatchObject({
        t_date: '2025-11-21',
        t_type: 'Dividend',
        t_symbol: 'APA',
        t_description: 'DIVIDEND RECEIVED',
        t_amt: 4,
        t_price: 0.000,
        t_comment: 'APA CORPORATION COM (APA) (MARGIN)',
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
      const csvWithRunDate = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date
01/15/2025,BOUGHT,AAPL,APPLE INC,Stock,10,150.00,0.00,0.00,-1500.00,01/17/2025`
      const result = parseFidelityCsv(csvWithRunDate)
      expect(result.length).toBe(1)
      expect(result[0]?.t_date).toBe('2025-01-15')
      expect(result[0]?.t_amt).toBe(-1500.00)
      expect(result[0]?.t_price).toBe(150.00)
      expect(result[0]?.t_commission).toBe(0.00)
      expect(result[0]?.t_fee).toBe(0.00)
      expect(result[0]?.t_type).toBe('Buy')
      expect(result[0]?.t_description).toBe('BOUGHT')
      expect(result[0]?.t_comment).toBe('')
    })

    it('accepts "Date" as date column', () => {
      const csvWithDate = `Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date
01/15/2025,BOUGHT,AAPL,APPLE INC,Stock,10,150.00,0.00,0.00,-1500.00,01/17/2025`
      const result = parseFidelityCsv(csvWithDate)
      expect(result.length).toBe(1)
      expect(result[0]?.t_date).toBe('2025-01-15')
      expect(result[0]?.t_amt).toBe(-1500.00)
      expect(result[0]?.t_price).toBe(150.00)
      expect(result[0]?.t_commission).toBe(0.00)
      expect(result[0]?.t_fee).toBe(0.00)
      expect(result[0]?.t_type).toBe('Buy')
      expect(result[0]?.t_description).toBe('BOUGHT')
      expect(result[0]?.t_comment).toBe('')
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
      const csvWithDisclaimer = `Run Date,Account,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
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
        t_type: 'Buy',
        t_description: 'BOUGHT',
        t_comment: '',
      })
      expect(result[1]).toMatchObject({
        t_symbol: 'AAPL',
        t_amt: 775.00,
        t_price: 155.00,
        t_commission: 0.00,
        t_fee: 0.00,
        t_type: 'Sell',
        t_description: 'SOLD',
        t_comment: '',
      })
    })
  })

  describe('new format with currency columns (Run Date,Action,Symbol,Description,...,Price,Amount)', () => {
    const csvNewFormat = `Run Date,Action,Symbol,Description,Type,Exchange Quantity,Exchange Currency,Quantity,Currency,Price,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Cash Balance,Settlement Date
11/26/2025,"DIRECT DEBIT JPMorgan ChaseACCTVERIFY (Cash)", ,"No Description",Cash,0,,USD,,0.000,0,,,,-0.57,197648.75,
11/26/2025,"DIRECT DEPOSIT ALLY BANK P2P BENJAMIN W HERIWEB (Cash)", ,"No Description",Cash,0,,USD,,0.000,0,,,,1000,197648.75,
11/26/2025,"WIRE TRANSFER FROM BANK (Cash)",,"No Description",Cash,0,,USD,,0.000,0,,,,196648.75,196648.75,
11/25/2025,"WIRE TRANSFER TO BANK (Cash)",,"No Description",Cash,0,,USD,,0.000,0,,,,-200000,0.00,
11/03/2025,"YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,0,,USD,1,54150,0,,,,-54150,45.95,11/03/2025
10/31/2025,"DIVIDEND RECEIVED FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,0,,USD,,0.000,0,,,,720.08,54870.08,
10/31/2025,"REINVESTMENT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Cash,0,,USD,1,720.08,0,,,,-720.08,54150.00,
09/30/2025,"DIVIDEND RECEIVED PUBLIC SVC ENTERPRISE GRP INC COM (PEG) (Margin)",PEG,"PUBLIC SVC ENTERPRISE GRP INC COM",Margin,0,,USD,,0.000,0,,,,449.82,45201.06,
Date downloaded 11/28/2025 11:07 am`

    it('parses new format CSV with currency columns correctly', () => {
      const result = parseFidelityCsv(csvNewFormat)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(8) // Should not include "Date downloaded" footer row
    })

    it('parses DIRECT DEBIT as Withdrawal type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const debitRow = result.find((r) => r.t_amt === -0.57)
      expect(debitRow).toBeTruthy()
      expect(debitRow?.t_type).toBe('Withdrawal')
      expect(debitRow?.t_description).toBe('DIRECT DEBIT')
    })

    it('parses DIRECT DEPOSIT as Deposit type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const depositRow = result.find((r) => r.t_amt === 1000)
      expect(depositRow).toBeTruthy()
      expect(depositRow?.t_type).toBe('Deposit')
      expect(depositRow?.t_description).toBe('DIRECT DEPOSIT')
    })

    it('parses WIRE TRANSFER FROM BANK as Wire type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const wireInRow = result.find((r) => r.t_amt === 196648.75)
      expect(wireInRow).toBeTruthy()
      expect(wireInRow?.t_type).toBe('Wire')
      expect(wireInRow?.t_description).toBe('WIRE TRANSFER FROM BANK')
    })

    it('parses WIRE TRANSFER TO BANK as Wire type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const wireOutRow = result.find((r) => r.t_amt === -200000)
      expect(wireOutRow).toBeTruthy()
      expect(wireOutRow?.t_type).toBe('Wire')
      expect(wireOutRow?.t_description).toBe('WIRE TRANSFER TO BANK')
    })

    it('parses YOU BOUGHT as Buy type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const buyRow = result.find((r) => r.t_amt === -54150)
      expect(buyRow).toBeTruthy()
      expect(buyRow?.t_type).toBe('Buy')
      expect(buyRow?.t_description).toBe('YOU BOUGHT')
      expect(buyRow?.t_symbol).toBe('FSIXX')
    })

    it('parses DIVIDEND RECEIVED as Dividend type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const dividendRows = result.filter((r) => r.t_description === 'DIVIDEND RECEIVED')
      expect(dividendRows.length).toBe(2)
      dividendRows.forEach((r) => {
        expect(r.t_type).toBe('Dividend')
      })
    })

    it('parses REINVESTMENT as Reinvest type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      const reinvestRow = result.find((r) => r.t_description === 'REINVESTMENT')
      expect(reinvestRow).toBeTruthy()
      expect(reinvestRow?.t_type).toBe('Reinvest')
    })

    it('does NOT use Type column (Cash/Margin/Shares) as transaction type', () => {
      const result = parseFidelityCsv(csvNewFormat)
      // None of the transaction types should be "Cash", "Margin", or "Shares"
      result.forEach((r) => {
        expect(r.t_type).not.toBe('Cash')
        expect(r.t_type).not.toBe('Margin')
        expect(r.t_type).not.toBe('Shares')
      })
    })

    it('strips Date downloaded footer', () => {
      const result = parseFidelityCsv(csvNewFormat)
      // Should not have any row where description contains "Date downloaded"
      expect(result.some((r) => (r.t_description || '').includes('downloaded'))).toBe(false)
    })
  })

  describe('splitTransactionString function', () => {
    it('extracts DIRECT DEBIT type correctly', () => {
      const result = splitTransactionString('DIRECT DEBIT JPMorgan ChaseACCTVERIFY (Cash)')
      expect(result.transactionType).toBe('Withdrawal')
      expect(result.transactionDescription).toBe('DIRECT DEBIT')
    })

    it('extracts DIRECT DEPOSIT type correctly', () => {
      const result = splitTransactionString('DIRECT DEPOSIT ALLY BANK P2P BENJAMIN W HERIWEB (Cash)')
      expect(result.transactionType).toBe('Deposit')
      expect(result.transactionDescription).toBe('DIRECT DEPOSIT')
    })

    it('extracts WIRE TRANSFER FROM BANK type correctly', () => {
      const result = splitTransactionString('WIRE TRANSFER FROM BANK (Cash)')
      expect(result.transactionType).toBe('Wire')
      expect(result.transactionDescription).toBe('WIRE TRANSFER FROM BANK')
    })

    it('extracts YOU BOUGHT type correctly', () => {
      const result = splitTransactionString('YOU BOUGHT PROSPECTUS UNDER SEPARATE COVER FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)')
      expect(result.transactionType).toBe('Buy')
      expect(result.transactionDescription).toBe('YOU BOUGHT')
    })

    it('extracts DIVIDEND RECEIVED type correctly', () => {
      const result = splitTransactionString('DIVIDEND RECEIVED FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)')
      expect(result.transactionType).toBe('Dividend')
      expect(result.transactionDescription).toBe('DIVIDEND RECEIVED')
    })

    it('extracts REINVESTMENT type correctly', () => {
      const result = splitTransactionString('REINVESTMENT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)')
      expect(result.transactionType).toBe('Reinvest')
      expect(result.transactionDescription).toBe('REINVESTMENT')
    })

    it('extracts REDEMPTION FROM CORE ACCOUNT type correctly', () => {
      const result = splitTransactionString('REDEMPTION FROM CORE ACCOUNT FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)')
      expect(result.transactionType).toBe('Redeem')
      expect(result.transactionDescription).toBe('REDEMPTION FROM CORE ACCOUNT')
    })

    it('extracts Electronic Funds Transfer Received type correctly', () => {
      const result = splitTransactionString('Electronic Funds Transfer Received (Cash)')
      expect(result.transactionType).toBe('Deposit')
      expect(result.transactionDescription).toBe('ELECTRONIC FUNDS TRANSFER RECEIVED')
    })

    it('extracts Electronic Funds Transfer Paid type correctly', () => {
      const result = splitTransactionString('Electronic Funds Transfer Paid (Cash)')
      expect(result.transactionType).toBe('Withdrawal')
      expect(result.transactionDescription).toBe('ELECTRONIC FUNDS TRANSFER PAID')
    })

    it('extracts BILL PAYMENT type correctly', () => {
      const result = splitTransactionString('BILL PAYMENT WELCHPASTEUR ALLERGY ME (Cash)')
      expect(result.transactionType).toBe('Payment')
      expect(result.transactionDescription).toBe('BILL PAYMENT')
    })

    it('extracts TRANSFERRED TO VS type correctly', () => {
      const result = splitTransactionString('TRANSFERRED TO VS 637-768451-1 (Cash)')
      expect(result.transactionType).toBe('Transfer')
      expect(result.transactionDescription).toBe('TRANSFERRED TO VS')
    })

    it('extracts TRANSFERRED FROM VS type correctly', () => {
      const result = splitTransactionString('TRANSFERRED FROM VS 637-768451-1 FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)')
      expect(result.transactionType).toBe('Transfer')
      expect(result.transactionDescription).toBe('TRANSFERRED FROM VS')
    })

    it('extracts JOURNALED GOODWILL type correctly', () => {
      const result = splitTransactionString('JOURNALED GOODWILL GOODWILL ADJUSTMENT INTEREST CREDIT (Cash)')
      expect(result.transactionType).toBe('Journal')
      expect(result.transactionDescription).toBe('JOURNALED GOODWILL')
    })

    it('extracts ASSET/ACCT FEE type correctly', () => {
      const result = splitTransactionString('ASSET/ACCT FEE FEE REVERSAL-INTERNLFIRST PARTY FEE ADJ ADJUSTMENT (Cash)')
      expect(result.transactionType).toBe('Fee')
      expect(result.transactionDescription).toBe('ASSET/ACCT FEE')
    })

    it('handles empty string', () => {
      const result = splitTransactionString('')
      expect(result.transactionType).toBe('MISC')
      expect(result.transactionDescription).toBe('')
    })

    it('returns MISC for unrecognized transactions', () => {
      const result = splitTransactionString('SOME UNKNOWN TRANSACTION TYPE')
      expect(result.transactionType).toBe('MISC')
    })
  })

  describe('additional transaction types', () => {
    const csvWithMoreTypes = `Run Date,Action,Symbol,Description,Type,Exchange Quantity,Exchange Currency,Quantity,Currency,Price,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Cash Balance,Settlement Date
08/21/2025,"TRANSFERRED FROM VS 637-768451-1 FIMM TREASURY ONLY PORTFOLIO: CL I (FSIXX) (Cash)",FSIXX,"FIMM TREASURY ONLY PORTFOLIO: CL I",Shares,0,,USD,,370000,0,,,,370000,19802.72,
08/21/2025,"TRANSFERRED TO VS 637-768451-2 SALESFORCE INC COM (CRM) (Margin)",CRM,"SALESFORCE INC COM",Shares,0,,USD,,-8.221,0,,,,-2020.96,19802.72,
07/15/2025,"JOURNALED GOODWILL GOODWILL ADJUSTMENT INTEREST CREDIT (Cash)",,"No Description",Cash,0,,USD,,0.000,0,,,,3.56,150654.73,
07/14/2025,"ASSET/ACCT FEE FEE REVERSAL-INTERNLFIRST PARTY FEE ADJ ADJUSTMENT (Cash)",,"No Description",Cash,0,,USD,,0.000,0,,,,28.58,150651.17,
07/23/2025,"REINVESTMENT DISNEY WALT CO COM (DIS) (Margin)",DIS,"DISNEY WALT CO COM",Margin,0,,USD,121.17,0.109,0,,,,-13.17,150654.73,`

    it('parses TRANSFERRED FROM VS as Transfer type', () => {
      const result = parseFidelityCsv(csvWithMoreTypes)
      const transferFromRow = result.find((r) => r.t_amt === 370000)
      expect(transferFromRow).toBeTruthy()
      expect(transferFromRow?.t_type).toBe('Transfer')
      expect(transferFromRow?.t_description).toBe('TRANSFERRED FROM VS')
    })

    it('parses TRANSFERRED TO VS as Transfer type', () => {
      const result = parseFidelityCsv(csvWithMoreTypes)
      const transferToRow = result.find((r) => r.t_amt === -2020.96)
      expect(transferToRow).toBeTruthy()
      expect(transferToRow?.t_type).toBe('Transfer')
      expect(transferToRow?.t_description).toBe('TRANSFERRED TO VS')
    })

    it('parses JOURNALED GOODWILL as Journal type', () => {
      const result = parseFidelityCsv(csvWithMoreTypes)
      const journalRow = result.find((r) => r.t_amt === 3.56)
      expect(journalRow).toBeTruthy()
      expect(journalRow?.t_type).toBe('Journal')
    })

    it('parses ASSET/ACCT FEE as Fee type', () => {
      const result = parseFidelityCsv(csvWithMoreTypes)
      const feeRow = result.find((r) => r.t_amt === 28.58)
      expect(feeRow).toBeTruthy()
      expect(feeRow?.t_type).toBe('Fee')
    })
  })

  describe('TRANSFER OF ASSETS, MERGER, and FOREIGN TAX PAID', () => {
    describe('splitTransactionString for special transaction types', () => {
      it('extracts TRANSFER OF ASSETS correctly', () => {
        const result = splitTransactionString('TRANSFER OF ASSETS ACAT RECEIVE BROADCOM INC COM (AVGO) (Margin)')
        expect(result.transactionType).toBe('Transfer')
        expect(result.transactionDescription).toBe('TRANSFER OF ASSETS')
        expect(result.rest).toBe('ACAT RECEIVE BROADCOM INC COM (AVGO) (MARGIN)')
      })

      it('extracts MERGER correctly', () => {
        const result = splitTransactionString('MERGER MER PAYOUT #REORCM0051678340000 WALGREENS BOOTS ALLIANCE INC (WBA) (Cash)')
        expect(result.transactionType).toBe('Merger')
        expect(result.transactionDescription).toBe('MERGER')
        expect(result.rest).toBe('MER PAYOUT #REORCM0051678340000 WALGREENS BOOTS ALLIANCE INC (WBA) (CASH)')
      })

      it('extracts FOREIGN TAX PAID correctly', () => {
        const result = splitTransactionString('FOREIGN TAX PAID NXP SEMICONDUCTORS NV (NXPI) (Margin)')
        expect(result.transactionType).toBe('Tax')
        expect(result.transactionDescription).toBe('FOREIGN TAX PAID')
        expect(result.rest).toBe('NXP SEMICONDUCTORS NV (NXPI) (MARGIN)')
      })
    })

    const csvWithSpecialTypes = `Run Date,Action,Symbol,Description,Type,Exchange Quantity,Exchange Currency,Quantity,Currency,Price,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Cash Balance,Settlement Date
11/15/2025,"TRANSFER OF ASSETS ACAT RECEIVE BROADCOM INC COM (AVGO) (Margin)",AVGO,"BROADCOM INC COM",Margin,0,,USD,10,0.000,0,,,,0,150000.00,11/15/2025
11/10/2025,"MERGER MER PAYOUT #REORCM0051678340000 WALGREENS BOOTS ALLIANCE INC (WBA) (Cash)",WBA,"WALGREENS BOOTS ALLIANCE INC",Cash,0,,USD,,0.000,0,,,,125.50,150125.50,11/10/2025
11/05/2025,"FOREIGN TAX PAID NXP SEMICONDUCTORS NV (NXPI) (Margin)",NXPI,"NXP SEMICONDUCTORS NV",Margin,0,,USD,,0.000,0,,,,-15.25,150000.00,11/05/2025`

    it('parses TRANSFER OF ASSETS as Transfer type', () => {
      const result = parseFidelityCsv(csvWithSpecialTypes)
      const transferRow = result.find((r) => r.t_symbol === 'AVGO')
      expect(transferRow).toBeTruthy()
      expect(transferRow?.t_type).toBe('Transfer')
      expect(transferRow?.t_description).toBe('TRANSFER OF ASSETS')
      expect(transferRow?.t_comment).toBe('ACAT RECEIVE BROADCOM INC COM (AVGO) (MARGIN)')
    })

    it('parses MERGER as Merger type', () => {
      const result = parseFidelityCsv(csvWithSpecialTypes)
      const mergerRow = result.find((r) => r.t_symbol === 'WBA')
      expect(mergerRow).toBeTruthy()
      expect(mergerRow?.t_type).toBe('Merger')
      expect(mergerRow?.t_description).toBe('MERGER')
      expect(mergerRow?.t_comment).toBe('MER PAYOUT #REORCM0051678340000 WALGREENS BOOTS ALLIANCE INC (WBA) (CASH)')
    })

    it('parses FOREIGN TAX PAID as Tax type', () => {
      const result = parseFidelityCsv(csvWithSpecialTypes)
      const taxRow = result.find((r) => r.t_symbol === 'NXPI')
      expect(taxRow).toBeTruthy()
      expect(taxRow?.t_type).toBe('Tax')
      expect(taxRow?.t_description).toBe('FOREIGN TAX PAID')
      expect(taxRow?.t_comment).toBe('NXP SEMICONDUCTORS NV (NXPI) (MARGIN)')
      expect(taxRow?.t_amt).toBe(-15.25)
    })
  })
})
