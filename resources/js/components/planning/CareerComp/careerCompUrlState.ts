import currency from 'currency.js'

import { DEFAULT_CAREER_COMP_INPUTS } from './defaults'
import { normalizeCareerCompInputs } from './inputUtils'
import type { CareerCompInputs } from './types'

export const QUERY_KEYS = {
  payload: 'cc',
} as const

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type PartialJsonObject = Record<string, JsonValue>

const MONEY_FIELDS = new Set([
  'currentSharePrice',
  'fourNineA',
  'baseSalary',
  'cashBonus',
  'commonFmv',
  'preferredPostMoneyValuation',
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

function stripUrlOnlyFields(value: unknown, key = ''): unknown {
  if (key === 'notesMarkdown') {
    return null
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripUrlOnlyFields(entry))
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, stripUrlOnlyFields(entryValue, entryKey)]))
  }

  return value
}

function encodePayload(payload: JsonValue): string {
  return btoa(encodeURIComponent(JSON.stringify(payload)))
}

function decodePayload(payload: string): unknown {
  return JSON.parse(decodeURIComponent(atob(payload)))
}

export function parseCareerCompUrlState(search: string, base: CareerCompInputs = DEFAULT_CAREER_COMP_INPUTS): CareerCompInputs {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const payload = params.get(QUERY_KEYS.payload)
  if (!payload) {
    return normalizeCareerCompInputs(base)
  }

  try {
    const decoded = normalizeMoneyValues(decodePayload(payload))
    return normalizeCareerCompInputs(isRecord(decoded) ? { ...base, ...decoded } : base)
  } catch {
    return normalizeCareerCompInputs(base)
  }
}

export function serializeCareerCompUrlState(inputs: CareerCompInputs): string {
  const normalizedInputs = normalizeCareerCompInputs(stripUrlOnlyFields(inputs))
  const defaults = normalizeCareerCompInputs(DEFAULT_CAREER_COMP_INPUTS)
  const diff = diffFromDefaults(normalizedInputs, defaults)

  if (!diff) {
    return ''
  }

  const params = new URLSearchParams()
  params.set(QUERY_KEYS.payload, encodePayload(diff))
  return params.toString()
}
