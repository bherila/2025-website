import { z } from 'zod'

export const equityGrowthBandSchema = z.object({
  lowPct: z.number(),
  mediumPct: z.number(),
  highPct: z.number(),
})

export const companySpecSchema = z.object({
  type: z.enum(['public', 'private']),
  currentSharePrice: z.number(),
  fourNineA: z.number(),
  fullyDilutedShares: z.number(),
  annualDilutionPct: z.number(),
  liquidityDate: z.string().nullish(),
})

export const cashCompSchema = z.object({
  baseSalary: z.number(),
  cashBonus: z.number(),
  // Compounding annual raise applied to base + bonus (0 = no raise). Defaulted for back-compat.
  annualRaisePct: z.number().default(0),
})

export const VESTING_FREQUENCIES = ['monthly', 'quarterly', 'annual'] as const

// Optional with a 'monthly' default so older shared links / saved comparisons that predate the
// field decode to the historical monthly cadence rather than failing validation.
export const vestingFrequencySchema = z.enum(VESTING_FREQUENCIES).default('monthly')

// RSU refresher policy. pctOfBase = 0 disables refreshers; all fields defaulted so older
// links/records that predate this decode cleanly.
export const refresherPolicySchema = z
  .object({
    pctOfBase: z.number().default(0),
    cadenceYears: z.number().default(1),
    firstYearOffset: z.number().default(1),
    vestingYears: z.number().default(4),
    cliffMonths: z.number().default(0),
    vestingFrequency: vestingFrequencySchema,
  })
  .prefault({})

export const rsuGrantSchema = z.object({
  id: z.string(),
  kind: z.enum(['hire', 'refresher']),
  grantDate: z.string(),
  shareCount: z.number().nullish(),
  grantValue: z.number().nullish(),
  grantPrice: z.number().nullish(),
  cliffMonths: z.number(),
  vestingYears: z.number(),
  vestingFrequency: vestingFrequencySchema,
})

export const optionGrantSchema = z.object({
  id: z.string(),
  kind: z.enum(['hire', 'refresher']),
  type: z.enum(['iso', 'nso']),
  grantDate: z.string(),
  shareCount: z.number(),
  strike: z.number(),
  cliffMonths: z.number(),
  vestingYears: z.number(),
  vestingFrequency: vestingFrequencySchema,
  earlyExercise83b: z.boolean().default(false),
})

export const jobSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: companySpecSchema,
  comp: cashCompSchema,
  refresher: refresherPolicySchema,
  rsuGrants: z.array(rsuGrantSchema),
  optionGrants: z.array(optionGrantSchema),
  growthBands: equityGrowthBandSchema,
})

export const careerCompInputsSchema = z.object({
  horizonYears: z.number(),
  startYear: z.number(),
  currentJob: jobSpecSchema.nullable(),
  hypotheticalJobs: z.array(jobSpecSchema),
})

export const annualProjectionSchema = z.object({
  year: z.number(),
  salary: z.number(),
  bonus: z.number(),
  vestedLiquidEquity: z.number(),
  shareSaleProceeds: z.number(),
  exerciseOutlay: z.number(),
  freeCashFlow: z.number(),
})

export const taxFactSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
  sourceType: z.string(),
  taxDocumentId: z.number().nullable(),
  taxDocumentAccountId: z.number().nullable(),
  accountId: z.number().nullable(),
  formType: z.string().nullable(),
  box: z.string().nullable(),
  code: z.string().nullable(),
  routing: z.string().nullable(),
  routingReason: z.string().nullable(),
  notes: z.string().nullable(),
  isReviewed: z.boolean(),
  reviewStatus: z.string(),
  reviewAction: z.string().nullable(),
})

export const form6251SourceEntrySchema = z.object({
  label: z.string(),
  code: z.string(),
  line: z.string(),
  amount: z.number(),
  description: z.string(),
  requiresStatementReview: z.boolean(),
})

export const form6251FactsSchema = z
  .object({
    line1TaxableIncome: z.number(),
    line3OtherAdjustments: z.number(),
    adjustmentTotal: z.number(),
    amti: z.number(),
    tentativeMinTax: z.number(),
    regularTax: z.number(),
    amt: z.number(),
    filingStatus: z.string(),
    sourceEntries: z.array(form6251SourceEntrySchema),
    requiresStatementReview: z.boolean(),
    manualReviewReasons: z.array(z.string()),
  })
  .passthrough()

export const equityCompensationAfterTaxAnnualSchema = z.object({
  year: z.number(),
  taxableCompIncome: z.number(),
  nsoOrdinaryIncome: z.number(),
  isoAmtPreference: z.number(),
  equitySaleProceeds: z.number(),
  estimatedRegularTax: z.number(),
  estimatedAmt: z.number(),
  totalEstimatedTax: z.number(),
  freeCashFlow: z.number(),
  sourceIds: z.array(z.string()),
})

