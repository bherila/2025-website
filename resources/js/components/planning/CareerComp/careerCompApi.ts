import { fetchWrapper } from '@/fetchWrapper'

import type { CareerCompInputs, CareerCompProjection, CareerCompWorkflow, JobSpec, RsuGrant } from './types'

interface SaveCareerCompResponse extends CareerCompWorkflow {
  id: number
  projection: CareerCompProjection
}

export function computeCareerComp(inputs: CareerCompInputs): Promise<CareerCompProjection> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/compute', { inputs }) as Promise<CareerCompProjection>
}

/** Autosave the authenticated user's private latest scenario (NULL share code). */
export function saveLatestCareerComparison(inputs: CareerCompInputs): Promise<SaveCareerCompResponse> {
  return fetchWrapper.put('/api/financial-planning/career-comparison/latest', { inputs }) as Promise<SaveCareerCompResponse>
}

/** Fork the current scenario into a new, link-shareable, editable copy (logged-in only). */
export function shareCareerComparison(inputs: CareerCompInputs, shareIncludesCurrent: boolean, expiresAt: string | null = null): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/share', { inputs, shareIncludesCurrent, expiresAt }) as Promise<SaveCareerCompResponse>
}

/** Autosave edits to a shared fork — open to anyone holding the link. */
export function saveSharedCareerComparison(code: string, inputs: CareerCompInputs): Promise<SaveCareerCompResponse> {
  return fetchWrapper.put(`/api/financial-planning/career-comparison/s/${code}`, { inputs }) as Promise<SaveCareerCompResponse>
}

/** Creator-only: set or clear a shared fork's expiration. */
export function updateSharedCareerComparisonExpiration(code: string, expiresAt: string | null): Promise<SaveCareerCompResponse> {
  return fetchWrapper.patch(`/api/financial-planning/career-comparison/s/${code}`, { expiresAt }) as Promise<SaveCareerCompResponse>
}

/** Creator-only: delete a shared fork. */
export function deleteSharedCareerComparison(code: string): Promise<{ deleted: true }> {
  return fetchWrapper.delete(`/api/financial-planning/career-comparison/s/${code}`, {}) as Promise<{ deleted: true }>
}

export function importRsuIntoCurrentJob(currentJob: JobSpec | null): Promise<{ currentJob: JobSpec; importedGrants: RsuGrant[] }> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/latest/import-rsu', { currentJob }) as Promise<{ currentJob: JobSpec; importedGrants: RsuGrant[] }>
}
