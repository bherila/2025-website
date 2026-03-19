/**
 * Unified tax characteristic registry.
 *
 * Each entry maps a characteristic code to its metadata:
 *   - label:       Human-readable display name
 *   - category:    Grouping key used for UI sections and API grouping
 *   - entityTypes: Which employment-entity types this characteristic applies to (empty = no entity required)
 *
 * SYNC WARNING: This registry MUST be kept in sync with FinAccountTag::TAX_CHARACTERISTICS
 * in app/Models/FinanceTool/FinAccountTag.php. When adding or removing entries here,
 * make the same change in the PHP file and create a database migration to update the
 * ENUM/CHECK constraint (migration files must hardcode values, never reference the registry).
 */

export interface TaxCharacteristicMeta {
  label: string
  category: 'sch_c_income' | 'sch_c_expense' | 'sch_c_home_office' | 'w2_income' | 'other'
  entityTypes: string[] // e.g. ['sch_c'], ['w2'], or [] for none
}

export const TAX_CHARACTERISTICS: Record<string, TaxCharacteristicMeta> = {
  // Schedule C: Income
  business_income: { label: 'Gross receipts or sales (Business Income)', category: 'sch_c_income', entityTypes: ['sch_c'] },
  business_returns: { label: 'Returns and allowances', category: 'sch_c_income', entityTypes: ['sch_c'] },
  // Schedule C: Expense
  sce_advertising: { label: 'Advertising', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_car_truck: { label: 'Car and truck expenses', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_commissions_fees: { label: 'Commissions and fees', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_contract_labor: { label: 'Contract labor', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_depletion: { label: 'Depletion', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_depreciation: { label: 'Depreciation and Section 179 expense', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_employee_benefits: { label: 'Employee benefit programs', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_insurance: { label: 'Insurance (other than health)', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_interest_mortgage: { label: 'Interest (mortgage)', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_interest_other: { label: 'Interest (other)', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_legal_professional: { label: 'Legal and professional services', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_office_expenses: { label: 'Office expenses', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_pension: { label: 'Pension and profit-sharing plans', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_rent_vehicles: { label: 'Rent or lease (vehicles, machinery, equipment)', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_rent_property: { label: 'Rent or lease (other business property)', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_repairs_maintenance: { label: 'Repairs and maintenance', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_supplies: { label: 'Supplies', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_taxes_licenses: { label: 'Taxes and licenses', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_travel: { label: 'Travel', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_meals: { label: 'Meals', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_utilities: { label: 'Utilities', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_wages: { label: 'Wages', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  sce_other: { label: 'Other expenses', category: 'sch_c_expense', entityTypes: ['sch_c'] },
  // Schedule C: Home Office
  scho_rent: { label: 'Rent', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_mortgage_interest: { label: 'Mortgage interest (business-use portion)', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_real_estate_taxes: { label: 'Real estate taxes', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_insurance: { label: 'Homeowners or renters insurance', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_utilities: { label: 'Utilities', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_repairs_maintenance: { label: 'Repairs and maintenance', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_security: { label: 'Security system costs', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_depreciation: { label: 'Depreciation', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_cleaning: { label: 'Cleaning services', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_hoa: { label: 'HOA fees', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  scho_casualty_losses: { label: 'Casualty losses (business-use portion)', category: 'sch_c_home_office', entityTypes: ['sch_c'] },
  // Non-Schedule C (no employment entity required)
  interest: { label: 'Interest', category: 'other', entityTypes: [] },
  ordinary_dividend: { label: 'Ordinary Dividend', category: 'other', entityTypes: [] },
  qualified_dividend: { label: 'Qualified Dividend', category: 'other', entityTypes: [] },
  other_ordinary_income: { label: 'Other Ordinary Income', category: 'other', entityTypes: [] },
  // W-2 income items
  w2_wages: { label: 'W-2 Wages / Salary', category: 'w2_income', entityTypes: ['w2'] },
  w2_other_comp: { label: 'W-2 Other Compensation', category: 'w2_income', entityTypes: ['w2'] },
}

/** UI group labels for each category */
export const CATEGORY_LABELS: Record<string, string> = {
  sch_c_income: 'Schedule C: Income',
  sch_c_expense: 'Schedule C: Expense',
  sch_c_home_office: 'Schedule C: Home Office Item',
  w2_income: 'W-2 Income',
  other: 'Other Income / Investments',
}

/** Get options for a specific category as { value, label } pairs */
export function optionsByCategory(category: string): { value: string; label: string }[] {
  return Object.entries(TAX_CHARACTERISTICS)
    .filter(([, meta]) => meta.category === category)
    .map(([value, meta]) => ({ value, label: meta.label }))
}

/** All tax characteristic options as { value, label } pairs */
export function allOptions(): { value: string; label: string }[] {
  return Object.entries(TAX_CHARACTERISTICS).map(([value, meta]) => ({ value, label: meta.label }))
}

/** Get options filtered to characteristics applicable to a given entity type */
export function optionsForEntityType(entityType: string | null): { value: string; label: string }[] {
  return Object.entries(TAX_CHARACTERISTICS)
    .filter(([, meta]) => {
      if (!entityType) return meta.entityTypes.length === 0
      return meta.entityTypes.includes(entityType)
    })
    .map(([value, meta]) => ({ value, label: meta.label }))
}

/** Get grouped options filtered to characteristics applicable to a given entity type.
 * Categories are derived from the registry — no hardcoded list needed. */
export function groupedOptionsForEntityType(entityType: string | null): Array<{ label: string; options: { value: string; label: string }[] }> {
  // Collect matching entries from the registry
  const entries = Object.entries(TAX_CHARACTERISTICS).filter(([, meta]) => {
    if (!entityType) return meta.entityTypes.length === 0
    return meta.entityTypes.includes(entityType)
  })

  // Group by category, preserving CATEGORY_ORDER
  const byCategory = new Map<string, Array<{ value: string; label: string }>>()
  for (const [value, meta] of entries) {
    const existing = byCategory.get(meta.category) ?? []
    existing.push({ value, label: meta.label })
    byCategory.set(meta.category, existing)
  }

  return CATEGORY_ORDER
    .filter((cat) => byCategory.has(cat))
    .map((cat) => ({ label: CATEGORY_LABELS[cat] ?? cat, options: byCategory.get(cat)! }))
}

/** Check if a tax characteristic requires a Schedule C employment entity */
export function isScheduleCCharacteristic(value: string | null | undefined): boolean {
  if (!value || value === 'none') return false
  const meta = TAX_CHARACTERISTICS[value]
  return !!meta && meta.entityTypes.includes('sch_c')
}

/** Get the entity type required by a tax characteristic (null = none required) */
export function requiredEntityType(value: string | null | undefined): string | null {
  if (!value || value === 'none') return null
  const meta = TAX_CHARACTERISTICS[value]
  if (!meta || meta.entityTypes.length === 0) return null
  return meta.entityTypes[0] ?? null
}

/** Get the label for a tax characteristic code */
export function getLabel(code: string): string {
  return TAX_CHARACTERISTICS[code]?.label ?? code
}

/** Ordered category keys for UI grouping */
export const CATEGORY_ORDER = ['sch_c_income', 'sch_c_expense', 'sch_c_home_office', 'w2_income', 'other'] as const
