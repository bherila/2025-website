import { z } from 'zod'

import { coerceMoney, coerceNumberLike } from './zod-helpers'

// Basic hydrated schemas for client-portal server-provided payloads
export const UserSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  email: z.string(),
  user_role: z.string().nullable().optional(),
  last_login_date: z.string().nullable().optional(),
})
export type User = z.infer<typeof UserSchema>

export const ProjectSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  tasks_count: z.number().optional(),
  time_entries_count: z.number().optional(),
  created_at: z.string().optional(),
})
export type Project = z.infer<typeof ProjectSchema>

export const AgreementSchema = z.object({
  id: z.coerce.number(),
  active_date: z.string(),
  termination_date: z.string().nullable().optional(),
  client_company_signed_date: z.string().nullable().optional(),
  is_visible_to_client: z.coerce.boolean().optional(),
  monthly_retainer_hours: coerceNumberLike('0'),
  monthly_retainer_fee: coerceMoney('0.00'),
  catch_up_threshold_hours: coerceNumberLike('0').optional(),
  rollover_months: z.coerce.number().optional(),
  hourly_rate: coerceMoney('0.00').optional(),
})
export type Agreement = z.infer<typeof AgreementSchema>

// Minimal FileRecord schema (validate the fields used by portal UI)
export const FileRecordSchema = z.object({
  id: z.coerce.number(),
  original_filename: z.string(),
  human_file_size: z.string().optional(),
  created_at: z.string(),
  download_count: z.number().optional(),
  uploader: z
    .object({ id: z.coerce.number(), name: z.string() })
    .nullable()
    .optional(),
})
export type FileRecord = z.infer<typeof FileRecordSchema>

// Minimal TimeEntry schema for recentTimeEntries used on index page
export const TimeEntrySchema = z.object({
  id: z.coerce.number(),
  name: z.string().nullable().optional(),
  minutes_worked: z.coerce.number().optional(),
  formatted_time: z.string().optional(),
  date_worked: z.string(),
  is_billable: z.coerce.boolean().optional(),
  is_invoiced: z.coerce.boolean().optional(),
  job_type: z.string().optional(),
  user: UserSchema.nullable().optional(),
  project: ProjectSchema.nullable().optional(),
  created_at: z.string().optional(),
})
export type TimeEntry = z.infer<typeof TimeEntrySchema>

// App-level hydration payload (head JSON `#app-initial-data`)
export const AppCompanySchema = z.object({
  id: z.coerce.number(),
  company_name: z.string(),
  slug: z.string(),
})

// Navbar item schemas for server-side encoded nav tree
export const NavItemLinkSchema = z.object({
  type: z.literal('link'),
  label: z.string(),
  href: z.string(),
})
export type NavItemLink = z.infer<typeof NavItemLinkSchema>

export const NavItemGroupSchema = z.object({
  type: z.literal('group'),
  label: z.string(),
})
export type NavItemGroup = z.infer<typeof NavItemGroupSchema>

export const NavItemDividerSchema = z.object({
  type: z.literal('divider'),
})
export type NavItemDivider = z.infer<typeof NavItemDividerSchema>

export type NavDropdownChild = NavItemLink | NavItemGroup | NavItemDivider

const NavDropdownChildSchema: z.ZodType<NavDropdownChild> = z.union([
  NavItemLinkSchema,
  NavItemGroupSchema,
  NavItemDividerSchema,
])

export const NavItemDropdownSchema = z.object({
  type: z.literal('dropdown'),
  label: z.string(),
  items: z.array(NavDropdownChildSchema),
})
export type NavItemDropdown = z.infer<typeof NavItemDropdownSchema>

export type NavItem = NavItemLink | NavItemDropdown
const NavItemSchema: z.ZodType<NavItem> = z.union([NavItemLinkSchema, NavItemDropdownSchema])

export const AppInitialDataSchema = z.object({
  appName: z.string().optional(),
  appUrl: z.string().optional(),
  authenticated: z.coerce.boolean().optional(),
  isAdmin: z.coerce.boolean().optional(),
  clientCompanies: z.array(AppCompanySchema).optional(),
  currentUser: UserSchema.nullable().optional(),
  navItems: z.array(NavItemSchema).optional(),
})
export type AppInitialData = z.infer<typeof AppInitialDataSchema>
