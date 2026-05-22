import {
  type MillerColumnSpec,
  type MillerRoute,
  parseHash as parseMillerHash,
  pushColumn as pushMillerColumn,
  replaceFrom as replaceMillerFrom,
  routesEqual as millerRoutesEqual,
  serializeRoute as serializeMillerRoute,
  truncateTo as truncateMillerTo,
} from '@/components/ui/miller'

import type { FormId } from './formRegistry'

export const FORM_IDS: ReadonlySet<string> = new Set<FormId>([
  'home',
  'estimate',
  'action-items',
  'documents',
  'w2-summary',
  'tax-lot-reconciliation',
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

function toMillerColumn(column: ColumnSpec): MillerColumnSpec<FormId> {
  return column.instance ? { id: column.form, instance: column.instance } : { id: column.form }
}

function fromMillerColumn(column: MillerColumnSpec<FormId>): ColumnSpec {
  return column.instance ? { form: column.id, instance: column.instance } : { form: column.id }
}

function toMillerRoute(route: TaxRoute): MillerRoute<FormId> {
  return { columns: route.columns.map(toMillerColumn) }
}

function fromMillerRoute(route: MillerRoute<FormId>): TaxRoute {
  return { columns: route.columns.map(fromMillerColumn) }
}

export function parseHash(hash: string): TaxRoute {
  return fromMillerRoute(parseMillerHash<FormId>(hash, FORM_IDS))
}

export function serializeRoute(route: TaxRoute): string {
  return serializeMillerRoute(toMillerRoute(route))
}

export function pushColumn(route: TaxRoute, column: ColumnSpec): TaxRoute {
  return fromMillerRoute(pushMillerColumn(toMillerRoute(route), toMillerColumn(column)))
}

export function truncateTo(route: TaxRoute, depth: number): TaxRoute {
  return fromMillerRoute(truncateMillerTo(toMillerRoute(route), depth))
}

export function replaceFrom(route: TaxRoute, depth: number, column: ColumnSpec): TaxRoute {
  return fromMillerRoute(replaceMillerFrom(toMillerRoute(route), depth, toMillerColumn(column)))
}

export function routesEqual(a: TaxRoute, b: TaxRoute): boolean {
  return millerRoutesEqual(toMillerRoute(a), toMillerRoute(b))
}
