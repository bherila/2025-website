import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { TaxReturn1040 } from '@/types/finance/tax-return'

import { summarizeTaxEstimate } from '../TaxEstimateHeader'

function line(lineNumber: string, value: number) {
  return { line: lineNumber, label: lineNumber, value }
}

describe('summarizeTaxEstimate', () => {
  it('uses Form 1040 line 25d withholding when backend facts provide it', () => {
    const summary = summarizeTaxEstimate({
      taxReturn: {
        year: 2025,
        form1040: [
          line('9', 100_000),
          line('24', 20_000),
          line('25d', 5_000),
          line('33', 5_000),
        ],
      },
      payslips: [{ ps_fed_tax: 9_000 } as fin_payslip],
    })

    expect(summary.totalWithheld).toBe(5_000)
    expect(summary.refundOrDue).toBe(15_000)
    expect(summary.isRefund).toBe(false)
  })

  it('falls back to reviewed documents and payslips when Form 1040 withholding is zero', () => {
    const taxReturn: TaxReturn1040 = {
      year: 2025,
      form1040: [
        line('9', 100_000),
        line('24', 12_000),
        line('25d', 0),
        line('33', 500),
        line('37', 11_500),
      ],
      docs1099: [{
        formType: '1099_r',
        payerName: 'IRA Custodian',
        parsedData: { box4_fed_tax: 1_200 },
      }],
    }

    const summary = summarizeTaxEstimate({
      taxReturn,
      payslips: [{
        ps_fed_tax: 800,
        ps_fed_tax_addl: 50,
        ps_fed_tax_refunded: 10,
      } as fin_payslip],
    })

    expect(summary.totalWithheld).toBe(2_040)
    expect(summary.refundOrDue).toBe(9_460)
    expect(summary.isRefund).toBe(false)
  })

  it('uses reviewed W-2 withholding instead of payslip withholding when reviewed W-2s are present', () => {
    const summary = summarizeTaxEstimate({
      taxReturn: {
        year: 2025,
        form1040: [
          line('9', 100_000),
          line('24', 12_000),
          line('25d', 0),
          line('33', 0),
        ],
        docs1099: [{
          formType: '1099_misc',
          payerName: 'Payer',
          parsedData: [{ parsed_data: { federal_tax_withheld: '100' } }],
        }],
      },
      w2Documents: [{
        is_reviewed: true,
        parsed_data: { box2_fed_tax: 3_000 },
      } as TaxDocument],
      payslips: [{ ps_fed_tax: 800 } as fin_payslip],
    })

    expect(summary.totalWithheld).toBe(3_100)
  })
})
