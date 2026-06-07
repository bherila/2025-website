import {
  type MillerColumnSpec,
  type MillerRoute,
  parseHash as parseMillerHash,
  routesEqual as millerRoutesEqual,
  serializeRoute as serializeMillerRoute,
} from '@/components/ui/miller'

import type { CareerCompFormSectionId, GrantType } from './CareerCompForm'

export const CAREER_COMP_RESULT_VIEW_IDS = [
  'liquidity-over-time',
  'annual-fcf',
  'ltv-table',
  'vesting-breakdown',
  'after-tax-liquidity',
  'after-tax-fcf',
] as const

export type CareerCompResultViewId = (typeof CAREER_COMP_RESULT_VIEW_IDS)[number]

export const CAREER_COMP_DETAIL_COLUMN_IDS = ['grant-rsu', 'grant-opt', 'valuation-timeline'] as const

export type CareerCompDetailColumnId = (typeof CAREER_COMP_DETAIL_COLUMN_IDS)[number]
export type CareerCompRouteColumnId = CareerCompFormSectionId | CareerCompResultViewId | CareerCompDetailColumnId
export type CareerCompRoute = MillerRoute<CareerCompRouteColumnId>
export type CareerCompRouteColumn = MillerColumnSpec<CareerCompRouteColumnId>

export const CAREER_COMP_ROUTE_IDS: ReadonlySet<string> = new Set<CareerCompRouteColumnId>([
  'basics',
  'current-job',
  'offers',
  ...CAREER_COMP_RESULT_VIEW_IDS,
  ...CAREER_COMP_DETAIL_COLUMN_IDS,
])

export function parseCareerCompHash(hash: string): CareerCompRoute {
  return parseMillerHash<CareerCompRouteColumnId>(hash, CAREER_COMP_ROUTE_IDS)
}

export function serializeCareerCompRoute(route: CareerCompRoute): string {
  return serializeMillerRoute(route)
}

export function careerCompRoutesEqual(a: CareerCompRoute, b: CareerCompRoute): boolean {
  return millerRoutesEqual(a, b)
}

export function grantRouteId(grantType: GrantType): Extract<CareerCompDetailColumnId, 'grant-rsu' | 'grant-opt'> {
  return grantType === 'rsu' ? 'grant-rsu' : 'grant-opt'
}

export function grantTypeFromRouteId(routeId: CareerCompRouteColumnId): GrantType | null {
  if (routeId === 'grant-rsu') {
    return 'rsu'
  }
  if (routeId === 'grant-opt') {
    return 'opt'
  }
  return null
}

export function grantRouteInstance(jobId: string, grantId?: string): string {
  return grantId ? `${jobId}:${grantId}` : jobId
}

export function parseGrantRouteInstance(instance: string | undefined): { jobId: string; grantId?: string | undefined } | null {
  if (!instance) {
    return null
  }

  const separator = instance.indexOf(':')
  if (separator === -1) {
    return { jobId: instance }
  }

  return {
    jobId: instance.slice(0, separator),
    grantId: instance.slice(separator + 1),
  }
}
