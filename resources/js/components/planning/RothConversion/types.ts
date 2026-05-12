import { z } from 'zod'

export const filingStatusSchema = z.enum([
  'single',
  'married_filing_jointly',
  'head_of_household',
  'qualifying_surviving_spouse',
])

export const conversionModeSchema = z.enum(['constant', 'fill_bracket', 'schedule'])

export const rothConversionStrategySchema = z.object({
  name: z.string().max(80).optional(),
  conversionMode: conversionModeSchema,
  conversionStartAge: z.number(),
  conversionEndAge: z.number(),
  annualConversion: z.number(),
  bracketTarget: z.union([z.literal(12), z.literal(22), z.literal(24), z.literal(32)]),
  perYearConversions: z.record(z.string(), z.number()).default({}),
  harvestLtcg: z.boolean(),
  ltcgTargetRate: z.union([z.literal(0), z.literal(15)]),
  withdrawalOrder: z.string(),
})

export const rothConversionScenarioInputSchema = z.object({
  name: z.string().max(80),
  claimAgePrimary: z.number().optional(),
  claimAgeSpouse: z.number().optional(),
  strategy: rothConversionStrategySchema.partial(),
})

export const rothConversionInputsSchema = z.object({
  currentYear: z.number(),
  filingStatus: filingStatusSchema,
  people: z.object({
    primaryBirthYear: z.number(),
    primaryCurrentAge: z.number(),
    primaryEndAge: z.number(),
    spouseBirthYear: z.number(),
    spouseCurrentAge: z.number(),
    spouseEndAge: z.number(),
    firstDeathAge: z.number().nullable(),
  }),
  income: z.object({
    wagesPrimary: z.number(),
    wagesSpouse: z.number(),
    retirementAgePrimary: z.number(),
    retirementAgeSpouse: z.number(),
    selfEmploymentPrimary: z.number(),
    selfEmploymentSpouse: z.number(),
    interest: z.number(),
    taxExemptInterest: z.number(),
    qualifiedDividends: z.number(),
    longTermCapitalGains: z.number(),
    otherOrdinary: z.number(),
  }),
  socialSecurity: z.object({
    piaPrimary: z.number(),
    piaSpouse: z.number(),
    fraPrimary: z.number(),
    fraSpouse: z.number(),
    claimAgePrimary: z.number(),
    claimAgeSpouse: z.number(),
    colaPercent: z.number(),
  }),
  balances: z.object({
    traditionalPrimary: z.number(),
    traditionalSpouse: z.number(),
    rothPrimary: z.number(),
    rothSpouse: z.number(),
    hsa: z.number(),
    taxableBrokerage: z.number(),
    taxableBasis: z.number(),
    cash: z.number(),
  }),
  strategy: rothConversionStrategySchema,
  scenarios: z.array(rothConversionScenarioInputSchema).max(3),
  assumptions: z.object({
    preRetirementGrowthPercent: z.number(),
    postRetirementGrowthPercent: z.number(),
    cashYieldPercent: z.number(),
    inflationPercent: z.number(),
    stateTaxPercent: z.number(),
    stateTaxesLtcg: z.boolean(),
    deductionMode: z.enum(['standard', 'custom']),
    customDeduction: z.number(),
    discountRatePercent: z.number(),
    priorYearMagi: z.number(),
    twoYearsPriorMagi: z.number(),
  }),
})

export type FilingStatus = z.infer<typeof filingStatusSchema>
export type RothConversionInputs = z.infer<typeof rothConversionInputsSchema>
export type RothConversionStrategy = z.infer<typeof rothConversionStrategySchema>
export type RothConversionScenarioInput = z.infer<typeof rothConversionScenarioInputSchema>

export interface RothConversionScenarioMeta {
  id: number
  shortCode: string
  title: string | null
  shareUrl: string
  ownerUserId: number | null
}

export interface RothConversionInitialData {
  scenario: RothConversionScenarioMeta | null
  inputs: RothConversionInputs
  projection: RothConversionProjection | null
  canEdit: boolean
  authenticated: boolean
}

export interface RothConversionProjection {
  inputs: RothConversionInputs
  scenarios: RothConversionScenarioProjection[]
  warnings: string[]
  reference: RothConversionReference
}

export interface RothConversionScenarioProjection {
  id: string
  name: string
  strategy: Partial<RothConversionStrategy>
  summary: RothConversionSummary
  years: RothConversionYear[]
  socialSecurityBreakeven: RothConversionSsBreakevenRow[]
}

export interface RothConversionSummary {
  lifetimeFederalTax: number
  lifetimeStateTax: number
  lifetimeNiit: number
  lifetimeIrmaa: number
  lifetimeSocialSecurity: number
  presentValueLifetimeTax: number
  presentValueSocialSecurity: number
  finalEstateValue: number
  presentValueFinalEstate: number
  irmaaHitYears: number
  cashShortfallTaxApproximationYears: number
  unfundedCashShortfall: number
}

export interface RothConversionYear {
  calendarYear: number
  primaryAge: number
  spouseAge: number
  filingStatus: FilingStatus
  filingStatusLabel: string
  beginningBalances: RothConversionBalances
  endingBalances: RothConversionBalances
  ordinaryIncomeStack: RothConversionOrdinaryStack
  capitalGainStack: RothConversionCapitalGainStack
  grossSocialSecurity: number
  taxableSocialSecurity: number
  standardOrItemizedDeduction: number
  agi: number
  magi: number
  taxableIncome: number
  federalTax: number
  stateTax: number
  niit: number
  irmaa: number
  irmaaTier: RothConversionIrmaaTier
  totalTax: number
  rmd: number
  rothConversion: number
  cashShortfallWithdrawals: RothConversionCashShortfallWithdrawals
  estateValue: number
}

export interface RothConversionBalances {
  traditional: number
  traditionalPrimary: number
  traditionalSpouse: number
  roth: number
  hsa: number
  taxable: number
  cash: number
}

export interface RothConversionOrdinaryStack {
  wages: number
  selfEmployment: number
  interest: number
  taxExemptInterest: number
  otherOrdinary: number
  rmd: number
  rmdPrimary: number
  rmdSpouse: number
  rothConversion: number
  taxableSocialSecurity: number
}

export interface RothConversionCapitalGainStack {
  qualifiedDividends: number
  recurringLongTermGains: number
  harvestedLongTermGains: number
}

export interface RothConversionIrmaaTier {
  label: string
  minMagi: number
  maxMagi: number | null
  monthlyPartBSurcharge: number
  monthlyPartDSurcharge: number
  annualSurcharge: number
}

export interface RothConversionCashShortfallWithdrawals {
  taxable: number
  roth: number
  traditional: number
  total: number
  unfunded: number
}

export interface RothConversionReference {
  rmdRates: { age: number; divisor: number; rate: number }[]
  socialSecurityTaxation: { provisionalIncome: number; taxablePercent: number }[]
  irmaaTiers: RothConversionIrmaaTier[]
  conversionWindows: { retirementAge: number; yearsUntilRmd73: number }[]
}

export interface RothConversionSsBreakevenRow {
  age: number
  claimAt62: number
  claimAtFra: number
  claimAt70: number
  selectedClaimAge: number
}
