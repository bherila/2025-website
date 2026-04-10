/**
 * Comprehensive TypeScript types for complete U.S. tax return forms (Form 1040 and all schedules).
 * These types model the IRS tax return structure in detail.
 */

// ============================================================================
// FORM 1040 - U.S. Individual Income Tax Return
// ============================================================================

export interface Form1040Filing {
  /** Filing status: Single, MFJ, MFS, HOH, QW */
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw'
  /** Spouse name (if applicable) */
  spouseName?: string | null
  /** Filer's name */
  name: string
  /** Filer's SSN */
  ssn: string
  /** Spouse's SSN (if applicable) */
  spouseSSN?: string | null
  /** Home address */
  address: string
  /** City, state, ZIP */
  cityStateZip: string
  /** Foreign country/postal code (if applicable) */
  foreignAddressProvince?: string | null
  /** Digital Assets checkbox */
  hasDigitalAssets: boolean
}

export interface Form1040Income {
  /** Line 1a: Wages, salaries, tips (W-2 box 1 total) */
  line1a_wages?: number | null
  /** Line 1b: Household employee wages not on W-2 */
  line1b_householdWages?: number | null
  /** Line 1c: Tip income not reported to employer */
  line1c_unreportedTips?: number | null
  /** Line 1d: Medicaid waiver payments not on W-2 */
  line1d_medicaidWaiverPayments?: number | null
  /** Line 1e: Taxable dependent care benefits from Form 2441 */
  line1e_dependentCareBenefits?: number | null
  /** Line 1f: Employer adoption benefits from Form 8839 */
  line1f_adoptionBenefits?: number | null
  /** Line 1g: Wages from Form 8919 */
  line1g_form8919Wages?: number | null
  /** Line 1h: Other earned income */
  line1h_otherEarnedIncome?: number | null
  /** Line 1z: Total wages (sum of 1a–1h) */
  line1z_totalWages?: number | null
  /** Line 2a: Tax-exempt interest */
  line2a_taxExemptInterest?: number | null
  /** Line 2b: Taxable interest (from Schedule B) */
  line2b_taxableInterest?: number | null
  /** Line 3a: Qualified dividends */
  line3a_qualifiedDividends?: number | null
  /** Line 3b: Ordinary dividends (from Schedule B) */
  line3b_ordinaryDividends?: number | null
  /** Line 4a: IRA distributions (total) */
  line4a_iraDistributionsTotal?: number | null
  /** Line 4b: IRA distributions (taxable) */
  line4b_iraDistributionsTaxable?: number | null
  /** Line 5a: Pensions and annuities (total) */
  line5a_pensionsTotal?: number | null
  /** Line 5b: Pensions and annuities (taxable) */
  line5b_pensionsTaxable?: number | null
  /** Line 6a: Social Security benefits (total) */
  line6a_ssBenefitsTotal?: number | null
  /** Line 6b: Social Security benefits (taxable) */
  line6b_ssBenefitsTaxable?: number | null
  /** Line 7: Capital gain or (loss) from Schedule D */
  line7_capitalGainOrLoss?: number | null
  /** Line 8: Additional income from Schedule 1, line 10 */
  line8_additionalIncome?: number | null
  /** Line 9: Total income (sum of lines 1z through 8) */
  line9_totalIncome?: number | null
}

export interface Form1040Credits {
  /** Line 12a: Amount from line 11a */
  line12a?: number | null
  /** Line 12b: Spouse can claim */
  line12b_spouseCanClaim?: boolean
  /** Line 13a: Qualified business income deduction from Form 8995 */
  line13a_qbid?: number | null
  /** Line 13b: Additional deduction */
  line13b_additionalDeduction?: number | null
  /** Line 14: Add lines 13, 13a, 13b */
  line14_total?: number | null
  /** Line 15: Subtract line 14 from line 12 */
  line15_subtractLine14?: number | null
  /** Line 16: Tax (use instructions) */
  line16_tax?: number | null
  /** Line 17: Amount from Schedule 3, line 3 */
  line17_scheduleAmount?: number | null
  /** Line 18: Check if zero or less */
  line18_checkZero?: boolean
  /** Line 19: Child tax credit from Schedule 8812 */
  line19_childTaxCredit?: number | null
  /** Line 20: Amount from Schedule 3, line 3 */
  line20_scheduleAmount?: number | null
}

