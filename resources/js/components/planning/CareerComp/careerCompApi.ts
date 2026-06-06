import { fetchWrapper } from '@/fetchWrapper'

import type { CareerCompInputs, CareerCompProjection, CareerCompWorkflow, CareerCompWorkflowSummary, JobSpec, RsuGrant, SavedCareerJob } from './types'

interface SaveCareerCompResponse extends CareerCompWorkflow {
  id: number
  shortCode: string
  shareUrl: string
  projection: CareerCompProjection
}

export function computeCareerComp(inputs: CareerCompInputs): Promise<CareerCompProjection> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/compute', { inputs }) as Promise<CareerCompProjection>
}

export function saveCareerComparison(inputs: CareerCompInputs, shareIncludesCurrent = true): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/workflows', { inputs, shareIncludesCurrent }) as Promise<SaveCareerCompResponse>
}

export function updateCareerComparison(id: number, inputs: CareerCompInputs, shareIncludesCurrent = true): Promise<SaveCareerCompResponse> {
  return fetchWrapper.patch(`/api/financial-planning/career-comparison/workflows/${id}`, { inputs, shareIncludesCurrent }) as Promise<SaveCareerCompResponse>
}

export function claimCareerComparison(shortCode: string): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post(`/api/financial-planning/career-comparison/s/${shortCode}/claim`, {}) as Promise<SaveCareerCompResponse>
}

export function listSavedCareerJobs(): Promise<{ jobs: SavedCareerJob[] }> {
  return fetchWrapper.get('/api/financial-planning/career-comparison/saved-jobs') as Promise<{ jobs: SavedCareerJob[] }>
}

export function listCareerCompWorkflows(): Promise<{ workflows: CareerCompWorkflowSummary[] }> {
  return fetchWrapper.get('/api/financial-planning/career-comparison/workflows') as Promise<{ workflows: CareerCompWorkflowSummary[] }>
}

export function getCareerCompWorkflow(id: number): Promise<CareerCompWorkflow> {
  return fetchWrapper.get(`/api/financial-planning/career-comparison/workflows/${id}`) as Promise<CareerCompWorkflow>
}

export function deleteCareerCompWorkflow(id: number): Promise<{ deleted: true }> {
  return fetchWrapper.delete(`/api/financial-planning/career-comparison/workflows/${id}`, {}) as Promise<{ deleted: true }>
}

export function activateCareerCompWorkflow(id: number): Promise<CareerCompWorkflow> {
  return fetchWrapper.post(`/api/financial-planning/career-comparison/workflows/${id}/activate`, {}) as Promise<CareerCompWorkflow>
}

export function shareCareerComparison(inputs: CareerCompInputs, shareIncludesCurrent = true): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/share', { inputs, shareIncludesCurrent }) as Promise<SaveCareerCompResponse>
}

export function importRsuIntoCurrentJob(currentJob: JobSpec | null): Promise<{ currentJob: JobSpec; importedGrants: RsuGrant[] }> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/workflows/import-rsu', { currentJob }) as Promise<{ currentJob: JobSpec; importedGrants: RsuGrant[] }>
}
