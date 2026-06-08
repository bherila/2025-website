import { z } from 'zod'

export const equityGrowthBandSchema = z.object({
  lowPct: z.number(),
  mediumPct: z.number(),
  highPct: z.number(),
})

export const modelAssumptionsSchema = z
  .object({
    commonFmvPctOfPreferred: z
      .object({
        stageA: z.number().default(15),
        stageB: z.number().default(25),
        stageC: z.number().default(40),
        bridge: z.number().default(50),
        stageD: z.number().default(65),
        stageE: z.number().default(80),
        liquidityEvent: z.number().default(100),
      })
      .prefault({}),
    tax: z
      .object({
        filingStatus: z.enum(['single', 'mfj']).default('single'),
      })
      .prefault({}),
    careerTransition: z
      .object({
        currentJobNoticeWeeks: z.number().default(2),
        timeOffBetweenJobsWeeks: z.number().default(0),
      })
      .prefault({}),
  })
  .prefault({})

export const valuationScenarioStageSchema = z.object({
  id: z.string().optional(),
  year: z.number(),
  stage: z.string().nullish(),
  preferredPostMoneyValuation: z.number().default(0),
  capitalDilutionPct: z.number().default(0),
  employeePoolDilutionPct: z.number().default(0),
  commonFmv: z.number().default(0),
  commonFmvDiscountPct: z.number().default(0),
  liquidityEvent: z.boolean().default(false),
})

export const valuationScenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcome: z.enum(['low', 'medium', 'high']).default('medium'),
  stages: z.array(valuationScenarioStageSchema),
})

export const companySpecSchema = z.object({
  type: z.enum(['public', 'private']),
  currentSharePrice: z.number(),
  fourNineA: z.number(),
  fullyDilutedShares: z.number(),
  annualDilutionPct: z.number(),
  liquidityDate: z.string().nullish(),
  valuationScenarios: z.array(valuationScenarioSchema).default([]),
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

export const vestingScheduleTrancheSchema = z.object({
  month: z.number(),
  percent: z.number(),
})

export const vestingScheduleSchema = z
  .object({
    type: z.enum(['linear', 'tranches']).default('linear'),
    presetId: z.string().nullish(),
    durationMonths: z.number().nullish(),
    cliffMonths: z.number().nullish(),
    frequency: vestingFrequencySchema.nullish(),
    tranches: z.array(vestingScheduleTrancheSchema).nullish(),
  })
  .nullish()

// RSU refresher policy. pctOfBase = 0 disables refreshers; all fields defaulted so older
// links/records that predate this decode cleanly.
export const refresherPolicySchema = z
  .object({
    pctOfBase: z.number().default(0),
    optionPctOfFullyDilutedShares: z.number().default(0),
    optionType: z.enum(['iso']).default('iso'),
    cadenceYears: z.number().default(1),
    firstYearOffset: z.number().default(1),
    vestingYears: z.number().default(4),
    cliffMonths: z.number().default(0),
    vestingFrequency: vestingFrequencySchema,
  })
  .prefault({})

export const grantTypesSchema = z
  .object({
    rsu: z.boolean().default(true),
    options: z.boolean().default(true),
  })
  .prefault({})

export const transitionOverrideSchema = z
  .object({
    currentJobNoticeWeeks: z.number().nullable().default(null),
    timeOffBetweenJobsWeeks: z.number().nullable().default(null),
  })
  .prefault({})

export const rsuVestingEventSchema = z.object({
  vestDate: z.string(),
  shareCount: z.number(),
  sourceAwardId: z.string().nullish(),
  sourceAwardRowId: z.number().nullish(),
  symbol: z.string().nullish(),
  grantPrice: z.number().nullish(),
  vestPrice: z.number().nullish(),
})

export const rsuGrantSchema = z.object({
  id: z.string(),
  kind: z.enum(['hire', 'refresher']),
  grantDate: z.string(),
  vestingStartDate: z.string().nullish(),
  shareCount: z.number().nullish(),
  grantValue: z.number().nullish(),
  grantPrice: z.number().nullish(),
  cliffMonths: z.number(),
  vestingYears: z.number(),
  vestingFrequency: vestingFrequencySchema,
  vestingSchedule: vestingScheduleSchema,
  vestingEvents: z.array(rsuVestingEventSchema).default([]),
})

export const optionGrantSchema = z.object({
  id: z.string(),
  kind: z.enum(['hire', 'refresher']),
  type: z.enum(['iso', 'nso']),
  grantDate: z.string(),
  vestingStartDate: z.string().nullish(),
  shareCount: z.number(),
  strike: z.number(),
  cliffMonths: z.number(),
  vestingYears: z.number(),
  vestingFrequency: vestingFrequencySchema,
  earlyExercise83b: z.boolean().default(false),
  vestingSchedule: vestingScheduleSchema,
})

export const jobSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  notesMarkdown: z.string().nullish().default(null),
  archived: z.boolean().default(false),
  startDate: z.string().nullish().default(null),
  priorJobResignationDate: z.string().nullish().default(null),
  transitionOverride: transitionOverrideSchema,
  retainedCurrentJobIds: z.array(z.string()).default([]),
  company: companySpecSchema,
  comp: cashCompSchema,
  grantTypes: grantTypesSchema,
  refresher: refresherPolicySchema,
  rsuGrants: z.array(rsuGrantSchema),
  optionGrants: z.array(optionGrantSchema),
  growthBands: equityGrowthBandSchema,
})