export interface Form1040 {
  filing: Form1040Filing
  income: Form1040Income
  credits: Form1040Credits
  /** Tax year */
  taxYear: number
}

// ============================================================================
// SCHEDULE 1 - Additional Income and Adjustments to Income
// ============================================================================

export interface Schedule1PartI {
  /** Line 1: Taxable refunds, credits, or offsets of state and local income taxes */
  line1_taxableRefunds?: number | null
  /** Line 2a: Alimony received */
  line2a_alimonyReceived?: number | null
  /** Line 3: Business income or (loss) - Schedule C */
  line3_businessIncome?: number | null
  /** Line 4: Other gains or (losses) - Schedule D or Form 4797 */
  line4_otherGains?: number | null
  /** Line 5: IRA distributions */
  line5_iraDistributions?: number | null
  /** Line 6: Pensions and annuities */
  line6_pensionsAnnuities?: number | null
  /** Line 7: Rental real estate, royalties, partnerships, S corps, trusts, etc. */
  line7_rentalEtc?: number | null
  /** Line 8: Farm income or (loss) */
  line8_farmIncome?: number | null
  /** Line 9: Total other income */
  line9_totalOtherIncome?: number | null
}

export interface Schedule1PartII {
  /** Line 11: Educator expenses */
  line11_educatorExpenses?: number | null
  /** Line 12: Business expenses of reservists */
  line12_reservistExpenses?: number | null
  /** Line 13: Health savings account deduction */
  line13_hsaDeduction?: number | null
  /** Line 14: Moving expenses for members of the Armed Forces */
  line14_movingExpenses?: number | null
  /** Line 15: Deductible part of self-employment tax */
  line15_selfEmployedTax?: number | null
  /** Line 16: Self-employed SEP, SIMPLE, qualified plans */
  line16_seaPlans?: number | null
  /** Line 17: Self-employed health insurance deduction */
  line17_healthInsurance?: number | null
  /** Line 18: Penalty on early withdrawal of savings */
  line18_penaltyEarlyWithdrawal?: number | null
  /** Line 19a: Alimony paid */
  line19a_alimonyPaid?: number | null
  /** Line 20: IRA deduction */
  line20_iraDeduction?: number | null
  /** Line 21: Student loan interest deduction */
  line21_studentLoanInterest?: number | null
  /** Line 22: Reserved for future use */
  line22_reserved?: number | null
  /** Line 23: Archer MSA deduction */
  line23_archerMSA?: number | null
  /** Line 25: Total other adjustments */
  line25_totalAdjustments?: number | null
  /** Line 26: Total adjustments to income */
  line26_totalAdjustmentsToIncome?: number | null
}

export interface Schedule1 {
  partI: Schedule1PartI
  partII: Schedule1PartII
}

// ============================================================================
// SCHEDULE 2 - Additional Taxes
// ============================================================================

export interface Schedule2PartI {
  /** Line 1a: Excess advance premium tax credit repayment from Form 8962 */
  line1a_premiumTaxCreditRepayment?: number | null
  /** Line 1b: Repayment of new clean vehicle credit(s) */
  line1b_cleanVehicleCredit?: number | null
  /** Line 1d: Recapture of net EPE from Form 4255 */
  line1d_recaptureEPE?: number | null
  /** Line 1e: Excessive payments (EPPs) on gross EPE from Form 4255 */
  line1e_excessivePayments?: number | null
  /** Line 1f: 20% EP from Form 4255 */
  line1f_20PercentEP?: number | null
  /** Line 2: Alternative minimum tax from Form 6251 */
  line2_altMinimumTax?: number | null
}

