import type { FormId } from './formRegistry'

const FORM_IDS: ReadonlySet<string> = new Set<FormId>([
  'home',
  'estimate',
  'action-items',
  'documents',
  'form-1040',
  'sch-1',
  'sch-2',
  'sch-3',
  'sch-a',
  'sch-b',
  'sch-c',
  'sch-d',
  'sch-e',
  'sch-se',
  'form-1116',
  'form-4797',
  'form-4952',
  'form-6251',
  'form-8582',
  'form-8606',
  'form-8949',
  'form-8995',
  'wks-se-401k',
  'wks-amt-exemption',
  'wks-taxable-ss',
])

export interface ColumnSpec {
  form: FormId
  instance?: string
}

export interface TaxRoute {
  columns: ColumnSpec[]
}

export const EMPTY_ROUTE: TaxRoute = { columns: [] }

/**
 * Parse a hash string into a TaxRoute. Accepts forms like:
 *   ""                                    → home (empty route)
 *   "#/"                                  → home
 *   "#/form-1040"                         → 1040
 *   "#/form-1040/sch-1/form-1116:passive" → 1040 → Sch 1 → 1116 (passive)
 *   "#/form-1040/sch-e:3"                 → 1040 → Sch E (DB id 3)
 *
 * Unknown form ids are silently dropped to prevent crashes from stale links.
 */
export function parseHash(hash: string): TaxRoute {
  if (!hash) {
    return EMPTY_ROUTE
  }
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash
  const path = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  if (!path) {
    return EMPTY_ROUTE
  }
  const segments = path.split('/').filter(Boolean)
  const columns: ColumnSpec[] = []
  for (const segment of segments) {
    const [rawForm, rawInstance] = segment.split(':')
    if (rawForm === undefined || !FORM_IDS.has(rawForm)) {
      continue
    }
    const column: ColumnSpec = { form: rawForm as FormId }
    if (rawInstance) {
      column.instance = decodeURIComponent(rawInstance)
    }
    columns.push(column)
  }
  return { columns }
}

/**
 * Serialize a TaxRoute back into a hash string. Empty route → "".
 */
export function serializeRoute(route: TaxRoute): string {
  if (route.columns.length === 0) {
    return ''
  }
  const segments = route.columns.map((col) => {
    if (col.instance !== undefined) {
      return `${col.form}:${encodeURIComponent(col.instance)}`
    }
    return col.form
  })
  return `#/${segments.join('/')}`
}

/**
 * Push a new column onto the route, appending to the rightmost position.
 */
export function pushColumn(route: TaxRoute, column: ColumnSpec): TaxRoute {
  return { columns: [...route.columns, column] }
}

/**
 * Truncate the route to the first `depth` columns.
 * truncateTo({columns: [a,b,c]}, 1) → {columns: [a]}
 * truncateTo({columns: [a,b,c]}, 0) → {columns: []}
 */
export function truncateTo(route: TaxRoute, depth: number): TaxRoute {
  if (depth < 0) {
    return EMPTY_ROUTE
  }
  if (depth >= route.columns.length) {
    return route
  }
  return { columns: route.columns.slice(0, depth) }
}

/**
 * Replace the column at `depth`, dropping everything to the right of it.
 * Used when the user drills into a different child from a parent column.
 */
export function replaceFrom(route: TaxRoute, depth: number, column: ColumnSpec): TaxRoute {
  if (depth < 0) {
    return { columns: [column] }
  }
  return { columns: [...route.columns.slice(0, depth), column] }
}

/**
 * Returns true when the two routes describe the same column stack.
 */
export function routesEqual(a: TaxRoute, b: TaxRoute): boolean {
  if (a.columns.length !== b.columns.length) {
    return false
  }
  for (let i = 0; i < a.columns.length; i++) {
    const colA = a.columns[i]!
    const colB = b.columns[i]!
    if (colA.form !== colB.form) {
      return false
    }
    if (colA.instance !== colB.instance) {
      return false
    }
  }
  return true
}
