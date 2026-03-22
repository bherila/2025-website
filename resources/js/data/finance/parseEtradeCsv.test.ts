import { parseEtradeCsv } from './parseEtradeCsv'

describe('parseEtradeCsv function', () => {
  const exampleCsv = `For Account:,#####1847\n\n\nTransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description\n\n12/06/24,0,OPTN                            ,NVDA Dec 13 '24 $150 Put,-5,3972.31,7.95,2.68,PUT  NVDA   12/13/24   150.000\n12/06/24,0, ,TSLA Dec 13 '24 $420 Call,-1,354.48,3.55,0.52,CALL TSLA   12/13/24   420.000\n12/06/24,0, ,TSLA Dec 13 '24 $400 Put,-1,1989.43,19.9,0.57,PUT  TSLA   12/13/24   400.000\n12/06/24,0, ,NVDA Dec 13 '24 $155 Call,-5,57.42,0.12,2.57,CALL NVDA   12/13/24   155.000\n12/06/24,0, ,TSLA Dec 06 '24 $380 Call,1,-670.51,6.7,0.51,CALL TSLA   12/06/24   380.000\n12/06/24,0, ,NVDA Dec 06 '24 $150 Call,10,-10.12,0.01,0.12,CALL NVDA   12/06/24   150.000\n12/06/24,0, ,TSLA Dec 06 '24 $310 Put,1,-1.01,0.01,0.01,PUT  TSLA   12/06/24   310.000\n12/06/24,0, ,NVDA Dec 06 '24 $150 Put,10,-7905.12,7.9,5.12,PUT  NVDA   12/06/24   150.000\n12/04/24,0, ,NVDA Dec 06 '24 $140 Put,10,-255.12,0.25,5.12,PUT  NVDA   12/06/24   140.000\n12/04/24,0, ,NVDA Dec 06 '24 $150 Put,-10,5144.7,5.15,5.27,PUT  NVDA   12/06/24   150.000\n12/04/24,0, , ,0,1901.1,0,0,INTERNAL FUND TRANSFER\n12/04/24,0, , ,0,-1901.1,0,0,INTERNAL FUND TRANSFER\n12/03/24,0, , ,0,1098.69,0,0,INTERNAL FUND TRANSFER\n12/03/24,0, , ,0,-1098.69,0,0,INTERNAL FUND TRANSFER\n12/02/24,0, , ,0,-3928.36,0,0,INTERNAL FUND TRANSFER\n12/02/24,0, , ,0,3928.36,0,0,INTERNAL FUND TRANSFER\n11/29/24,0,MMF                             ,MSBNK,-0.08,0.08,0,0,MORGAN STANLEY BANK N.A. (Period 11/13-11/30)\n11/29/24,0, ,NVDA Dec 06 '24 $140 Put,-10,3444.75,3.45,5.22,PUT  NVDA   12/06/24   140.000\n11/29/24,0, ,TSLA Dec 06 '24 $380 Call,-1,124.48,1.25,0.52,CALL TSLA   12/06/24   380.000\n11/29/24,0, ,TSLA Dec 06 '24 $310 Put,-1,67.48,0.68,0.52,PUT  TSLA   12/06/24   310.000\n11/29/24,0, ,NVDA Dec 06 '24 $150 Call,-10,164.84,0.17,5.13,CALL NVDA   12/06/24   150.000\n11/29/24,0, ,NVDA Nov 29 '24 $135 Put,10,-10.12,0.01,0.12,PUT  NVDA   11/29/24   135.000\n11/29/24,0, ,NVDA Nov 29 '24 $155 Call,10,-10.12,0.01,0.12,CALL NVDA   11/29/24   155.000\n11/29/24,0, ,TSLA Nov 29 '24 $400 Call,1,-1.01,0.01,0.01,CALL TSLA   11/29/24   400.000\n11/29/24,0, ,TSLA Nov 29 '24 $310 Put,1,-1.01,0.01,0.01,PUT  TSLA   11/29/24   310.000\n11/29/24,0, , ,0,6697.47,0,0,INTERNAL FUND TRANSFER\n11/29/24,0, , ,0,-6697.47,0,0,INTERNAL FUND TRANSFER\n11/27/24,0, , ,0,2726.18,0,0,INTERNAL FUND TRANSFER\n11/27/24,0, , ,0,-2726.18,0,0,INTERNAL FUND TRANSFER\n11/22/24,0, , ,0,-2969.36,0,0,TRNSFR MARGIN TO CASH\n11/22/24,0, , ,0,2969.36,0,0,TRNSFR MARGIN TO CASH\n11/22/24,0,OPTN                            ,TSLA Nov 29 '24 $400 Call,-1,121.47,1.22,0.53,CALL TSLA   11/29/24   400.000\n11/22/24,0, ,NVDA Nov 29 '24 $135 Put,-2,120.95,0.61,1.04,PUT  NVDA   11/29/24   135.000\n11/22/24,0, ,TSLA Nov 29 '24 $310 Put,-1,74.47,0.75,0.53,PUT  TSLA   11/29/24   310.000\n11/22/24,0, ,NVDA Nov 29 '24 $135 Put,-1,60.47,0.61,0.53,PUT  NVDA   11/29/24   135.000\n11/22/24,0, ,NVDA Nov 29 '24 $135 Put,-1,60.47,0.61,0.53,PUT  NVDA   11/29/24   135.000\n11/22/24,0, ,NVDA Nov 29 '24 $135 Put,-6,362.87,0.61,3.11,PUT  NVDA   11/29/24   135.000\n11/22/24,0, ,NVDA Nov 29 '24 $155 Call,-10,204.81,0.21,5.16,CALL NVDA   11/29/24   155.000\n11/22/24,0, ,TSLA Nov 22 '24 $270 Put,1,-1.02,0.01,0.02,PUT  TSLA   11/22/24   270.000\n11/22/24,0, ,TSLA Nov 22 '24 $280 Call,1,-7200.52,72,0.52,CALL TSLA   11/22/24   280.000\n11/22/24,0, ,NVDA Nov 22 '24 $150 Put,5,-4177.58,8.35,2.58,PUT  NVDA   11/22/24   150.000\n11/22/24,0, ,NVDA Nov 22 '24 $180 Call,5,-5.08,0.01,0.08,CALL NVDA   11/22/24   180.000`

  it('parses basic shape and has rows', () => {
    const result = parseEtradeCsv(exampleCsv)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    for (const row of result) {
      expect(typeof row.t_date).toBe('string')
      expect(row.t_date.length).toBeGreaterThan(0)
      expect(row.t_amt === undefined || typeof row.t_amt === 'number').toBe(true)
    }
  })

  it('parses internal transfer rows', () => {
    const result = parseEtradeCsv(exampleCsv)
    const transfer = result.find((r) => r.t_description === 'INTERNAL FUND TRANSFER' && r.t_amt === 1901.1)
    expect(transfer).toBeTruthy()
    expect(transfer).toMatchObject({
      t_date: '2024-12-04',
      t_type: '0',
      t_qty: 0,
      t_price: 0,
      t_commission: 0,
    })
  })

  it('parses money market (MSBNK) row', () => {
    const result = parseEtradeCsv(exampleCsv)
    const mmf = result.find((r) => r.t_symbol === 'MSBNK')
    expect(mmf).toBeTruthy()
    expect(mmf).toMatchObject({
      t_date: '2024-11-29',
      t_type: '0',
      t_qty: -0.08,
      t_amt: 0.08,
      t_price: 0,
      t_commission: 0,
    })
  })

  it('parses long descriptive option symbol strings to proper tickers', () => {
    const miniCsv = `TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description\n12/06/24,0, ,NVDA Dec 13 '24 $150 Put,-5,3972.31,7.95,2.68,PUT  NVDA   12/13/24   150.000\n12/06/24,0, ,TSLA Dec 13 '24 $420 Call,-1,354.48,3.55,0.52,CALL TSLA   12/13/24   420.000`
    const result = parseEtradeCsv(miniCsv)
    const nvda = result.find((r) => r.t_symbol === 'NVDA')
    const tsla = result.find((r) => r.t_symbol === 'TSLA')
    expect(nvda).toBeTruthy()
    expect(nvda).toMatchObject({ t_qty: -5, t_price: 7.95, t_commission: 2.68 })
    expect(tsla).toBeTruthy()
    expect(tsla).toMatchObject({ t_qty: -1, t_price: 3.55, t_commission: 0.52 })
  })
})