export interface Schedule2PartII {
  /** Line 4: Self-employment tax from Schedule SE */
  line4_selfEmploymentTax?: number | null
  /** Line 5: Social security and Medicare tax on unreported tip income */
  line5_tipIncome?: number | null
  /** Line 6: Uncollected social security and Medicare tax on wages */
  line6_uncollectedTax?: number | null
  /** Line 8: Additional tax on IRAs or other tax-favored accounts */
  line8_iraAdditionalTax?: number | null
  /** Line 9: Household employment taxes from Schedule H */
  line9_householdEmploymentTax?: number | null
  /** Line 11: Additional Medicare Tax from Form 8959 */
  line11_additionalMedicareTax?: number | null
  /** Line 12: Net investment income tax from Form 8960 */
  line12_netInvestmentIncomeTax?: number | null
}

export interface Schedule2 {
  partI: Schedule2PartI
  partII: Schedule2PartII
}

// ============================================================================
// SCHEDULE 3 - Additional Credits and Payments
// ============================================================================

export interface Schedule3NonrefundableCredits {
  /** Line 1: Foreign tax credit from Form 1116 */
  line1_foreignTaxCredit?: number | null
  /** Line 2: Credit for child and dependent care expenses from Form 2441 */
  line2_childDependentCareCredit?: number | null
  /** Line 3: Education credits from Form 8863 */
  line3_educationCredits?: number | null
  /** Line 4: Retirement savings contributions credit from Form 8880 */
  line4_retirementSavingsCredit?: number | null
  /** Line 5: Residential clean energy credit from Form 5695 */
  line5_cleanEnergyCredit?: number | null
  /** Line 6: Other nonrefundable credits */
  line6_otherNonrefundableCredits?: number | null
}

export interface Schedule3RefundableCredits {
  /** Line 9: Net premium tax credit from Form 8962 */
  line9_netPremiumTaxCredit?: number | null
  /** Line 10: Amount paid with request for extension of time to file */
  line10_extensionPayment?: number | null
  /** Line 11: Excess social security and tier 1 RRTA tax withheld */
  line11_excessSSWithheld?: number | null
  /** Line 12: Credit for federal tax on fuels from Form 4136 */
  line12_fuelCredit?: number | null
  /** Line 13: Other payments or refundable credits */
  line13_otherRefundableCredits?: number | null
}

export interface Schedule3 {
  nonrefundableCredits: Schedule3NonrefundableCredits
  refundableCredits: Schedule3RefundableCredits
}

// ============================================================================
// SCHEDULE A - Itemized Deductions
// ============================================================================

export interface ScheduleAMedicalAndDental {
  /** Line 1: Medical and dental expenses */
  line1_medicalDentalExpenses?: number | null
  /** Line 2: Amount from Form 1040, line 11a */
  line2_form1040Line11a?: number | null
  /** Line 3: Multiply line 2 by 7.5% (0.075) */
  line3_multiply?: number | null
  /** Line 4: Subtract line 3 from line 1 */
  line4_subtract?: number | null
}

export interface ScheduleATaxesPaid {
  /** Line 5a: State and local income taxes */
  line5a_stateTaxes?: number | null
  /** Line 5b: General sales taxes */
  line5b_salesTaxes?: number | null
  /** Line 5d: Add lines 5a through 5c */
  line5d_totalStateLocalTaxes?: number | null
  /** Line 5e: Property taxes */
  line5e_propertyTaxes?: number | null
}

export interface ScheduleAInterestPaid {
  /** Line 8a: Home mortgage interest and points */
  line8a_mortgageInterest?: number | null
  /** Line 8b: Home mortgage interest not reported on Form 1098 */
  line8b_mortgageInterestNotReported?: number | null
  /** Line 9: Investment interest from Form 4952 */
  line9_investmentInterest?: number | null
}

