import { fetchWrapper } from '@/fetchWrapper'

import type { SaveToonResponse } from './types'

export function saveToonDocument(title: string | null, toonContent: string): Promise<SaveToonResponse> {
  return fetchWrapper.post('/api/tools/toon-json/save', {
    title,
    toon_content: toonContent,
  }) as Promise<SaveToonResponse>
}

export function updateToonDocument(shortCode: string, title: string | null, toonContent: string): Promise<SaveToonResponse> {
  return fetchWrapper.patch(`/api/tools/toon-json/s/${shortCode}`, {
    title,
    toon_content: toonContent,
  }) as Promise<SaveToonResponse>
}
