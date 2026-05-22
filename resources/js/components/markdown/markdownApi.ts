import { fetchWrapper } from '@/fetchWrapper'

import type { SaveMarkdownResponse } from './types'

export function saveMarkdownDocument(title: string | null, markdownContent: string): Promise<SaveMarkdownResponse> {
  return fetchWrapper.post('/api/tools/markdown/save', {
    title,
    markdown_content: markdownContent,
  }) as Promise<SaveMarkdownResponse>
}

export function updateMarkdownDocument(shortCode: string, title: string | null, markdownContent: string): Promise<SaveMarkdownResponse> {
  return fetchWrapper.patch(`/api/tools/markdown/s/${shortCode}`, {
    title,
    markdown_content: markdownContent,
  }) as Promise<SaveMarkdownResponse>
}
