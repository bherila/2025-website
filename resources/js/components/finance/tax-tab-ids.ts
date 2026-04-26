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
  schedule1: 'schedule-1',
  schedule2: 'schedule-2',
  schedule3: 'schedule-3',
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

/**
 * Maps legacy tab IDs to Miller-shell form IDs so that `onTabChange`-style
 * callbacks can drill into the column stack instead of switching tabs.
 * Unmapped entries fall back to tab nav (overview/schedules grouping).
 */
export const TAB_TO_FORM_ID: Partial<Record<TaxTabId, string>> = {
  [TAX_TABS.scheduleA]: 'sch-a',
  [TAX_TABS.schedule1]: 'sch-1',
  [TAX_TABS.schedule2]: 'sch-2',
  [TAX_TABS.schedule3]: 'sch-3',
  [TAX_TABS.scheduleE]: 'sch-e',
  [TAX_TABS.scheduleSE]: 'sch-se',
  [TAX_TABS.capitalGains]: 'sch-d',
  [TAX_TABS.form1116]: 'form-1116',
  [TAX_TABS.form6251]: 'form-6251',
  [TAX_TABS.form8582]: 'form-8582',
  [TAX_TABS.form8995]: 'form-8995',
  [TAX_TABS.scheduleC]: 'sch-c',
  [TAX_TABS.actionItems]: 'action-items',
  // Schedule B lives under the "schedules" tab in legacy UI; in dock it's sch-b.
  [TAX_TABS.schedules]: 'sch-b',
}
