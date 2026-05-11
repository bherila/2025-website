import { fetchWrapper } from '@/fetchWrapper'

import type { RothConversionInputs, RothConversionProjection } from './types'

interface SaveScenarioResponse {
  id: number
  shortCode: string
  shareUrl: string
  projection: RothConversionProjection
}

export function computeRothConversion(inputs: RothConversionInputs): Promise<RothConversionProjection> {
  return fetchWrapper.post('/api/financial-planning/roth-conversion/compute', { inputs }) as Promise<RothConversionProjection>
}

export function saveRothConversionScenario(title: string, inputs: RothConversionInputs): Promise<SaveScenarioResponse> {
  return fetchWrapper.post('/api/financial-planning/roth-conversion/save', { title, inputs }) as Promise<SaveScenarioResponse>
}

export function updateRothConversionScenario(shortCode: string, title: string, inputs: RothConversionInputs): Promise<SaveScenarioResponse> {
  return fetchWrapper.patch(`/api/financial-planning/roth-conversion/s/${shortCode}`, { title, inputs }) as Promise<SaveScenarioResponse>
}
