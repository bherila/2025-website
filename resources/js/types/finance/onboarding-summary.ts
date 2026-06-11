import { z } from 'zod'

export const financeReadinessSectionIdSchema = z.enum([
  'accounts',
  'transactions',
  'documents',
  'employment',
  'payslips',
  'rsu',
  'k1_basis',
  'lots',
  'carryovers',
  'categorization',
  'tax_preview',
])

export const financeReadinessSectionStatusSchema = z.enum([
  'not_started',
  'needs_attention',
  'in_progress',
  'ready',
  'optional',
  'no_access',
])

export const financeActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
  kind: z.enum(['primary', 'secondary']),
  permission: z.string().optional(),
})

export const financeReadinessSectionSchema = z.object({
  id: financeReadinessSectionIdSchema,
  status: financeReadinessSectionStatusSchema,
  title: z.string(),
  summary: z.string(),
  counts: z.record(z.string(), z.number()).optional(),
  actions: z.array(financeActionSchema),
})

export const financeWarningSchema = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  href: z.string().optional(),
})

export const financeOnboardingSummarySchema = z.object({
  year: z.number(),
  availableYears: z.array(z.number()),
  sections: z.array(financeReadinessSectionSchema),
  primaryActions: z.array(financeActionSchema),
  warnings: z.array(financeWarningSchema),
})

export type FinanceReadinessSectionId = z.infer<typeof financeReadinessSectionIdSchema>
export type FinanceReadinessSectionStatus = z.infer<typeof financeReadinessSectionStatusSchema>
export type FinanceAction = z.infer<typeof financeActionSchema>
export type FinanceReadinessSection = z.infer<typeof financeReadinessSectionSchema>
export type FinanceWarning = z.infer<typeof financeWarningSchema>
export type FinanceOnboardingSummary = z.infer<typeof financeOnboardingSummarySchema>