export const equityCompensationAfterTaxSchema = z.object({
  annual: z.array(equityCompensationAfterTaxAnnualSchema),
  lifetime: z.object({
    taxableCompIncome: z.number(),
    nsoOrdinaryIncome: z.number(),
    isoAmtPreference: z.number(),
    equitySaleProceeds: z.number(),
    estimatedRegularTax: z.number(),
    estimatedAmt: z.number(),
    totalEstimatedTax: z.number(),
    freeCashFlow: z.number(),
    totalValue: z.object({
      low: z.number(),
      medium: z.number(),
      high: z.number(),
    }),
  }),
  sources: z.array(taxFactSourceSchema),
  form6251: z.array(
    z.object({
      year: z.number(),
      facts: form6251FactsSchema,
    }),
  ),
})

export const liquidityPointSchema = z.object({
  year: z.number(),
  cumulativeValue: z.number(),
})

export const bandedMoneySchema = z.object({
  low: z.number(),
  medium: z.number(),
  high: z.number(),
})

export const vestingProjectionSchema = z.object({
  grantId: z.string(),
  type: z.enum(['rsu', 'iso', 'nso']),
  year: z.number(),
  vestedShares: z.number(),
  exercisableShares: z.number(),
})

export const jobProjectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  isCurrent: z.boolean(),
  annual: z.array(annualProjectionSchema),
  liquidity: z.object({
    low: z.array(liquidityPointSchema),
    medium: z.array(liquidityPointSchema),
    high: z.array(liquidityPointSchema),
  }),
  vesting: z.array(vestingProjectionSchema),
  lifetime: z.object({
    totalCashComp: z.number(),
    totalEquityValue: bandedMoneySchema,
    totalValue: bandedMoneySchema,
  }),
  afterTax: equityCompensationAfterTaxSchema.optional(),
})

export const deltaVsCurrentSchema = z.object({
  jobId: z.string(),
  name: z.string(),
  cashCompDelta: z.number(),
  totalValueDelta: bandedMoneySchema,
})

export const careerCompProjectionSchema = z.object({
  startYear: z.number(),
  horizonYears: z.number(),
  currentJobId: z.string().nullable(),
  jobs: z.array(jobProjectionSchema),
  deltasVsCurrent: z.array(deltaVsCurrentSchema),
  warnings: z.array(z.string()),
})

export interface CareerComparisonMeta {
  id: number
  /** NULL on the owner's private latest; set only on shared forks. */
  shortCode: string | null
  shareUrl: string | null
  ownerUserId: number | null
  shareIncludesCurrent: boolean
  expiresAt?: string | null
  /** True when the current viewer owns this shared fork (can delete / set expiration). */
  isCreator?: boolean
  title?: string | null
}

export interface CareerCompWorkflow extends CareerComparisonMeta {
  title: string | null
  inputs: CareerCompInputs
  projection: CareerCompProjection | null
  updatedAt: string | null
}

export interface CareerCompInitialData {
  inputs: CareerCompInputs
  projection: CareerCompProjection | null
  authenticated: boolean
  comparison?: CareerComparisonMeta | null
  canEdit?: boolean
}

export type EquityGrowthBand = z.infer<typeof equityGrowthBandSchema>
export type CompanySpec = z.infer<typeof companySpecSchema>
export type CashComp = z.infer<typeof cashCompSchema>
export type VestingFrequency = z.infer<typeof vestingFrequencySchema>
export type RefresherPolicy = z.infer<typeof refresherPolicySchema>
export type RsuGrant = z.infer<typeof rsuGrantSchema>
export type OptionGrant = z.infer<typeof optionGrantSchema>
export type JobSpec = z.infer<typeof jobSpecSchema>
export type CareerCompInputs = z.infer<typeof careerCompInputsSchema>
export type AnnualProjection = z.infer<typeof annualProjectionSchema>
export type TaxFactSource = z.infer<typeof taxFactSourceSchema>
export type Form6251SourceEntry = z.infer<typeof form6251SourceEntrySchema>
export type Form6251Facts = z.infer<typeof form6251FactsSchema>
export type EquityCompensationAfterTaxAnnual = z.infer<typeof equityCompensationAfterTaxAnnualSchema>
export type EquityCompensationAfterTax = z.infer<typeof equityCompensationAfterTaxSchema>
export type LiquidityPoint = z.infer<typeof liquidityPointSchema>
export type BandedMoney = z.infer<typeof bandedMoneySchema>
export type VestingProjection = z.infer<typeof vestingProjectionSchema>
export type JobProjection = z.infer<typeof jobProjectionSchema>
export type DeltaVsCurrent = z.infer<typeof deltaVsCurrentSchema>
export type CareerCompProjection = z.infer<typeof careerCompProjectionSchema>
