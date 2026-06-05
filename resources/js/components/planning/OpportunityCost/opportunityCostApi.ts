import { fetchWrapper } from '@/fetchWrapper'

import type { OpportunityCostInputs, OpportunityCostProjection, SavedCareerJob } from './types'

interface SaveOpportunityCostResponse {
  id: number
  shortCode: string
  shareUrl: string
  projection: OpportunityCostProjection
}

export function computeOpportunityCost(inputs: OpportunityCostInputs): Promise<OpportunityCostProjection> {
  return fetchWrapper.post('/api/financial-planning/opportunity-cost/compute', { inputs }) as Promise<OpportunityCostProjection>
}

export function saveOpportunityCostComparison(inputs: OpportunityCostInputs, shareIncludesCurrent = true): Promise<SaveOpportunityCostResponse> {
  return fetchWrapper.post('/api/financial-planning/opportunity-cost/save', { inputs, shareIncludesCurrent }) as Promise<SaveOpportunityCostResponse>
}

export function updateOpportunityCostComparison(shortCode: string, inputs: OpportunityCostInputs, shareIncludesCurrent = true): Promise<SaveOpportunityCostResponse> {
  return fetchWrapper.patch(`/api/financial-planning/opportunity-cost/s/${shortCode}`, { inputs, shareIncludesCurrent }) as Promise<SaveOpportunityCostResponse>
}

export function claimOpportunityCostComparison(shortCode: string): Promise<SaveOpportunityCostResponse> {
  return fetchWrapper.post(`/api/financial-planning/opportunity-cost/s/${shortCode}/claim`, {}) as Promise<SaveOpportunityCostResponse>
}

export function listSavedCareerJobs(): Promise<{ jobs: SavedCareerJob[] }> {
  return fetchWrapper.get('/api/financial-planning/opportunity-cost/saved-jobs') as Promise<{ jobs: SavedCareerJob[] }>
}
