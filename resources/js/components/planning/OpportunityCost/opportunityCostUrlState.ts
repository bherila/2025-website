import currency from 'currency.js'

import { DEFAULT_OPPORTUNITY_COST_INPUTS } from './defaults'
import { normalizeOpportunityCostInputs } from './inputUtils'
import type { JobSpec, OpportunityCostInputs } from './types'

export const QUERY_KEYS = {
  payload: 'oc',
} as const

interface SerializeOpportunityCostUrlStateOptions {
  excludeCurrent?: boolean
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type PartialJsonObject = Record<string, JsonValue>

const MONEY_FIELDS = new Set([
  'currentSharePrice',
  'fourNineA',
  'baseSalary',
  'cashBonus',
  'grantValue',
  'grantPrice',
  'strike',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeMoneyValues(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMoneyValues(entry))
  }
  if (!isRecord(value)) {
    if (MONEY_FIELDS.has(key)) {
      return currency(value as currency.Any).value
    }
    return value
  }

  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, normalizeMoneyValues(entryValue, entryKey)]))
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue)
  }
  return false
}

function diffFromDefaults(value: unknown, defaults: unknown): JsonValue | undefined {
  if (Array.isArray(value)) {
    if (JSON.stringify(value) === JSON.stringify(defaults)) {
      return undefined
    }
    return isJsonValue(value) ? value : undefined
  }

  if (isRecord(value) && isRecord(defaults)) {
    const diff: PartialJsonObject = {}
    for (const [key, entry] of Object.entries(value)) {
      const entryDiff = diffFromDefaults(entry, defaults[key])
      if (entryDiff !== undefined) {
        diff[key] = entryDiff
      }
    }
    return Object.keys(diff).length > 0 ? diff : undefined
  }

  if (Object.is(value, defaults)) {
    return undefined
  }

  return isJsonValue(value) ? value : undefined
}

function applySerializeOptions(inputs: OpportunityCostInputs, options: SerializeOpportunityCostUrlStateOptions): OpportunityCostInputs {
  if (!options.excludeCurrent) {
    return inputs
  }

  return {
    ...inputs,
    currentJob: null,
  }
}

function encodePayload(payload: JsonValue): string {
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

function decodePayload(payload: string): unknown {
  return JSON.parse(decodeURIComponent(atob(payload)))
}

export function parseOpportunityCostUrlState(search: string, base: OpportunityCostInputs = DEFAULT_OPPORTUNITY_COST_INPUTS): OpportunityCostInputs {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const payload = params.get(QUERY_KEYS.payload)
  if (!payload) {
    return normalizeOpportunityCostInputs(base)
  }

  try {
    const decoded = normalizeMoneyValues(decodePayload(payload))
    return normalizeOpportunityCostInputs(isRecord(decoded) ? { ...base, ...decoded } : base)
  } catch {
    return normalizeOpportunityCostInputs(base)
  }
}

export function serializeOpportunityCostUrlState(
  inputs: OpportunityCostInputs,
  options: SerializeOpportunityCostUrlStateOptions = {},
): string {
  const normalizedInputs = applySerializeOptions(normalizeOpportunityCostInputs(inputs), options)
  const defaults = applySerializeOptions(normalizeOpportunityCostInputs(DEFAULT_OPPORTUNITY_COST_INPUTS), options)
  const diff = diffFromDefaults(normalizedInputs, defaults)

  if (!diff) {
    return ''
  }

  const params = new URLSearchParams()
  params.set(QUERY_KEYS.payload, encodePayload(diff))
  return params.toString()
}

export function cloneJobWithId(job: JobSpec, id: string, name: string): JobSpec {
  return {
    ...job,
    id,
    name,
  }
}
