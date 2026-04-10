/**
 * Canonical tab ID constants for the Tax Preview page.
 * Used in both TaxPreviewPage (TabsTrigger values) and Form1040Preview (navTab values)
 * to prevent silent mismatches when tab IDs change.
 */
export const TAX_TABS = {
  overview: 'overview',
  schedules: 'schedules',
  capitalGains: 'capital-gains',
  form1116: 'form-1116',
  scheduleC: 'schedule-c',
  estimate: 'estimate',
  actionItems: 'action-items',
} as const

export type TaxTabId = (typeof TAX_TABS)[keyof typeof TAX_TABS]
