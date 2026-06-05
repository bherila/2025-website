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
})

export const rsuGrantSchema = z.object({
  id: z.string(),
  kind: z.enum(['hire', 'refresher']),
  grantDate: z.string(),
  shareCount: z.number().nullish(),
  grantValue: z.number().nullish(),
  grantPrice: z.number().nullish(),
  cliffMonths: z.number(),
  vestingYears: z.number(),
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
  earlyExercise83b: z.boolean().default(false),
})

export const jobSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: companySpecSchema,
  comp: cashCompSchema,
  rsuGrants: z.array(rsuGrantSchema),
  optionGrants: z.array(optionGrantSchema),
  growthBands: equityGrowthBandSchema,
})

export const opportunityCostInputsSchema = z.object({
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
})

export const deltaVsCurrentSchema = z.object({
  jobId: z.string(),
  name: z.string(),
  cashCompDelta: z.number(),
  totalValueDelta: bandedMoneySchema,
})

export const opportunityCostProjectionSchema = z.object({
  startYear: z.number(),
  horizonYears: z.number(),
  currentJobId: z.string().nullable(),
  jobs: z.array(jobProjectionSchema),
  deltasVsCurrent: z.array(deltaVsCurrentSchema),
  warnings: z.array(z.string()),
})

export interface OpportunityCostInitialData {
  inputs: OpportunityCostInputs
  projection: OpportunityCostProjection | null
  authenticated: boolean
}

export type EquityGrowthBand = z.infer<typeof equityGrowthBandSchema>
export type CompanySpec = z.infer<typeof companySpecSchema>
export type CashComp = z.infer<typeof cashCompSchema>
export type RsuGrant = z.infer<typeof rsuGrantSchema>
export type OptionGrant = z.infer<typeof optionGrantSchema>
export type JobSpec = z.infer<typeof jobSpecSchema>
export type OpportunityCostInputs = z.infer<typeof opportunityCostInputsSchema>
export type AnnualProjection = z.infer<typeof annualProjectionSchema>
export type LiquidityPoint = z.infer<typeof liquidityPointSchema>
export type BandedMoney = z.infer<typeof bandedMoneySchema>
export type VestingProjection = z.infer<typeof vestingProjectionSchema>
export type JobProjection = z.infer<typeof jobProjectionSchema>
export type DeltaVsCurrent = z.infer<typeof deltaVsCurrentSchema>
export type OpportunityCostProjection = z.infer<typeof opportunityCostProjectionSchema>