export interface ScheduleA {
  medicalAndDental: ScheduleAMedicalAndDental
  taxesPaid: ScheduleATaxesPaid
  interestPaid: ScheduleAInterestPaid
  /** Line 11: Gifts by cash or check ($250 or more) */
  line11_giftsCashCheck?: number | null
  /** Line 12: Other gifts (not cash/check) */
  line12_otherGifts?: number | null
  /** Line 14: Casualty and theft losses from Form 4684 */
  line14_casualtyTheftLosses?: number | null
  /** Line 16: Other deductions */
  line16_otherDeductions?: number | null
  /** Line 17: Total itemized deductions */
  line17_totalDeductions?: number | null
}

// ============================================================================
// SCHEDULE B - Interest and Ordinary Dividends
// ============================================================================

export interface ScheduleBInterestIncome {
  /** Account details */
  accounts: Array<{
    accountName: string
    amount: number
  }>
  /** Part I Total */
  partITotal?: number | null
  /** Part II Total */
  partIITotal?: number | null
}

export interface ScheduleBOrdinaryDividends {
  /** Dividend accounts */
  accounts: Array<{
    accountName: string
    amount: number
  }>
  /** Qualified dividends */
  qualifiedDividends?: number | null
  /** Part II total */
  partIITotal?: number | null
}

export interface ScheduleB {
  interest: ScheduleBInterestIncome
  dividends: ScheduleBOrdinaryDividends
}

// ============================================================================
// SCHEDULE C - Profit or Loss From Business
// ============================================================================

export interface ScheduleCBusiness {
  /** Name of proprietor or partnership principal owner */
  proprietorName: string
  /** Principal business or profession (include product or service) */
  businessDescription: string
  /** Business name */
  businessName: string
  /** Business address (street, city, state, ZIP) */
  businessAddress: string
  /** Code from IRS instructions */
  businessCode: string
  /** Employer ID Number (EIN) */
  ein?: string | null
}

export interface ScheduleCIncome {
  /** Line 1: Gross receipts or sales */
  line1_grossReceipts?: number | null
  /** Line 2: Returns and allowances */
  line2_returnsAllowances?: number | null
  /** Line 3: Subtract line 2 from line 1 */
  line3_netReceipts?: number | null
  /** Line 4: Cost of goods sold from line 42 */
  line4_cogs?: number | null
  /** Line 5: Gross profit */
  line5_grossProfit?: number | null
  /** Line 6: Other income */
  line6_otherIncome?: number | null
  /** Line 7: Gross income */
  line7_grossIncome?: number | null
}

export interface ScheduleCExpenseItem {
  description: string
  amount: number
}

export interface ScheduleCExpenses {
  /** Line 8: Advertising */
  line8_advertising?: number | null
  /** Line 9: Car and truck expenses */
  line9_carTruckExpenses?: number | null
  /** Line 10: Commissions and fees */
  line10_commissionsAndFees?: number | null
  /** Line 11: Depreciation and section 179 expense deduction */
  line11_depreciation?: number | null
  /** Line 18: Supplies and materials */
  line18_supplies?: number | null
  /** Line 24: Travel and meals */
  line24_travelAndMeals?: number | null
  /** Line 27b: Other expenses (itemized) */
  otherExpenses: ScheduleCExpenseItem[]
  /** Line 27c: Total other expenses */
  line27c_totalOtherExpenses?: number | null
  /** Line 28: Total expenses */
  line28_totalExpenses?: number | null
}

export interface ScheduleC {
  business: ScheduleCBusiness
  income: ScheduleCIncome
  expenses: ScheduleCExpenses
  /** Line 29: Tentative profit or loss */
  line29_tentativeProfit?: number | null
  /** Line 31: Net profit or loss */
  line31_netProfitOrLoss?: number | null
}

// ============================================================================
// SCHEDULE D - Capital Gains and Losses
// ============================================================================

