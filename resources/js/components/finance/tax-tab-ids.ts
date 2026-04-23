/**
 * Canonical tab ID constants for the Tax Preview page.
 * Used in both TaxPreviewPage (TabsTrigger values) and Form1040Preview (navTab values)
 * to prevent silent mismatches when tab IDs change.
 */
export const TAX_TABS = {
  overview: 'overview',
  w2: 'w2',
  schedules: 'schedules',
  scheduleA: 'schedule-a',
  scheduleE: 'schedule-e',
  scheduleSE: 'schedule-se',
  capitalGains: 'capital-gains',
  form1116: 'form-1116',
  form6251: 'form-6251',
  form8582: 'form-8582',
  form8995: 'form-8995',
  scheduleC: 'schedule-c',
  estimate: 'estimate',
  actionItems: 'action-items',
} as const

export type TaxTabId = (typeof TAX_TABS)[keyof typeof TAX_TABS]
