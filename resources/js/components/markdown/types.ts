export interface MarkdownDocumentDto {
  id: number
  shortCode: string
  title: string | null
  shareUrl: string
  ownerUserId: number | null
}

export interface MarkdownInitialData {
  document: MarkdownDocumentDto | null
  markdown: string
  title: string | null
  canEdit: boolean
  authenticated: boolean
}

export interface SaveMarkdownResponse {
  id: number
  shortCode: string
  shareUrl: string
  title: string | null
}