export const careerCompInputsSchema = z.object({
  horizonYears: z.number(),
  startYear: z.number(),
  modelAssumptions: modelAssumptionsSchema,
  currentJobs: z.array(jobSpecSchema),
  hypotheticalJobs: z.array(jobSpecSchema),
})

export const annualProjectionSchema = z.object({
  year: z.number(),
  salary: z.number(),
  bonus: z.number(),
  vestedLiquidEquity: z.number(),
  shareSaleProceeds: z.number(),
  equitySaleBasis: z.number().default(0),
  equityCapitalGain: z.number().default(0),
  privateRsuOrdinaryIncome: z.number().optional(),
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
  totalTaxableIncome: z.number().default(0),
  nsoOrdinaryIncome: z.number(),
  isoAmtPreference: z.number(),
  equitySaleProceeds: z.number(),
  equityCapitalGain: z.number().default(0),
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
    totalTaxableIncome: z.number().default(0),
    nsoOrdinaryIncome: z.number(),
    isoAmtPreference: z.number(),
    equitySaleProceeds: z.number(),
    equityCapitalGain: z.number().default(0),
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

export const paperEquityPointSchema = z.object({
  year: z.number(),
  stage: z.string().nullable(),
  preferredPostMoneyValuation: z.number(),
  capitalDilutionPct: z.number(),
  employeePoolDilutionPct: z.number(),
  dilutedOwnershipPct: z.number(),
  commonFmv: z.number(),
  grossOwnershipValue: z.number(),
  rsuOwnershipValue: z.number().optional(),
  optionOwnershipValue: z.number().optional(),
  grossCommonValue: z.number(),
  commonIntrinsicValue: z.number(),
  exerciseCost: z.number(),
  netPaperValue: z.number(),
  liquidityEvent: z.boolean(),
})

export const paperEquityScenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcome: z.enum(['low', 'medium', 'high']),
  points: z.array(paperEquityPointSchema),
  totalNetPaperValue: z.number(),
})

export const paperEquityProjectionSchema = z.object({
  scenarios: z.array(paperEquityScenarioSchema).default([]),
  totalsByOutcome: bandedMoneySchema.default({ low: 0, medium: 0, high: 0 }),
}).default({ scenarios: [], totalsByOutcome: { low: 0, medium: 0, high: 0 } })

export const vestingProjectionSchema = z.object({
  grantId: z.string(),
  type: z.enum(['rsu', 'iso', 'nso']),
  year: z.number(),
  vestedShares: z.number(),
  exercisableShares: z.number(),
  source: z.enum(['projected_refresher']).optional(),
})

export const jobProjectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  isCurrent: z.boolean(),
  componentJobIds: z.array(z.string()).optional(),
  componentJobNames: z.array(z.string()).optional(),
  retainedCurrentJobIds: z.array(z.string()).optional(),
  quitCurrentJobIds: z.array(z.string()).optional(),
  annual: z.array(annualProjectionSchema),
  liquidity: z.object({
    low: z.array(liquidityPointSchema),
    medium: z.array(liquidityPointSchema),
    high: z.array(liquidityPointSchema),
  }),
  paperEquity: paperEquityProjectionSchema,
  vesting: z.array(vestingProjectionSchema),
  lifetime: z.object({
    totalCashComp: z.number(),
    totalEquityValue: bandedMoneySchema,
    totalPaperEquityValue: bandedMoneySchema.default({ low: 0, medium: 0, high: 0 }),
    totalValue: bandedMoneySchema,
    totalPaperValue: bandedMoneySchema.default({ low: 0, medium: 0, high: 0 }),
  }),
  afterTax: equityCompensationAfterTaxSchema.optional(),
})

export const deltaVsCurrentSchema = z.object({
  jobId: z.string(),
  name: z.string(),
  cashCompDelta: z.number(),
  totalValueDelta: bandedMoneySchema,
  totalPaperValueDelta: bandedMoneySchema.default({ low: 0, medium: 0, high: 0 }),
})

export const careerCompProjectionSchema = z.object({
  startYear: z.number(),
  horizonYears: z.number(),
  currentJobId: z.string().nullable(),
  currentJobIds: z.array(z.string()).default([]),
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
export type ModelAssumptions = z.infer<typeof modelAssumptionsSchema>
export type ValuationScenarioStage = z.infer<typeof valuationScenarioStageSchema>
export type ValuationScenario = z.infer<typeof valuationScenarioSchema>
export type CompanySpec = z.infer<typeof companySpecSchema>
export type CashComp = z.infer<typeof cashCompSchema>
export type VestingFrequency = z.infer<typeof vestingFrequencySchema>
export type VestingSchedule = z.infer<typeof vestingScheduleSchema>
export type RefresherPolicy = z.infer<typeof refresherPolicySchema>
export type RsuVestingEvent = z.infer<typeof rsuVestingEventSchema>
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
export type PaperEquityPoint = z.infer<typeof paperEquityPointSchema>
export type PaperEquityScenario = z.infer<typeof paperEquityScenarioSchema>
export type PaperEquityProjection = z.infer<typeof paperEquityProjectionSchema>
export type VestingProjection = z.infer<typeof vestingProjectionSchema>
export type JobProjection = z.infer<typeof jobProjectionSchema>
export type DeltaVsCurrent = z.infer<typeof deltaVsCurrentSchema>
export type CareerCompProjection = z.infer<typeof careerCompProjectionSchema>