export interface CapitalAssetTransaction {
  /** Description of property */
  description: string
  /** Date acquired (MM/DD/YYYY) */
  dateAcquired: string
  /** Date sold or disposed (MM/DD/YYYY) */
  dateSold: string
  /** Sales price */
  salesPrice: number
  /** Cost or other basis */
  costBasis: number
  /** Gain or (loss) */
  gainOrLoss: number
}

export interface ScheduleD {
  /** Part I: Short-Term Capital Gains and Losses */
  shortTermTransactions?: CapitalAssetTransaction[]
  /** Line 1a: Total for all short-term */
  line1a_shortTermTotal?: number | null
  /** Line 7: Net short-term capital gain or loss */
  line7_netShortTerm?: number | null

  /** Part II: Long-Term Capital Gains and Losses */
  longTermTransactions?: CapitalAssetTransaction[]
  /** Line 8a: Total for all long-term */
  line8a_longTermTotal?: number | null
  /** Line 15: Net long-term capital gain or loss */
  line15_netLongTerm?: number | null

  /** Part III Summary */
  /** Line 16: Combine lines 7 and 15 */
  line16_combinedNetGainOrLoss?: number | null
}

// ============================================================================
// FORM 8949 - Sales and Other Dispositions of Capital Assets
// ============================================================================

export interface Form8949 {
  name: string
  ssn: string
  /** Check A, B, C, D, H or J */
  checkBox: string
  /** Short-term transactions */
  shortTermTransactions?: CapitalAssetTransaction[]
  /** Totals for short-term */
  shortTermTotals?: {
    proceeds: number
    costBasis: number
    gainOrLoss: number
  }
  /** Long-term transactions */
  longTermTransactions?: CapitalAssetTransaction[]
  /** Totals for long-term */
  longTermTotals?: {
    proceeds: number
    costBasis: number
    gainOrLoss: number
  }
}

// ============================================================================
// SCHEDULE E - Supplemental Income or Loss
// ============================================================================

export interface PartnershipIncome {
  /** (a) Name */
  partnershipName: string
  /** (b) EIN */
  ein: string
  /** (c) Check if Section 754 election was made */
  section754Election: boolean
  /** Passive loss allowed */
  passiveLoss?: number | null
  /** Nonpassive income */
  nonpassiveIncome?: number | null
}

export interface ScheduleE {
  /** Part I: Income or Loss From Partnerships and S Corporations */
  partnerships?: PartnershipIncome[]
  /** Part II: Income or Loss From Estates and Trusts */
  estates?: Array<{
    estateName: string
    ein: string
    netIncome: number
  }>
  /** Part III: Income or Loss From Real Estate Mortgage Investment Conduits (REMICs) */
  remics?: Array<{
    remicName: string
    ein: string
    netIncome: number
  }>
  /** Net income or loss from Form 4835 */
  netIncomeOrLoss?: number | null
}

// ============================================================================
// FORM 1116 - Foreign Tax Credit
// ============================================================================

export interface Form1116IncomeCategory {
  /** Category of income: Passive, General, Section 901j, etc. */
  category: string
  /** Name of foreign country or U.S. territory */
  foreignCountry: string
  /** Gross income from sources within country */
  grossIncome: number
  /** Taxes paid or accrued */
  taxesPaidAccrued: number
}

export interface Form1116 {
  name: string
  ssn: string
  taxYear: number
  /** Part I: Taxable Income or Loss From Sources Outside the United States */
  incomeCategories: Form1116IncomeCategory[]
  /** Part II: Foreign Taxes Paid or Accrued */
  taxesPaidAccrued?: number | null
  /** Part III: Figuring the Credit */
  creditCalculated?: number | null
  /** Part IV: Summary of Separate Credits */
  separateCredits?: {
    passiveIncome?: number | null
    generalIncome?: number | null
    sectionIncome?: number | null
  }
}

// ============================================================================
// FORM 4952 - Investment Interest Expense Deduction
// ============================================================================

