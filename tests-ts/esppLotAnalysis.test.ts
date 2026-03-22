import { parseFidelityCsv } from '@/data/finance/parseFidelityCsv'
import { analyzeLots } from '@/lib/finance/washSaleEngine'

describe('ESPP lot matching and wash sale analysis', () => {
  it('parses hypothetical Fidelity ESPP CSV rows into AccountLineItem records', () => {
    const csv = `Run Date,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/02/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,150.00,0.00,0.00,0.00,-15000.00,01/04/2024
06/14/2024,"YOU SOLD APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,170.00,0.00,0.00,0.00,17000.00,06/17/2024`

    const parsed = parseFidelityCsv(csv)

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({
      t_date: '2024-01-02',
      t_type: 'Buy',
      t_symbol: 'AAPL',
      t_qty: 100,
      t_amt: -15000,
      t_comment: 'YOU BOUGHT',
    })
    expect(parsed[0]?.t_description).toContain('EMPLOYEE STOCK PURCHASE PLAN APPLE INC')
  })

  it('analyzes parsed ESPP buy/sell data into a single gain lot', () => {
    const csv = `Run Date,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/02/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,150.00,0.00,0.00,0.00,-15000.00,01/04/2024
06/14/2024,"YOU SOLD APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,170.00,0.00,0.00,0.00,17000.00,06/17/2024`

    const lots = analyzeLots(parseFidelityCsv(csv))

    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({
      symbol: 'AAPL',
      proceeds: 17000,
      costBasis: 15000,
      gainOrLoss: 2000,
      isWashSale: false,
      isShortTerm: true,
    })
  })

  it('detects wash sale for ESPP loss sale followed by repurchase within 30 days', () => {
    const csv = `Run Date,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/02/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,150.00,0.00,0.00,0.00,-15000.00,01/04/2024
06/14/2024,"YOU SOLD APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,130.00,0.00,0.00,0.00,13000.00,06/17/2024
06/20/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,100,132.00,0.00,0.00,0.00,-13200.00,06/24/2024`

    const lots = analyzeLots(parseFidelityCsv(csv))

    expect(lots).toHaveLength(1)
    expect(lots[0]?.isWashSale).toBe(true)
    expect(lots[0]?.adjustmentCode).toBe('W')
    expect(lots[0]?.disallowedLoss).toBe(2000)
    expect(lots[0]?.gainOrLoss).toBe(0)
  })

  it('uses FIFO for multiple ESPP purchase periods in a partial sale', () => {
    const csv = `Run Date,Action,Symbol,Security Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/02/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,50,120.00,0.00,0.00,0.00,-6000.00,01/04/2024
03/01/2024,"YOU BOUGHT EMPLOYEE STOCK PURCHASE PLAN APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,50,140.00,0.00,0.00,0.00,-7000.00,03/05/2024
07/15/2024,"YOU SOLD APPLE INC (AAPL) (Cash)",AAPL,"APPLE INC",Stock,75,160.00,0.00,0.00,0.00,12000.00,07/17/2024`

    const lots = analyzeLots(parseFidelityCsv(csv))

    expect(lots).toHaveLength(1)
    expect(lots[0]).toMatchObject({
      quantity: 75,
      proceeds: 12000,
      costBasis: 9500, // 50×120 + 25×140
      gainOrLoss: 2500,
      dateAcquired: null, // null when FIFO draws from multiple acquisition dates
    })
    expect(lots[0]?.acquiredTransactions).toHaveLength(2)
  })
})
