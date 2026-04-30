import currency from 'currency.js'

import { SE_401K_LIMITS } from '@/lib/planning/solo401k'

export interface Solo401kUrlState {
  year: number
  ne: number
  se: number
  w2: number
  catchup: boolean
}

export const AVAILABLE_YEARS: number[] = Object.keys(SE_401K_LIMITS)
  .map(Number)
  .sort((a, b) => b - a)

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

export function parseSolo401kUrlState(search: string, fallbackYear: number = defaultYear()): Solo401kUrlState {
  const params = new URLSearchParams(search)
  const year = parseInt(params.get('year') ?? '', 10)
  return {
    year: AVAILABLE_YEARS.includes(year) ? year : fallbackYear,
    ne: parseDollar(params.get('ne')),
    se: parseDollar(params.get('se')),
    w2: parseDollar(params.get('w2')),
    catchup: params.get('catchup') === '1',
  }
}

export function serializeSolo401kUrlState(state: Solo401kUrlState): string {
  const params = new URLSearchParams()
  params.set('year', String(state.year))
  if (state.ne) {
    params.set('ne', String(state.ne))
  }
  if (state.se) {
    params.set('se', String(state.se))
  }
  if (state.w2) {
    params.set('w2', String(state.w2))
  }
  if (state.catchup) {
    params.set('catchup', '1')
  }
  return params.toString()
}