export interface Form4952 {
  name: string
  ssn: string
  /** Part I: Total Investment Interest Expense */
  totalInvestmentInterestExpense?: number | null
  /** Part II: Net Investment Income */
  grossIncome?: number | null
  qualifiedDividends?: number | null
  netInvestmentGain?: number | null
  netInvestmentIncome?: number | null
  /** Part III: Investment Interest Expense Deduction */
  investmentInterestExpenseDeduction?: number | null
}

// ============================================================================
// FORM 8995-A - Qualified Business Income Deduction
// ============================================================================

export interface Form8995A {
  name: string
  ssn: string
  /** Part I: Trade, Business, or Aggregation Information */
  tradeBusinessName: string
  ein?: string | null
  /** Part II: Determine Your Adjusted Qualified Business Income */
  qualifiedBusinessIncome?: {
    lineA?: number | null
    lineB?: number | null
    lineC?: number | null
  }
  /** Line 16: Total qualified business income component */
  line16_totalQbi?: number | null
  /** Line 33: Taxable income before qualified business income deduction */
  line33_taxableIncome?: number | null
}

// ============================================================================
// FORM 8959 - Additional Medicare Tax
// ============================================================================

export interface Form8959PartI {
  /** Line 1: Medicare wages and tips from Form W-2, box 5 */
  line1_medicareWages?: number | null
  /** Line 2: Unreported tip income from Form 4137 */
  line2_unreportedTips?: number | null
  /** Line 3: Wages from Form 8919 */
  line3_form8919Wages?: number | null
  /** Line 4: Add lines 1 through 3 */
  line4_total?: number | null
  /** Line 5: Enter threshold amount based on filing status */
  line5_threshold?: number | null
  /** Line 6: Subtract line 5 from line 4 */
  line6_subtract?: number | null
  /** Line 7: Additional Medicare Tax on wages */
  line7_additionalMedicareTax?: number | null
}

export interface Form8959PartII {
  /** Line 8: Self-employment income from Schedule SE */
  line8_seIncome?: number | null
  /** Line 9: Amount to enter based on filing status */
  line9_threshold?: number | null
  /** Line 10: Subtract line 9 from line 8 */
  line10_subtract?: number | null
  /** Line 12: Subtract line 11 from line 8 */
  line12_subtract?: number | null
  /** Line 13: Additional Medicare Tax on self-employment income */
  line13_additionalTax?: number | null
}

export interface Form8959 {
  name: string
  ssn: string
  partI?: Form8959PartI
  partII?: Form8959PartII
  /** Part III: Additional Medicare Tax on Railroad Retirement Tax Act */
  partIII?: {
    line14_compensation?: number | null
    line15_threshold?: number | null
    line16_subtract?: number | null
    line17_additionalTax?: number | null
  }
  /** Part IV: Total Additional Medicare Tax */
  line18_totalAdditionalMedicareTax?: number | null
  /** Part V: Withholding Reconciliation */
  withholding?: {
    line19_medicareWithheld?: number | null
    line20_totalMedicareWages?: number | null
    line21_regularMedicareWithholding?: number | null
    line22_additionalMedicareWithholding?: number | null
    line24_totalWithholding?: number | null
  }
}

// ============================================================================
// FORM 8960 - Net Investment Income Tax
// ============================================================================

export interface Form8960PartI {
  /** Line 1: Taxable interest (see instructions) */
  line1_taxableInterest?: number | null
  /** Line 2: Ordinary dividends (see instructions) */
  line2_ordinaryDividends?: number | null
  /** Line 3: Annuities (see instructions) */
  line3_annuities?: number | null
  /** Line 4a: Gross income from property held for investment */
  line4a_grossIncome?: number | null
  /** Line 4b: Adjustment for net income or loss */
  line4b_adjustment?: number | null
  /** Line 4c: Subtract line 4b from line 4a */
  line4c_subtractedIncome?: number | null
  /** Line 5a: Net gain or loss from disposition of property */
  line5a_netGain?: number | null
  /** Line 5c: Net gain or loss (see instructions) */
  line5c_netGainOrLoss?: number | null
  /** Line 5d: Combine lines 5a through 5c */
  line5d_combinedGainOrLoss?: number | null
  /** Line 6: Other modifications to investment income */
  line6_otherModifications?: number | null
  /** Line 8: Total investment income */
  line8_totalInvestmentIncome?: number | null
}

