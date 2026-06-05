import { fetchWrapper } from '@/fetchWrapper'

import type { OpportunityCostInputs, OpportunityCostProjection } from './types'

interface SaveOpportunityCostResponse {
  id: number
  shortCode: string
  shareUrl: string
  projection: OpportunityCostProjection
}

export function computeOpportunityCost(inputs: OpportunityCostInputs): Promise<OpportunityCostProjection> {
  return fetchWrapper.post('/api/financial-planning/opportunity-cost/compute', { inputs }) as Promise<OpportunityCostProjection>
}

export function saveOpportunityCostScenario(title: string, inputs: OpportunityCostInputs): Promise<SaveOpportunityCostResponse> {
  return fetchWrapper.post('/api/financial-planning/opportunity-cost/save', { title, inputs }) as Promise<SaveOpportunityCostResponse>
}

export function updateOpportunityCostScenario(shortCode: string, title: string, inputs: OpportunityCostInputs): Promise<SaveOpportunityCostResponse> {
  return fetchWrapper.patch(`/api/financial-planning/opportunity-cost/s/${shortCode}`, { title, inputs }) as Promise<SaveOpportunityCostResponse>
}
