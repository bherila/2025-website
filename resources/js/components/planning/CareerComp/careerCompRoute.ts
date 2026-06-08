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
  'after-tax-fcf',
] as const

export type CareerCompResultViewId = (typeof CAREER_COMP_RESULT_VIEW_IDS)[number]

export const CAREER_COMP_LEGACY_RESULT_VIEW_IDS = [
  'after-tax-liquidity',
] as const

export type CareerCompLegacyResultViewId = (typeof CAREER_COMP_LEGACY_RESULT_VIEW_IDS)[number]

export const CAREER_COMP_LTV_DETAIL_COLUMN_IDS = ['ltv-detail', 'ltv-detail-year'] as const
export const CAREER_COMP_LIQUIDITY_DETAIL_COLUMN_IDS = ['liquidity-detail'] as const

export const CAREER_COMP_LTV_METRIC_IDS = [
  'cash-comp',
  'liquid-equity',
  'paper-equity',
  'liquid-total',
  'paper-total',
] as const

export const CAREER_COMP_LTV_BANDS = ['low', 'medium', 'high'] as const
export const CAREER_COMP_LIQUIDITY_MODES = ['preTax', 'afterTax'] as const

export type CareerCompLtvMetric = (typeof CAREER_COMP_LTV_METRIC_IDS)[number]
export type CareerCompLtvBand = (typeof CAREER_COMP_LTV_BANDS)[number]
export type CareerCompLiquidityMode = (typeof CAREER_COMP_LIQUIDITY_MODES)[number]

export interface CareerCompLtvRouteParams {
  jobId: string
  metric: CareerCompLtvMetric
  band: CareerCompLtvBand
  year?: number | undefined
}

export interface CareerCompLiquidityRouteParams {
  jobId: string
  year: number
  band: CareerCompLtvBand
  mode: CareerCompLiquidityMode
}

export const CAREER_COMP_DETAIL_COLUMN_IDS = [
  'job',
  'grant-rsu',
  'grant-opt',
  'offer-notes',
  'valuation-timeline',
  ...CAREER_COMP_LIQUIDITY_DETAIL_COLUMN_IDS,
  ...CAREER_COMP_LTV_DETAIL_COLUMN_IDS,
] as const

export type CareerCompDetailColumnId = (typeof CAREER_COMP_DETAIL_COLUMN_IDS)[number]
export type CareerCompRouteColumnId = CareerCompFormSectionId | CareerCompResultViewId | CareerCompLegacyResultViewId | CareerCompDetailColumnId
export type CareerCompRoute = MillerRoute<CareerCompRouteColumnId>
export type CareerCompRouteColumn = MillerColumnSpec<CareerCompRouteColumnId>

export const CAREER_COMP_ROUTE_IDS: ReadonlySet<string> = new Set<CareerCompRouteColumnId>([
  'basics',
  'model-assumptions',
  'current-job',
  'offers',
  ...CAREER_COMP_RESULT_VIEW_IDS,
  ...CAREER_COMP_LEGACY_RESULT_VIEW_IDS,
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

function isCareerCompLtvMetric(value: string | null): value is CareerCompLtvMetric {
  return CAREER_COMP_LTV_METRIC_IDS.some((metric) => metric === value)
}

function isCareerCompLtvBand(value: string | null): value is CareerCompLtvBand {
  return CAREER_COMP_LTV_BANDS.some((band) => band === value)
}

function isCareerCompLiquidityMode(value: string | null): value is CareerCompLiquidityMode {
  return CAREER_COMP_LIQUIDITY_MODES.some((mode) => mode === value)
}

export function ltvDetailRouteInstance(params: CareerCompLtvRouteParams): string {
  const searchParams = new URLSearchParams({
    jobId: params.jobId,
    metric: params.metric,
    band: params.band,
  })

  if (params.year !== undefined) {
    searchParams.set('year', String(params.year))
  }

  return searchParams.toString()
}

export function parseLtvDetailRouteInstance(instance: string | undefined, options: { requireYear?: boolean } = {}): CareerCompLtvRouteParams | null {
  if (!instance) {
    return null
  }

  const searchParams = new URLSearchParams(instance)
  const jobId = searchParams.get('jobId')
  const metric = searchParams.get('metric')
  const band = searchParams.get('band')

  if (!jobId || !isCareerCompLtvMetric(metric) || !isCareerCompLtvBand(band)) {
    return null
  }

  const yearValue = searchParams.get('year')
  if (yearValue === null) {
    return options.requireYear === true ? null : { jobId, metric, band }
  }

  const year = Number(yearValue)
  if (!Number.isInteger(year)) {
    return null
  }

  return { jobId, metric, band, year }
}

export function liquidityDetailRouteInstance(params: CareerCompLiquidityRouteParams): string {
  return new URLSearchParams({
    jobId: params.jobId,
    year: String(params.year),
    band: params.band,
    mode: params.mode,
  }).toString()
}

export function parseLiquidityDetailRouteInstance(instance: string | undefined): CareerCompLiquidityRouteParams | null {
  if (!instance) {
    return null
  }

  const searchParams = new URLSearchParams(instance)
  const jobId = searchParams.get('jobId')
  const band = searchParams.get('band')
  const mode = searchParams.get('mode')
  const yearValue = searchParams.get('year')
  const year = Number(yearValue)

  if (!jobId || !isCareerCompLtvBand(band) || !isCareerCompLiquidityMode(mode) || yearValue === null || !Number.isInteger(year)) {
    return null
  }

  return { jobId, year, band, mode }
}