export interface Form8960PartII {
  /** Line 9a: Investment interest expense */
  line9a_interestExpense?: number | null
  /** Line 9b: State, local, and foreign income tax */
  line9b_incomeTax?: number | null
  /** Line 9c: Miscellaneous investment expenses */
  line9c_miscExpenses?: number | null
  /** Line 11: Total deductions and modifications */
  line11_totalDeductions?: number | null
}

export interface Form8960 {
  name: string
  ssn: string
  partI?: Form8960PartI
  partII?: Form8960PartII
  /** Part III: Tax Computation */
  partIII?: {
    line12_netInvestmentIncome?: number | null
    line13_modifiedAgi?: number | null
    line14_threshold?: number | null
    line15_excess?: number | null
    line16_niitForIndividuals?: number | null
    line17_niitForIndividuals?: number | null
  }
  /** Part IV: Net Investment Income Tax for Estates and Trusts */
  niitTax?: number | null
}

// ============================================================================
// FORM 6781 - Gains and Losses From Section 1256 Contracts and Straddles
// ============================================================================

export interface Section1256Contract {
  description: string
  dateEntered?: string | null
  dateClosed?: string | null
  proceeds?: number | null
  costBasis?: number | null
  gainOrLoss?: number | null
}

export interface Form6781 {
  name: string
  ssn: string
  checkboxes?: {
    mixedStraddle?: boolean
    straddle60Percent?: boolean
    mixedStraddleAccount?: boolean
    notSection1256?: boolean
  }
  /** Part I: Section 1256 Contracts Marked to Market */
  section1256Contracts?: Section1256Contract[]
  line1_totalShortTerm?: number | null
  line2_addAmounts?: number | null
  line3_netGainOrLoss?: number | null
  line7_netGainOrLossCombined?: number | null
  line8_shortTermCapitalGain?: number | null
  line9_longTermCapitalGain?: number | null
  /** Part II: Straddles and Section 1092(b) Identified Positions */
  straddles?: Section1256Contract[]
}

// ============================================================================
// FORM 8829 - Expenses for Business Use of Your Home
// ============================================================================

export interface Form8829 {
  name: string
  ssn: string
  /** Part I: Figure Your Allowed Deduction */
  line1_areaUsedForBusiness?: number | null
  line2_squareFootageOfHome?: number | null
  line3_businessPercentage?: number | null
  /** Part II: Figure Your Allowable Deduction */
  line4_indirectOperatingExpenses?: number | null
  line7_totalIndirectExpenses?: number | null
  line8_mealsAndEntertainment?: number | null
  line9_netIndirectExpense?: number | null
  /** Itemized expenses */
  directExpenses?: {
    advertising?: number | null
    utilitiesAndServices?: number | null
    insuranceAndMortgage?: number | null
    repairs?: number | null
    depreciation?: number | null
  }
  /** Part III: Depreciation of Your Home */
  line32_depreciationRate?: number | null
  line38_depreciationDeduction?: number | null
  /** Part IV: Carryover of Unallowed Expenses */
  line42_carryoverExpenses?: number | null
}

// ============================================================================
// FORM 8582 - Passive Activity Loss Limitations
// ============================================================================

export interface PassiveActivityLoss {
  activityName: string
  netIncomeLineIa?: number | null
  netLossLineIb?: number | null
  priorYearsUndisposedLineIc?: number | null
  gainLineId?: number | null
  lossLineIe?: number | null
}

