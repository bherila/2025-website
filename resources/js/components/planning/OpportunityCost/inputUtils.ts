import { DEFAULT_OPPORTUNITY_COST_INPUTS } from './defaults'
import { type JobSpec, type OpportunityCostInputs,opportunityCostInputsSchema } from './types'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNulls)
  }
  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, stripNulls(entry)]),
  )
}

function mergeDefaults<T>(defaults: T, incoming: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(incoming) ? incoming : defaults) as T
  }
  if (!isRecord(defaults) || !isRecord(incoming)) {
    return (incoming ?? defaults) as T
  }

  const merged: JsonObject = { ...defaults }
  for (const [key, value] of Object.entries(incoming)) {
    const defaultValue = (defaults as JsonObject)[key]
    merged[key] = mergeDefaults(defaultValue, value)
  }

  return merged as T
}

function hasGrantDate(grant: { grantDate: string }): boolean {
  return grant.grantDate.trim() !== ''
}

function normalizeJob(job: JobSpec, fallbackId: string): JobSpec {
  const jobId = job.id.trim() || fallbackId

  return {
    ...job,
    id: jobId,
    name: job.name.trim() || fallbackId,
    company: {
      ...job.company,
      // Optional liquidity date: coerce empty/whitespace to null so the compute body never sends
      // '' (which fails the backend's nullable|date_format:Y-m-d rule with a 422).
      liquidityDate: job.company.liquidityDate && job.company.liquidityDate.trim() !== '' ? job.company.liquidityDate : null,
    },
    // grantDate is a required Y-m-d on the backend; drop incomplete grants so one cleared date does
    // not 422 the whole projection. They remain in the form's raw state for the user to finish.
    rsuGrants: job.rsuGrants.filter(hasGrantDate).map((grant, index) => ({ ...grant, id: grant.id.trim() || `${jobId}-rsu-${index + 1}` })),
    optionGrants: job.optionGrants.filter(hasGrantDate).map((grant, index) => ({ ...grant, id: grant.id.trim() || `${jobId}-opt-${index + 1}` })),
  }
}

export function normalizeOpportunityCostInputs(rawInputs: unknown): OpportunityCostInputs {
  const merged = mergeDefaults(DEFAULT_OPPORTUNITY_COST_INPUTS, stripNulls(rawInputs))
  const parsed = opportunityCostInputsSchema.safeParse(merged)
  const inputs = parsed.success ? parsed.data : DEFAULT_OPPORTUNITY_COST_INPUTS

  return {
    ...inputs,
    horizonYears: Math.min(40, Math.max(1, Math.round(inputs.horizonYears))),
    startYear: Math.max(1900, Math.round(inputs.startYear)),
    currentJob: inputs.currentJob ? normalizeJob(inputs.currentJob, 'current') : null,
    hypotheticalJobs: inputs.hypotheticalJobs.length > 0
      ? inputs.hypotheticalJobs.map((job, index) => normalizeJob(job, `hyp-${index + 1}`))
      : DEFAULT_OPPORTUNITY_COST_INPUTS.hypotheticalJobs,
  }
}
