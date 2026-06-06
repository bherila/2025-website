export interface ToonDocumentDto {
  id: number
  shortCode: string
  title: string | null
  shareUrl: string
  ownerUserId: number | null
}

export interface ToonInitialData {
  document: ToonDocumentDto | null
  toon: string
  title: string | null
  canEdit: boolean
  authenticated: boolean
}

export interface SaveToonResponse {
  id: number
  shortCode: string
  shareUrl: string
  title: string | null
}