describe('parseEtradeCsv — new format (Activity/Trade Date header, 2025+)', () => {
  // Representative rows from the new "All Transactions" export format
  const newFormatCsv = [
    'All Transactions Activity Types',
    '',
    'Account Activity for b -1847 from Prior Year',
    '',
    'Total:,-63559.99',
    '',
    'Activity/Trade Date,Transaction Date,Settlement Date,Activity Type,Description,Symbol,Cusip,Quantity #,Price $,Amount $,Commission,Category,Note',
    '12/31/25,12/31/25,12/31/25,Interest Income,MORGAN STANLEY BANK N.A. (Period 12/01-12/31),MSBNK,--,,,0.09,0.0,--,--',
    '06/09/25,06/09/25,06/09/25,Online Transfer,ACH WITHDRAWL  REFID:139875155906;,--,--,,,-28000.0,0.0,--,--',
    '04/01/25,04/01/25,04/01/25,Adjustment,TRNSFR CASH TO MARGIN,--,--,,,63.46,0.0,--,--',
    '04/01/25,04/01/25,04/01/25,Adjustment,TRNSFR CASH TO MARGIN,--,--,,,-63.46,0.0,--,--',
    '03/31/25,03/31/25,03/31/25,Margin Interest,Thru 03/31/25 for 2 days,--,--,,,-63.46,0.0,--,--',
    '03/03/25,03/03/25,02/28/25,Option Expired,CALL TSLA   02/28/25   380.000,TSLA,--,2.0,,0.0,0.0,--,--',
    '02/28/25,02/28/25,02/27/25,Option Assigned,PUT  TSLA   02/28/25   370.000,TSLA,--,2.0,,0.0,0.0,--,--',
    '02/28/25,02/28/25,03/03/25,Sold,TESLA INC UNSOLICITED TRADE,TSLA,--,-200.0,289.9,57978.35,1.62,--,--',
    '02/28/25,02/28/25,02/28/25,Bought,TESLA INC,TSLA,--,200.0,370.0,-74000.0,0.0,--,--',
    '02/24/25,02/24/25,02/25/25,Sold Short,PUT  TSLA   02/28/25   370.000,TSLA,--,-2.0,40.1,8018.73,1.26,--,--',
    '02/21/25,02/21/25,02/24/25,Bought To Cover,PUT  NVDA   02/21/25   143.000,NVDA,--,5.0,8.65,-4327.58,2.58,--,--',
    '"For all accounts, the Activity Date and the Processing Date are displayed."',
  ].join('\n')

  it('parses basic shape — returns rows and each has a valid t_date', () => {
    const result = parseEtradeCsv(newFormatCsv)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    for (const row of result) {
      expect(typeof row.t_date).toBe('string')
      expect(row.t_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('ignores the preamble (Total: line) and footer (disclaimer) rows', () => {
    const result = parseEtradeCsv(newFormatCsv)
    // Should only contain the 11 data rows, not the Total: or disclaimer lines
    expect(result.length).toBe(11)
  })

  it('parses interest income row (MSBNK)', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_symbol === 'MSBNK')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-12-31',
      t_type: 'Interest Income',
      t_symbol: 'MSBNK',
      t_description: 'MORGAN STANLEY BANK N.A. (Period 12/01-12/31)',
      t_amt: 0.09,
      t_commission: 0,
    })
  })

  it('parses online transfer (ACH WITHDRAWL) row with no symbol', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Online Transfer')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-06-09',
      t_type: 'Online Transfer',
      t_description: 'ACH WITHDRAWL  REFID:139875155906;',
      t_amt: -28000,
      t_commission: 0,
    })
    expect(row?.t_symbol == null).toBe(true)
  })

  it('parses adjustment rows (paired transfer, no symbol)', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const adjustments = result.filter((r) => r.t_type === 'Adjustment')
    expect(adjustments.length).toBe(2)
    expect(adjustments.find((r) => r.t_amt === 63.46)).toBeTruthy()
    expect(adjustments.find((r) => r.t_amt === -63.46)).toBeTruthy()
    for (const row of adjustments) {
      expect(row.t_symbol == null).toBe(true)
      expect(row.t_description).toBe('TRNSFR CASH TO MARGIN')
    }
  })

  it('parses margin interest row (no symbol, negative amount)', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Margin Interest')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-03-31',
      t_type: 'Margin Interest',
      t_amt: -63.46,
    })
    expect(row?.t_symbol == null).toBe(true)
  })

  it('parses option expired row — symbol from Symbol column, not description', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Option Expired')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-03-03',
      t_type: 'Option Expired',
      t_symbol: 'TSLA',
      t_description: 'CALL TSLA   02/28/25   380.000',
      t_qty: 2,
      t_commission: 0,
    })
  })

  it('parses option assigned row', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Option Assigned')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-02-28',
      t_type: 'Option Assigned',
      t_symbol: 'TSLA',
      t_description: 'PUT  TSLA   02/28/25   370.000',
      t_qty: 2,
    })
  })

  it('parses sold row with price and commission', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Sold')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-02-28',
      t_type: 'Sold',
      t_symbol: 'TSLA',
      t_description: 'TESLA INC UNSOLICITED TRADE',
      t_qty: -200,
      t_price: 289.9,
      t_amt: 57978.35,
      t_commission: 1.62,
    })
  })

  it('parses bought row with negative amount', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Bought')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-02-28',
      t_type: 'Bought',
      t_symbol: 'TSLA',
      t_description: 'TESLA INC',
      t_qty: 200,
      t_price: 370,
      t_amt: -74000,
      t_commission: 0,
    })
  })

  it('parses sold short option row', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Sold Short')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-02-24',
      t_type: 'Sold Short',
      t_symbol: 'TSLA',
      t_description: 'PUT  TSLA   02/28/25   370.000',
      t_qty: -2,
      t_price: 40.1,
      t_amt: 8018.73,
      t_commission: 1.26,
    })
  })

  it('parses bought to cover row', () => {
    const result = parseEtradeCsv(newFormatCsv)
    const row = result.find((r) => r.t_type === 'Bought To Cover')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2025-02-21',
      t_type: 'Bought To Cover',
      t_symbol: 'NVDA',
      t_description: 'PUT  NVDA   02/21/25   143.000',
      t_qty: 5,
      t_price: 8.65,
      t_amt: -4327.58,
      t_commission: 2.58,
    })
  })

  it('returns empty array for an unrecognized format', () => {
    expect(parseEtradeCsv('random,data\n1,2')).toEqual([])
  })
})

