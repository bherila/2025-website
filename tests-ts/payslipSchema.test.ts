import { fin_payslip_deposit_schema, fin_payslip_schema, fin_payslip_state_data_schema } from '@/components/payslip/payslipDbCols'

describe('fin_payslip_schema', () => {
  const basePayslip = {
    period_start: '2024-01-01',
    period_end: '2024-01-15',
    pay_date: '2024-01-20',
  }

  describe('valid payslip data', () => {
    it('accepts minimal valid payslip', () => {
      const result = fin_payslip_schema.safeParse(basePayslip)
      expect(result.success).toBe(true)
    })

    it('accepts full payslip with all fields', () => {
      const full = {
        ...basePayslip,
        payslip_id: 42,
        earnings_gross: 10000,
        earnings_bonus: 500,
        earnings_net_pay: 7000,
        earnings_rsu: 1500,
        earnings_dividend_equivalent: 200,
        imp_other: 50,
        imp_legal: 20,
        imp_fitness: 30,
        imp_ltd: 10,
        imp_life_choice: 12.8,
        ps_oasdi: 620,
        ps_medicare: 145,
        ps_fed_tax: 2000,
        ps_fed_tax_addl: 100,
        ps_fed_tax_refunded: 0,
        taxable_wages_oasdi: 10609.55,
        taxable_wages_medicare: 10609.55,
        taxable_wages_federal: 7940.83,
        ps_rsu_tax_offset: 213418.91,
        ps_rsu_excess_refund: 1543.81,
        ps_401k_pretax: 1000,
        ps_401k_aftertax: 200,
        ps_401k_employer: 500,
        ps_payslip_file_hash: 'abc123',
        ps_is_estimated: false,
        ps_comment: 'Test payslip',
        ps_pretax_medical: 150,
        ps_pretax_dental: 20,
        ps_pretax_vision: 10,
        ps_pretax_fsa: 100,
        ps_salary: 8000,
        ps_vacation_payout: 0,
        pto_accrued: 6.47,
        pto_used: 8.0,
        pto_available: 235.17,
        pto_statutory_available: 72.0,
        hours_worked: 80.0,
      }
      const result = fin_payslip_schema.safeParse(full)
      expect(result.success).toBe(true)
    })

    it('accepts payslip with state_data and deposits', () => {
      const full = {
        ...basePayslip,
        state_data: [{ state_code: 'CA', state_tax: 800, state_tax_addl: 50, state_disability: 100 }],
        deposits: [{ bank_name: 'Chase', account_last4: '1234', amount: 7000 }],
      }
      const result = fin_payslip_schema.safeParse(full)
      expect(result.success).toBe(true)
    })

    it('accepts other as record', () => {
      const result = fin_payslip_schema.safeParse({ ...basePayslip, other: { custom_field: 'value', amount: 42 } })
      expect(result.success).toBe(true)
    })

    it('coerces string numbers to numbers', () => {
      const result = fin_payslip_schema.safeParse({
        ...basePayslip,
        earnings_gross: '10000.50',
        ps_fed_tax: '2000',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.earnings_gross).toBe(10000.5)
        expect(result.data.ps_fed_tax).toBe(2000)
      }
    })

    it('defaults numeric fields to 0 when missing', () => {
      const result = fin_payslip_schema.safeParse(basePayslip)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.earnings_gross).toBe(0)
        expect(result.data.ps_fed_tax).toBe(0)
        expect(result.data.ps_401k_pretax).toBe(0)
      }
    })

    it('defaults ps_is_estimated to false when missing', () => {
      const result = fin_payslip_schema.safeParse(basePayslip)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.ps_is_estimated).toBe(false)
      }
    })

    it('accepts period_start equal to period_end', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-15',
        period_end: '2024-01-15',
        pay_date: '2024-01-15',
      })
      expect(result.success).toBe(true)
    })

    it('accepts pay_date equal to period_end', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-01',
        period_end: '2024-01-15',
        pay_date: '2024-01-15',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('required field validation', () => {
    it('rejects missing period_start', () => {
      const result = fin_payslip_schema.safeParse({
        period_end: '2024-01-15',
        pay_date: '2024-01-20',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing period_end', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-01',
        pay_date: '2024-01-20',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing pay_date', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-01',
        period_end: '2024-01-15',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty string period_start', () => {
      const result = fin_payslip_schema.safeParse({
        ...basePayslip,
        period_start: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('cross-field date validation', () => {
    it('rejects period_start after period_end', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-20',
        period_end: '2024-01-15',
        pay_date: '2024-01-25',
      })
      expect(result.success).toBe(false)
    })

    it('rejects pay_date before period_end', () => {
      const result = fin_payslip_schema.safeParse({
        period_start: '2024-01-01',
        period_end: '2024-01-15',
        pay_date: '2024-01-10',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('removed flat state columns', () => {
    it('does not have ps_state_tax field', () => {
      const result = fin_payslip_schema.safeParse(basePayslip)
      if (result.success) {
        expect('ps_state_tax' in result.data).toBe(false)
        expect('ps_state_tax_addl' in result.data).toBe(false)
        expect('ps_state_disability' in result.data).toBe(false)
      }
    })
  })

  describe('new fields', () => {
    it('accepts earnings_dividend_equivalent', () => {
      const result = fin_payslip_schema.safeParse({ ...basePayslip, earnings_dividend_equivalent: 569.7 })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.earnings_dividend_equivalent).toBe(569.7)
    })

    it('accepts ps_rsu_tax_offset and ps_rsu_excess_refund as positive', () => {
      const result = fin_payslip_schema.safeParse({
        ...basePayslip,
        ps_rsu_tax_offset: 213418.91,
        ps_rsu_excess_refund: 1543.81,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.ps_rsu_tax_offset).toBe(213418.91)
        expect(result.data.ps_rsu_excess_refund).toBe(1543.81)
      }
    })

    it('accepts taxable wage bases', () => {
      const result = fin_payslip_schema.safeParse({
        ...basePayslip,
        taxable_wages_oasdi: 10609.55,
        taxable_wages_medicare: 10609.55,
        taxable_wages_federal: 7940.83,
      })
      expect(result.success).toBe(true)
    })

    it('accepts PTO and hours fields', () => {
      const result = fin_payslip_schema.safeParse({
        ...basePayslip,
        pto_accrued: 6.47,
        pto_used: 8.0,
        pto_available: 235.17,
        pto_statutory_available: 72.0,
        hours_worked: 80.0,
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('fin_payslip_state_data_schema', () => {
  it('accepts valid state data row', () => {
    const result = fin_payslip_state_data_schema.safeParse({
      state_code: 'CA',
      taxable_wages: 10000,
      state_tax: 800,
      state_tax_addl: 50,
      state_disability: 100,
    })
    expect(result.success).toBe(true)
  })

  it('requires state_code', () => {
    const result = fin_payslip_state_data_schema.safeParse({ state_tax: 800 })
    expect(result.success).toBe(false)
  })
})

describe('fin_payslip_deposit_schema', () => {
  it('accepts valid deposit row', () => {
    const result = fin_payslip_deposit_schema.safeParse({
      bank_name: 'Chase',
      account_last4: '1234',
      amount: 7000,
    })
    expect(result.success).toBe(true)
  })

  it('requires bank_name and amount', () => {
    const result = fin_payslip_deposit_schema.safeParse({ account_last4: '1234' })
    expect(result.success).toBe(false)
  })
})