export interface Form8582 {
  name: string
  ssn: string
  /** Part I: 2025 Passive Activity Loss */
  rentalRealEstateIncome?: number | null
  rentalRealEstateLoss?: number | null
  priorYearUndisposedLosses?: number | null
  combinedLosses?: number | null
  /** Part III: Total Losses Allowed */
  otherPassiveActivities?: PassiveActivityLoss[]
  totalLossesAllowed?: number | null
  /** Part IV: Complete This Part Before Part I */
  partIVActivities?: PassiveActivityLoss[]
  /** Part VI: Special Allowances */
  specialAllowances?: number | null
  /** Part VII: Allocation of Unallowed Losses */
  unallowedLosses?: PassiveActivityLoss[]
  /** Part VIII: Allowed Losses */
  allowedLosses?: PassiveActivityLoss[]
  /** Part X: Activities With Losses Reported on Multiple Forms */
  multiFormActivities?: Array<{
    activityName: string
    formsReported: string[]
    totalNetLoss?: number | null
    totalNetIncome?: number | null
    netLossAfterOffset?: number | null
  }>
}

// ============================================================================
// COMPLETE TAX RETURN WRAPPER
// ============================================================================

import type { BrokerConsolidated1099Statement } from './tax-return-broker-statements'
import type { ScheduleK1Form1065 } from './tax-return-k1'
import type {
  CapitalLossCarryoverSmartWorksheet,
  CompareToUSAverages,
  EstimatedTaxPaymentOptions,
  FederalCarryoverWorksheet,
  ForeignTaxCreditComputationWorksheet,
  Form8582ModifiedAGIWorksheet,
  PersonOnReturnWorksheet,
  ScheduleBSmartWorksheet,
  ScheduleCTwoYearComparison,
  ScheduleSEAdjustmentsWorksheet,
  TaxHistoryReport,
  TaxSummary,
} from './tax-return-worksheets'
export type { BrokerConsolidated1099Statement }

export interface CompleteTaxReturn {
  /** Root form: Form 1040 */
  form1040: Form1040
  /** Attached schedules */
  schedule1?: Schedule1
  schedule2?: Schedule2
  schedule3?: Schedule3
  scheduleA?: ScheduleA
  scheduleB?: ScheduleB
  scheduleC?: ScheduleC
  scheduleD?: ScheduleD
  scheduleE?: ScheduleE
  /** Additional IRS forms */
  form8949?: Form8949
  form1116?: Form1116
  form4952?: Form4952
  form8995A?: Form8995A
  form8959?: Form8959
  form8960?: Form8960
  form6781?: Form6781
  form8829?: Form8829
  form8582?: Form8582
  /** Schedule K-1 detail worksheets (one per partnership) */
  schedulesK1?: ScheduleK1Form1065[]
  /** Consolidated broker 1099 statements (one per brokerage account) */
  brokerStatements?: BrokerConsolidated1099Statement[]
  /** Supporting worksheets */
  taxSummary?: TaxSummary
  taxHistoryReport?: TaxHistoryReport
  federalCarryoverWorksheet?: FederalCarryoverWorksheet
  capitalLossCarryoverSmartWorksheet?: CapitalLossCarryoverSmartWorksheet
  form8582ModifiedAGIWorksheet?: Form8582ModifiedAGIWorksheet
  scheduleSEAdjustmentsWorksheet?: ScheduleSEAdjustmentsWorksheet
  scheduleBSmartWorksheet?: ScheduleBSmartWorksheet
  foreignTaxCreditComputationWorksheets?: ForeignTaxCreditComputationWorksheet[]
  estimatedTaxPaymentOptions?: EstimatedTaxPaymentOptions
  scheduleCTwoYearComparison?: ScheduleCTwoYearComparison
  personOnReturn?: PersonOnReturnWorksheet
  compareToUSAverages?: CompareToUSAverages
  /** Tax year */
  taxYear: number
  /** Filing status summary */
  filingStatus: string
  totalIncome?: number | null
  totalDeductions?: number | null
  totalTax?: number | null
}
