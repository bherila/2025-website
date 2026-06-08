import { DEFAULT_CAREER_COMP_INPUTS } from './defaults'
import { type CareerCompInputs, careerCompInputsSchema, type JobSpec, type OptionGrant, type RsuGrant } from './types'

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

function normalizeLegacyCurrentJobs(rawInputs: unknown): unknown {
  if (!isRecord(rawInputs)) {
    return rawInputs
  }

  const currentJobs = 'currentJobs' in rawInputs
    ? rawInputs.currentJobs
    : ('currentJob' in rawInputs ? (isRecord(rawInputs.currentJob) ? [rawInputs.currentJob] : []) : undefined)
  const withoutLegacy = Object.fromEntries(Object.entries(rawInputs).filter(([key]) => key !== 'currentJob'))

  return currentJobs === undefined ? withoutLegacy : { ...withoutLegacy, currentJobs }
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

function normalizeGrantDates<T extends RsuGrant | OptionGrant>(grant: T): T {
  return {
    ...grant,
    vestingStartDate: grant.vestingStartDate && grant.vestingStartDate.trim() !== '' ? grant.vestingStartDate : null,
  }
}

function normalizeJob(job: JobSpec, fallbackId: string): JobSpec {
  const jobId = job.id.trim() || fallbackId
  const grantTypes = {
    rsu: job.grantTypes.rsu,
    options: job.grantTypes.options,
  }

  return {
    ...job,
    id: jobId,
    name: job.name.trim() || fallbackId,
    notesMarkdown: job.notesMarkdown && job.notesMarkdown !== '' ? job.notesMarkdown : null,
    archived: job.archived === true,
    startDate: job.startDate && job.startDate.trim() !== '' ? job.startDate : null,
    priorJobResignationDate: job.priorJobResignationDate && job.priorJobResignationDate.trim() !== '' ? job.priorJobResignationDate : null,
    transitionOverride: {
      currentJobNoticeWeeks: job.transitionOverride.currentJobNoticeWeeks,
      timeOffBetweenJobsWeeks: job.transitionOverride.timeOffBetweenJobsWeeks,
    },
    retainedCurrentJobIds: [...new Set(job.retainedCurrentJobIds.map((id) => id.trim()).filter(Boolean))],
    grantTypes,
    company: {
      ...job.company,
      // Optional liquidity date: coerce empty/whitespace to null so the compute body never sends
      // '' (which fails the backend's nullable|date_format:Y-m-d rule with a 422).
      liquidityDate: job.company.liquidityDate && job.company.liquidityDate.trim() !== '' ? job.company.liquidityDate : null,
    },
    refresher: {
      ...job.refresher,
      pctOfBase: grantTypes.rsu ? job.refresher.pctOfBase : 0,
      optionPctOfFullyDilutedShares: grantTypes.options ? job.refresher.optionPctOfFullyDilutedShares : 0,
      optionType: 'iso',
    },
    // grantDate is a required Y-m-d on the backend; drop incomplete grants so one cleared date does
    // not 422 the whole projection. They remain in the form's raw state for the user to finish.
    rsuGrants: grantTypes.rsu
      ? job.rsuGrants.filter(hasGrantDate).map((grant, index) => normalizeGrantDates({ ...grant, id: grant.id.trim() || `${jobId}-rsu-${index + 1}` }))
      : [],
    optionGrants: grantTypes.options
      ? job.optionGrants.filter(hasGrantDate).map((grant, index) => normalizeGrantDates({ ...grant, id: grant.id.trim() || `${jobId}-opt-${index + 1}` }))
      : [],
  }
}

export function normalizeCareerCompInputs(rawInputs: unknown): CareerCompInputs {
  const merged = mergeDefaults(DEFAULT_CAREER_COMP_INPUTS, stripNulls(normalizeLegacyCurrentJobs(rawInputs)))
  const parsed = careerCompInputsSchema.safeParse(merged)
  const inputs = parsed.success ? parsed.data : DEFAULT_CAREER_COMP_INPUTS
  const currentJobs = inputs.currentJobs.map((job, index) => normalizeJob(job, `current-${index + 1}`))
  const currentJobIds = new Set(currentJobs.map((job) => job.id))

  return {
    ...inputs,
    // Clamp to the backend's accepted range (ComputeCareerCompRequest max:30) so a large horizon
    // does not pass client normalization only to 422 on compute.
    horizonYears: Math.min(30, Math.max(1, Math.round(inputs.horizonYears))),
    startYear: Math.max(1900, Math.round(inputs.startYear)),
    currentJobs,
    hypotheticalJobs: inputs.hypotheticalJobs.length > 0
      ? inputs.hypotheticalJobs.map((job, index) => {
          const normalizedJob = normalizeJob(job, `hyp-${index + 1}`)

          return {
            ...normalizedJob,
            retainedCurrentJobIds: normalizedJob.retainedCurrentJobIds.filter((id) => currentJobIds.has(id)),
          }
        })
      : DEFAULT_CAREER_COMP_INPUTS.hypotheticalJobs,
  }
}
