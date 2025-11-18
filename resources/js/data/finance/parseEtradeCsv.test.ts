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
      expect(row.t_amt === undefined || typeof row.t_amt === 'string').toBe(true)
    }
  })

  it('parses internal transfer rows', () => {
    const result = parseEtradeCsv(exampleCsv)
    const transfer = result.find((r) => r.t_description === 'INTERNAL FUND TRANSFER' && r.t_amt === '1901.1')
    expect(transfer).toBeTruthy()
    expect(transfer).toMatchObject({
      t_date: '2024-12-04',
      t_type: '0',
      t_qty: 0,
      t_price: '0',
      t_commission: '0',
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
      t_amt: '0.08',
      t_price: '0',
      t_commission: '0',
    })
  })

  it('parses long descriptive option symbol strings to proper tickers', () => {
    const miniCsv = `TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description\n12/06/24,0, ,NVDA Dec 13 '24 $150 Put,-5,3972.31,7.95,2.68,PUT  NVDA   12/13/24   150.000\n12/06/24,0, ,TSLA Dec 13 '24 $420 Call,-1,354.48,3.55,0.52,CALL TSLA   12/13/24   420.000`
    const result = parseEtradeCsv(miniCsv)
    const nvda = result.find((r) => r.t_symbol === 'NVDA')
    const tsla = result.find((r) => r.t_symbol === 'TSLA')
    expect(nvda).toBeTruthy()
    expect(nvda).toMatchObject({ t_qty: -5, t_price: '7.95', t_commission: '2.68' })
    expect(tsla).toBeTruthy()
    expect(tsla).toMatchObject({ t_qty: -1, t_price: '3.55', t_commission: '0.52' })
  })
})
