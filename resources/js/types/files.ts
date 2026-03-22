export interface FileRecord {
  id: number
  original_filename: string
  stored_filename: string
  s3_path: string
  mime_type: string | null
  file_size_bytes: number
  uploaded_by_user_id: number | null
  download_history: DownloadHistoryEntry[] | null
  created_at: string
  updated_at: string
  human_file_size: string
  download_count: number
  uploader?: {
    id: number
    name: string
  } | null
}

export interface DownloadHistoryEntry {
  user_id: number | null
  downloaded_at: string
}

export interface UploadUrlResponse {
  upload_url: string
  file: FileRecord
}

export interface DownloadResponse {
  download_url: string
}

export interface FileHistoryResponse {
  file: FileRecord
  download_history: DownloadHistoryEntry[]
}
