import { parseImportData } from '@/data/finance/parseImportData'

describe('parseImportData', () => {
  it('parses generic credit card CSVs that use Transaction and Name headers', () => {
    const csvText = `"Date","Transaction","Name","Memo","Amount"
"2026-02-09","DEBIT","MICROSOFT#G139354345   MICROSOFT.COM WA","24011346040100056586708; 05045; ; ; ;","-0.14"
"2026-02-11","CREDIT","PAYMENT   THANK YOU","WEB AUTOMTC; ; ; ; ;","661.80"`

    const result = parseImportData(csvText)

    expect(result.parseError).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(result.statement).toBeNull()
    expect(result.data?.[0]).toMatchObject({
      t_date: '2026-02-09',
      t_type: 'DEBIT',
      t_description: 'MICROSOFT#G139354345   MICROSOFT.COM WA',
      t_comment: '24011346040100056586708; 05045; ; ; ;',
      t_amt: -0.14,
    })
  })

  it('parses QFX NAME into description and normalizes DTPOSTED', () => {
    const qfxText = `OFXHEADER:100
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20260209120000.000
            <TRNAMT>-0.14
            <NAME>MICROSOFT#G139354345   MICROSOFT
            <MEMO>24011346040100056586708; 05045; ; ; ;
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`

    const result = parseImportData(qfxText)

    expect(result.parseError).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]).toMatchObject({
      t_date: '2026-02-09',
      t_date_posted: '2026-02-09',
      t_type: 'DEBIT',
      t_description: 'MICROSOFT#G139354345   MICROSOFT',
      t_comment: '24011346040100056586708; 05045; ; ; ;',
      t_amt: -0.14,
    })
  })

  it('keeps compatibility with lowercase generic CSV headers', () => {
    const csvText = `date,description,amount,type
2025-01-01,DEPOSIT,1000.00,deposit`

    const result = parseImportData(csvText)

    expect(result.parseError).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]).toMatchObject({
      t_date: '2025-01-01',
      t_description: 'DEPOSIT',
      t_amt: 1000,
      t_type: 'deposit',
    })
  })

  it('parses Fidelity-style E-Trade v3 CSV with Fees column', () => {
    const fidelityCsv = [
      'Activity/Trade Date,Transaction Date,Settlement Date,Activity Type,Description,Symbol,Cusip,Quantity #,Price $,Amount $,Commission,Fees,Category,Note',
      '2017-11-09,2017-11-09,2017-11-13,SELL,YOU SOLD,MSFT,594918104,143.51,84.05,12053.44,0.0,0.25,Investment,',
      '2016-01-06,2016-01-06,2016-01-06,CASH,DEPOSIT,,,,,78.85,0.0,0.0,Transfer,',
    ].join('\n')

    const result = parseImportData(fidelityCsv)

    expect(result.parseError).toBeNull()
    expect(result.statement).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(result.data?.[0]).toMatchObject({
      t_date: '2017-11-09',
      t_type: 'SELL',
      t_symbol: 'MSFT',
      t_qty: 143.51,
      t_price: 84.05,
      t_amt: 12053.44,
      t_commission: 0,
      t_fee: 0.25,
    })
    expect(result.data?.[1]).toMatchObject({
      t_date: '2016-01-06',
      t_type: 'CASH',
      t_description: 'DEPOSIT',
      t_amt: 78.85,
    })
  })
})
