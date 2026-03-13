import { fin_payslip_schema } from '@/components/payslip/payslipDbCols'

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
        imp_other: 50,
        imp_legal: 20,
        imp_fitness: 30,
        imp_ltd: 10,
        ps_oasdi: 620,
        ps_medicare: 145,
        ps_fed_tax: 2000,
        ps_fed_tax_addl: 100,
        ps_state_tax: 800,
        ps_state_tax_addl: 50,
        ps_state_disability: 100,
        ps_401k_pretax: 1000,
        ps_401k_aftertax: 200,
        ps_401k_employer: 500,
        ps_fed_tax_refunded: 0,
        ps_payslip_file_hash: 'abc123',
        ps_is_estimated: false,
        ps_comment: 'Test payslip',
        ps_pretax_medical: 150,
        ps_pretax_dental: 20,
        ps_pretax_vision: 10,
        ps_pretax_fsa: 100,
        ps_salary: 8000,
        ps_vacation_payout: 0,
      }
      const result = fin_payslip_schema.safeParse(full)
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
})
