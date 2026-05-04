import { render, screen } from '@testing-library/react'

import type { fin_payslip } from '../payslipDbCols'
import { PayslipTable } from '../PayslipTable'

jest.mock('@/lib/api', () => ({
  updatePayslipEstimatedStatus: jest.fn(),
}))

const row: fin_payslip = {
  payslip_id: 42,
  period_start: '2026-01-01',
  period_end: '2026-01-15',
  pay_date: '2026-01-19',
  earnings_gross: 5000,
  earnings_bonus: 0,
  earnings_net_pay: 3100,
  earnings_rsu: 0,
  earnings_dividend_equivalent: 0,
  imp_other: 0,
  imp_legal: 0,
  imp_fitness: 0,
  imp_ltd: 0,
  imp_life_choice: 0,
  ps_oasdi: 310,
  ps_medicare: 72.5,
  ps_fed_tax: 800,
  ps_fed_tax_addl: 0,
  ps_fed_tax_refunded: 0,
  taxable_wages_oasdi: 5000,
  taxable_wages_medicare: 5000,
  taxable_wages_federal: 5000,
  ps_rsu_tax_offset: 0,
  ps_rsu_excess_refund: 0,
  ps_401k_pretax: 250,
  ps_401k_aftertax: 0,
  ps_401k_employer: 0,
  ps_pretax_medical: 50,
  ps_pretax_fsa: 0,
  ps_pretax_vision: 0,
  ps_pretax_dental: 0,
  ps_salary: 5000,
  ps_vacation_payout: 0,
  pto_accrued: 0,
  pto_used: 0,
  pto_available: 0,
  pto_statutory_available: 0,
  hours_worked: 80,
  ps_payslip_file_hash: '',
  ps_is_estimated: true,
  ps_comment: '',
  employment_entity_id: null,
  other: {},
  state_data: [{ state_code: 'CA', taxable_wages: 5000, state_tax: 250, state_tax_addl: 0, state_disability: 45 }],
  deposits: [],
}

describe('PayslipTable', () => {
  it('renders the estimate column with an accessible centered checkbox', () => {
    render(<PayslipTable data={[row]} onRowEdited={() => {}} />)

    expect(screen.getByRole('columnheader', { name: /est status/i })).toBeInTheDocument()
    const estimatedCheckbox = screen.getByRole('checkbox', {
      name: /mark payslip 2026-01-19 as estimated/i,
    })

    expect(estimatedCheckbox).toBeChecked()
    expect(estimatedCheckbox.closest('td')).toHaveClass('text-right')
  })
})
