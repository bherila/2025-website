import type { payslip_table_col } from '../PayslipTable'

export const cols: payslip_table_col[] = [
  { field: 'period_start', title: 'Period Start', hide: false },
  { field: 'period_end', title: 'Period End', hide: false },
  { field: 'pay_date', title: 'Pay Date', hide: false },
  { field: 'ps_comment', title: 'Comment', hide: false },
  {
    field: [
      { field: 'ps_salary', title: '' },
      { field: 'earnings_bonus', title: 'Bonus' },
      { field: 'earnings_rsu', title: 'RSU' },
    ],
    title: 'Wages',
    hide: false,
  },
  {
    field: [
      { field: 'imp_ltd', title: 'LTD' },
      { field: 'imp_legal', title: 'Legal' },
      { field: 'imp_fitness', title: 'Gym' },
      { field: 'ps_vacation_payout', title: 'Vacation Payout' },
      { field: 'imp_other', title: 'Misc' },
    ],
    title: 'Supplemental Wages',
    hide: false,
  },
  { field: 'ps_oasdi', title: 'OASDI', hide: false },
  { field: 'ps_medicare', title: 'Medicare', hide: false },
  {
    field: [
      { field: 'ps_fed_tax', title: '', hide: false },
      { field: 'ps_fed_tax_addl', title: '+', hide: false },
      { field: 'ps_fed_tax_refunded', title: 'Refund', hide: false },
    ],
    title: 'Fed Income Tax',
  },
  {
    field: [
      { field: 'ps_state_tax', title: '', hide: false },
      { field: 'ps_state_tax_addl', title: '+', hide: false },
    ],
    title: 'State Tax',
  },
  { field: 'ps_state_disability', title: 'SDI', hide: false },
  {
    field: [
      { field: 'ps_401k_pretax', title: '', hide: false },
      { field: 'ps_401k_employer', title: '+', hide: false },
    ],
    title: '401K PRETAX',
  },
  { field: 'ps_401k_aftertax', title: '401K AFTAX', hide: false },
  {
    field: [
      { field: 'ps_pretax_medical', title: 'M' },
      { field: 'ps_pretax_dental', title: 'D' },
      { field: 'ps_pretax_vision', title: 'V' },
      { field: 'ps_pretax_fsa', title: 'FSA' },
    ],
    title: 'Benefits PRETAX',
  },
  { field: 'ps_payslip_file_hash', title: 'Payslip File Hash', hide: true },
  {
    field: 'ps_is_estimated',
    title: 'Est?',
  },
  { field: 'earnings_net_pay', title: 'Net Pay' },
  { field: 'other', title: 'Other' },
]
