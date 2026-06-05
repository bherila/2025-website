import { fetchWrapper } from '@/fetchWrapper'

import type { CareerCompInputs, CareerCompProjection, SavedCareerJob } from './types'

interface SaveCareerCompResponse {
  id: number
  shortCode: string
  shareUrl: string
  projection: CareerCompProjection
}

export function computeCareerComp(inputs: CareerCompInputs): Promise<CareerCompProjection> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/compute', { inputs }) as Promise<CareerCompProjection>
}

export function saveCareerComparison(inputs: CareerCompInputs, shareIncludesCurrent = true): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post('/api/financial-planning/career-comparison/save', { inputs, shareIncludesCurrent }) as Promise<SaveCareerCompResponse>
}

export function updateCareerComparison(shortCode: string, inputs: CareerCompInputs, shareIncludesCurrent = true): Promise<SaveCareerCompResponse> {
  return fetchWrapper.patch(`/api/financial-planning/career-comparison/s/${shortCode}`, { inputs, shareIncludesCurrent }) as Promise<SaveCareerCompResponse>
}

export function claimCareerComparison(shortCode: string): Promise<SaveCareerCompResponse> {
  return fetchWrapper.post(`/api/financial-planning/career-comparison/s/${shortCode}/claim`, {}) as Promise<SaveCareerCompResponse>
}

export function listSavedCareerJobs(): Promise<{ jobs: SavedCareerJob[] }> {
  return fetchWrapper.get('/api/financial-planning/career-comparison/saved-jobs') as Promise<{ jobs: SavedCareerJob[] }>
}
