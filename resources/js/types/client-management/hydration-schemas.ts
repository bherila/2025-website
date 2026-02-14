import { z } from 'zod'
import { coerceMoney, coerceNumberLike } from './zod-helpers'

// Basic hydrated schemas for client-portal server-provided payloads
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  user_role: z.string().optional(),
  last_login_date: z.string().nullable().optional(),
})
export type User = z.infer<typeof UserSchema>

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  tasks_count: z.number().optional(),
  time_entries_count: z.number().optional(),
  created_at: z.string().optional(),
})
export type Project = z.infer<typeof ProjectSchema>

export const AgreementSchema = z.object({
  id: z.number(),
  active_date: z.string(),
  termination_date: z.string().nullable().optional(),
  client_company_signed_date: z.string().nullable().optional(),
  is_visible_to_client: z.boolean().optional(),
  monthly_retainer_hours: coerceNumberLike('0'),
  monthly_retainer_fee: coerceMoney('0.00'),
  catch_up_threshold_hours: coerceNumberLike('0').optional(),
  rollover_months: z.number().optional(),
  hourly_rate: coerceMoney('0.00').optional(),
})
export type Agreement = z.infer<typeof AgreementSchema>

// Minimal FileRecord schema (validate the fields used by portal UI)
export const FileRecordSchema = z.object({
  id: z.number(),
  original_filename: z.string(),
  human_file_size: z.string().optional(),
  created_at: z.string(),
  download_count: z.number().optional(),
  uploader: z
    .object({ id: z.number(), name: z.string() })
    .nullable()
    .optional(),
})
export type FileRecord = z.infer<typeof FileRecordSchema>

// Minimal TimeEntry schema for recentTimeEntries used on index page
export const TimeEntrySchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  minutes_worked: z.number().optional(),
  formatted_time: z.string().optional(),
  date_worked: z.string(),
  is_billable: z.boolean().optional(),
  is_invoiced: z.boolean().optional(),
  job_type: z.string().optional(),
  user: UserSchema.nullable().optional(),
  project: ProjectSchema.nullable().optional(),
  created_at: z.string().optional(),
})
export type TimeEntry = z.infer<typeof TimeEntrySchema>

// App-level hydration payload (head JSON `#app-initial-data`)
export const AppCompanySchema = z.object({
  id: z.number(),
  company_name: z.string(),
  slug: z.string(),
})

export const AppInitialDataSchema = z.object({
  appName: z.string().optional(),
  appUrl: z.string().optional(),
  authenticated: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  clientCompanies: z.array(AppCompanySchema).optional(),
  currentUser: UserSchema.nullable().optional(),
})
export type AppInitialData = z.infer<typeof AppInitialDataSchema>
