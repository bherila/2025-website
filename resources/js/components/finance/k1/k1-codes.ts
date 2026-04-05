/**
 * Complete code definitions for K-1 coded boxes (11, 13–20).
 *
 * Each export is a Record<code, description> used both in the UI (dropdowns,
 * detail modals) and in the GenAI tool definition to guide extraction.
 *
 * Source: IRS Schedule K-1 (Form 1065) instructions.
 */

export const BOX11_CODES: Record<string, string> = {
  A: 'Other portfolio income (loss)',
  B: 'Involuntary conversions',
  C: 'Section 1256 contracts & straddles',
  D: 'Mining exploration costs recapture',
  E: 'Cancellation of debt',
  F: 'Other income (loss)',
}

export const BOX13_CODES: Record<string, string> = {
  A: 'Cash contributions (50%)',
  B: 'Cash contributions (30%)',
  C: 'Noncash contributions (50%)',
  D: 'Noncash contributions (30%)',
  E: 'Capital loss limitation',
  F: 'Section 59(e)(2) expenditures',
  G: 'Investment interest expense',
  H: 'Deductions—royalty income',
  I: 'Section 691(c) deduction',
  J: 'Section 59A(e) payments',
  K: 'Deductions—portfolio (2% floor)',
  L: 'Deductions—portfolio (no 2% floor)',
  M: 'Deductions—rental real estate',
  N: 'Deductions—other rental',
  O: 'Reforestation amortization',
  P: 'Preproductive period expenses',
  Q: 'Commercial revitalization deduction',
  R: 'Reforestation expense deduction',
  S: 'Domestic production activities',
  T: 'Excess business interest expense',
  U: 'Excess business interest income',
  V: 'Excess taxable income',
  W: 'Other deductions',
}

export const BOX14_CODES: Record<string, string> = {
  A: 'Net earnings (loss) from self-employment',
  B: 'Gross farming or fishing income',
  C: 'Gross non-farm income',
}

export const BOX15_CODES: Record<string, string> = {
  A: 'Low-income housing credit (section 42(j)(5))',
  B: 'Low-income housing credit (other)',
  C: 'Qualified rehabilitation expenditures',
  D: 'Other rental real estate credits',
  E: 'Other rental credits',
  F: 'Undistributed capital gains credit',
  G: 'Biofuel producer credit',
  H: 'Work opportunity credit',
  I: 'Disabled access credit',
  J: 'Empowerment zone employment credit',
  K: 'Credit for increasing research activities',
  L: 'Credit for employer social security & Medicare taxes',
  M: 'Backup withholding',
  N: 'Credit for small employer pension plan startup costs',
  O: 'Credit for employer-provided childcare',
  P: 'Credit for small employer health insurance premiums',
  Q: 'Alternative motor vehicle credit',
  R: 'Alternative fuel vehicle refueling property credit',
  S: 'Qualified plug-in electric drive motor vehicle credit',
  T: 'Other credits',
}

export const BOX16_CODES: Record<string, string> = {
  A: 'Name of country',
  B: 'Gross income—passive category',
  C: 'Gross income—general category',
  D: 'Gross income—other',
  E: 'Foreign branch category income',
  F: 'Passive category deductions',
  G: 'General category deductions',
  H: 'Other deductions',
  I: 'Foreign taxes paid or accrued',
  J: 'Foreign taxes withheld at source',
  K: 'Foreign tax carryover',
  L: 'Reduction in foreign tax credit',
  M: 'Foreign-derived intangible income (FDII)',
  N: 'Global intangible low-taxed income (GILTI)',
  O: 'Section 250 deduction',
  P: 'Other foreign information',
}

export const BOX17_CODES: Record<string, string> = {
  A: 'Post-1986 depreciation adjustment',
  B: 'Adjusted gain or loss',
  C: 'Depletion (other than oil & gas)',
  D: 'Oil, gas, & geothermal depletion',
  E: 'Alternative minimum tax adjustment',
  F: 'Tax-exempt interest income',
  G: 'Other AMT items',
  H: 'Passive activity loss adjustment',
}

export const BOX18_CODES: Record<string, string> = {
  A: 'Tax-exempt income',
  B: 'Nondeductible expenses',
  C: 'Preproductive period expenses',
}

export const BOX19_CODES: Record<string, string> = {
  A: 'Cash distributions',
  B: 'Property distributions',
  C: 'Guaranteed payments',
}

export const BOX20_CODES: Record<string, string> = {
  A: 'Investment income',
  B: 'Investment expenses',
  C: 'Fuel tax credit information',
  D: 'Qualified rehabilitation expenditures',
  E: 'Basis of energy property',
  F: 'Recapture of low-income housing credit',
  G: 'Recapture of investment credit',
  H: 'Recapture of other credits',
  I: 'Lookback interest—completed long-term contracts',
  J: 'Lookback interest—income forecast method',
  K: 'Dispositions of property with section 179 deduction',
  L: 'Section 453A(c) information',
  M: 'Section 453A(b) interest',
  N: 'Section 1260(b) information',
  O: 'Section 1260(b) interest',
  P: 'Section 751 gain (loss)',
  Q: 'Section 1(h)(5) gain (loss)',
  R: 'Recharacterization of income',
  S: 'Qualified opportunity fund (QOF) information',
  T: 'Excess business loss limitation',
  U: 'Section 163(j) information',
  V: 'Section 199A information',
  W: 'Section 1061 information',
  X: 'Foreign investment reporting',
  Y: 'Dispositions of partnership interest',
  Z: 'Other information',
}

/** All coded-box definitions in one lookup keyed by box number. */
export const ALL_K1_CODES: Record<string, Record<string, string>> = {
  '11': BOX11_CODES,
  '13': BOX13_CODES,
  '14': BOX14_CODES,
  '15': BOX15_CODES,
  '16': BOX16_CODES,
  '17': BOX17_CODES,
  '18': BOX18_CODES,
  '19': BOX19_CODES,
  '20': BOX20_CODES,
}
