import currency from 'currency.js'

import { type FilingStatus, RETIREMENT_LIMITS } from '@/lib/planning/solo401k'

export interface RetirementContributionUrlState {
  year: number
  w2Income: number
  w2Pretax: number
  w2RothConversion: number
  includeSe: boolean
  ne: number
  se: number
  catchup: boolean
  filingStatus: FilingStatus
  magi: number
  taxpayerCovered: boolean
  spouseCovered: boolean
  tradIra: number
  rothIra: number
}

export const AVAILABLE_YEARS: number[] = Object.keys(RETIREMENT_LIMITS)
  .map(Number)
  .sort((a, b) => b - a)

const FILING_STATUSES: FilingStatus[] = [
  'single',
  'headOfHousehold',
  'marriedFilingJointly',
  'qualifyingWidow',
  'marriedFilingSeparately',
]

export function defaultYear(currentYear: number = new Date().getFullYear()): number {
  return AVAILABLE_YEARS.includes(currentYear) ? currentYear : AVAILABLE_YEARS[0]!
}

function parseDollar(raw: string | null): number {
  if (!raw) {
    return 0
  }
  const n = currency(raw).value
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

function parseBoolean(raw: string | null, fallback = false): boolean {
  if (raw === null) {
    return fallback
  }

  return raw === '1'
}

function parseFilingStatus(raw: string | null): FilingStatus {
  if (raw !== null && FILING_STATUSES.includes(raw as FilingStatus)) {
    return raw as FilingStatus
  }

  return 'single'
}

export function parseRetirementContributionUrlState(
  search: string,
  fallbackYear: number = defaultYear(),
): RetirementContributionUrlState {
  const params = new URLSearchParams(search)
  const year = parseInt(params.get('year') ?? '', 10)

  return {
    year: AVAILABLE_YEARS.includes(year) ? year : fallbackYear,
    w2Income: parseDollar(params.get('w2Income')),
    w2Pretax: parseDollar(params.get('w2Pretax')),
    w2RothConversion: parseDollar(params.get('w2RothConversion')),
    includeSe: parseBoolean(params.get('includeSe'), true),
    ne: parseDollar(params.get('ne')),
    se: parseDollar(params.get('se')),
    catchup: params.get('catchup') === '1',
    filingStatus: parseFilingStatus(params.get('filingStatus')),
    magi: parseDollar(params.get('magi')),
    taxpayerCovered: parseBoolean(params.get('taxpayerCovered')),
    spouseCovered: parseBoolean(params.get('spouseCovered')),
    tradIra: parseDollar(params.get('tradIra')),
    rothIra: parseDollar(params.get('rothIra')),
  }
}

export function serializeRetirementContributionUrlState(state: RetirementContributionUrlState): string {
  const params = new URLSearchParams()
  params.set('year', String(state.year))
  if (state.w2Income) {
    params.set('w2Income', String(state.w2Income))
  }
  if (state.w2Pretax) {
    params.set('w2Pretax', String(state.w2Pretax))
  }
  if (state.w2RothConversion) {
    params.set('w2RothConversion', String(state.w2RothConversion))
  }
  if (!state.includeSe) {
    params.set('includeSe', '0')
  }
  if (state.ne) {
    params.set('ne', String(state.ne))
  }
  if (state.se) {
    params.set('se', String(state.se))
  }
  if (state.catchup) {
    params.set('catchup', '1')
  }
  if (state.filingStatus !== 'single') {
    params.set('filingStatus', state.filingStatus)
  }
  if (state.magi) {
    params.set('magi', String(state.magi))
  }
  if (state.taxpayerCovered) {
    params.set('taxpayerCovered', '1')
  }
  if (state.spouseCovered) {
    params.set('spouseCovered', '1')
  }
  if (state.tradIra) {
    params.set('tradIra', String(state.tradIra))
  }
  if (state.rothIra) {
    params.set('rothIra', String(state.rothIra))
  }
  return params.toString()
}