describe('parseEtradeCsv — Fidelity v3 format with Fees column', () => {
  // Subset of fidelity_transactions_2011_2019.csv — same v3 header but with an extra Fees column
  const fidelityFmtCsv = [
    'Activity/Trade Date,Transaction Date,Settlement Date,Activity Type,Description,Symbol,Cusip,Quantity #,Price $,Amount $,Commission,Fees,Category,Note',
    '2011-12-30,2011-12-30,2012-01-04,BUY,YOU BOUGHT (ESPP),MSFT,594918104,148.0428,23.36,3457.79,0.0,0.0,Investment,Initial ESPP lot',
    '2012-03-13,2012-03-13,2012-03-13,DIV,DIVIDEND RECEIVED,MSFT,594918104,,,29.61,0.0,0.0,Income,',
    '2013-04-10,2013-04-10,2013-04-15,SELL,YOU SOLD,MSFT,594918104,200.0,30.23,6037.91,7.95,0.0,Investment,',
    '2017-11-09,2017-11-09,2017-11-13,SELL,YOU SOLD,MSFT,594918104,143.51,84.05,12053.44,0.0,0.25,Investment,',
    '2016-01-06,2016-01-06,2016-01-06,CASH,DEPOSIT,,,,,78.85,0.0,0.0,Transfer,',
  ].join('\n')

  it('detects and parses the format — returns all 5 data rows', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(5)
    for (const row of result) {
      expect(row.t_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('parses a BUY row with zero fees', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    const row = result.find((r) => r.t_type === 'BUY')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2011-12-30',
      t_type: 'BUY',
      t_symbol: 'MSFT',
      t_description: 'YOU BOUGHT (ESPP)',
      t_qty: 148.0428,
      t_price: 23.36,
      t_amt: 3457.79,
      t_commission: 0,
      t_fee: 0,
    })
  })

  it('parses a SELL row with non-zero commission and zero fee', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    const row = result.find((r) => r.t_type === 'SELL' && r.t_date === '2013-04-10')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2013-04-10',
      t_commission: 7.95,
      t_fee: 0,
    })
  })

  it('parses a SELL row with non-zero fee from the Fees column', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    const row = result.find((r) => r.t_type === 'SELL' && r.t_date === '2017-11-09')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2017-11-09',
      t_symbol: 'MSFT',
      t_commission: 0,
      t_fee: 0.25,
    })
  })

  it('parses a DIV row (no quantity, no price)', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    const row = result.find((r) => r.t_type === 'DIV')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2012-03-13',
      t_type: 'DIV',
      t_symbol: 'MSFT',
      t_description: 'DIVIDEND RECEIVED',
      t_amt: 29.61,
    })
  })

  it('parses a CASH/DEPOSIT row (no symbol, no quantity)', () => {
    const result = parseEtradeCsv(fidelityFmtCsv)
    const row = result.find((r) => r.t_type === 'CASH')
    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      t_date: '2016-01-06',
      t_type: 'CASH',
      t_description: 'DEPOSIT',
      t_amt: 78.85,
    })
    expect(row?.t_symbol == null).toBe(true)
  })
})
