import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1040Facts, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

import { summarizeTaxEstimate } from '../TaxEstimateHeader'

function facts(form1040: Partial<Form1040Facts>): TaxPreviewFacts {
  return { form1040 } as TaxPreviewFacts
}

describe('summarizeTaxEstimate', () => {
  it('uses Form 1040 line 25d withholding when backend facts provide it', () => {
    const summary = summarizeTaxEstimate({
      taxFacts: facts({
        line9: 100_000,
        line24: 20_000,
        line25d: 5_000,
        line33: 5_000,
      }),
      payslips: [{ ps_fed_tax: 9_000 } as fin_payslip],
    })

    expect(summary.totalWithheld).toBe(5_000)
    expect(summary.refundOrDue).toBe(15_000)
    expect(summary.isRefund).toBe(false)
  })

  it('falls back to reviewed documents and payslips when Form 1040 withholding is zero', () => {
    const summary = summarizeTaxEstimate({
      taxFacts: facts({
        line9: 100_000,
        line24: 12_000,
        line25d: 0,
        line33: 500,
        line37: 11_500,
      }),
      accountDocuments: [{
        is_reviewed: true,
        form_type: '1099_r',
        parsed_data: { box4_fed_tax: 1_200 },
      } as unknown as TaxDocument],
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
      taxFacts: facts({
        line9: 100_000,
        line24: 12_000,
        line25d: 0,
        line33: 0,
      }),
      accountDocuments: [{
        is_reviewed: true,
        form_type: '1099_misc',
        parsed_data: [{ parsed_data: { federal_tax_withheld: '100' } }],
      } as unknown as TaxDocument],
      w2Documents: [{
        is_reviewed: true,
        parsed_data: { box2_fed_tax: 3_000 },
      } as TaxDocument],
      payslips: [{ ps_fed_tax: 800 } as fin_payslip],
    })

    expect(summary.totalWithheld).toBe(3_100)
  })
})
