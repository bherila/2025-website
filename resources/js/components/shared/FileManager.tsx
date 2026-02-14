'use client'

import { format } from 'date-fns'
import { Download, FileIcon, History, Loader2, Trash2, Upload } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { DownloadHistoryEntry, DownloadResponse, FileHistoryResponse, FileRecord, UploadUrlResponse } from '@/types/files'

// Maximum file size for direct upload (50MB)
const DIRECT_UPLOAD_MAX_SIZE = 50 * 1024 * 1024

interface FileListProps {
  files: FileRecord[]
  loading: boolean
  isAdmin: boolean
  onDownload: (file: FileRecord) => void
  onDelete?: (file: FileRecord) => void
  onViewHistory?: (file: FileRecord) => void
  title?: string
  actions?: React.ReactNode
  className?: string
}

export function FileList({ files, loading, isAdmin, onDownload, onDelete, onViewHistory, title = 'Files', actions, className }: FileListProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{title}</CardTitle>
            {actions}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (files.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{title}</CardTitle>
            {actions}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No files uploaded yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title} ({files.length})</CardTitle>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">File Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.id} className="group">
                <TableCell className="pl-6 py-3">
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate max-w-[200px] md:max-w-md" title={file.original_filename}>
                      {file.original_filename}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {file.human_file_size}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div className="flex flex-col">
                    <span>{format(new Date(file.created_at), 'MMM d, yyyy')}</span>
                    {file.uploader && (
                      <span className="text-[10px] opacity-70">by {file.uploader.name}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onDownload(file)}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {isAdmin && onViewHistory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onViewHistory(file)}
                        title="View download history"
                      >
                        <History className="h-4 w-4" />
                        {file.download_count > 0 && (
                          <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
                            {file.download_count}
                          </Badge>
                        )}
                      </Button>
                    )}
                    {isAdmin && onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(file)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}


interface FileUploadButtonProps {
  onUpload: (file: File) => Promise<void | FileRecord | null>
  disabled?: boolean
  className?: string
}

export function FileUploadButton({ onUpload, disabled, className }: FileUploadButtonProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setProgress(0)
    
    // Simulate progress for the upload (actual progress comes from S3 in the hook)
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        // Slowly increment progress but cap at 90% until actual completion
        if (prev < 90) return prev + Math.random() * 15
        return prev
      })
    }, 200)
    
    try {
      await onUpload(file)
      setProgress(100)
    } finally {
      clearInterval(progressInterval)
      // Brief delay to show 100% before hiding
      await new Promise(resolve => setTimeout(resolve, 300))
      setUploading(false)
      setProgress(0)
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        onClick={handleClick}
        disabled={disabled || uploading}
        className={`relative overflow-hidden ${className || ''}`}
      >
        {uploading && (
          <div 
            className="absolute inset-0 bg-primary/20 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className="relative flex items-center">
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {uploading ? `Uploading... ${Math.round(progress)}%` : 'Upload File'}
        </span>
      </Button>
    </>
  )
}

interface FileHistoryModalProps {
  file: FileRecord | null
  history: DownloadHistoryEntry[]
  isOpen: boolean
  onClose: () => void
}

export function FileHistoryModal({ file, history, isOpen, onClose }: FileHistoryModalProps) {
  if (!file) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Download History</DialogTitle>
          <DialogDescription>
            {file.original_filename}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Uploaded: {format(new Date(file.created_at), 'MMM d, yyyy h:mm a')}</p>
            {file.uploader && <p>By: {file.uploader.name}</p>}
            <p>Size: {file.human_file_size}</p>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Downloads ({history.length})</h4>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No downloads yet</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map((entry, index) => (
                  <div key={index} className="text-sm flex justify-between items-center p-2 bg-muted rounded">
                    <span>User ID: {entry.user_id ?? 'Unknown'}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(entry.downloaded_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteFileModalProps {
  file: FileRecord | null
  isOpen: boolean
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteFileModal({ file, isOpen, isDeleting, onClose, onConfirm }: DeleteFileModalProps) {
  if (!file) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete File</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this file? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <FileIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{file.original_filename}</p>
              <p className="text-sm text-muted-foreground">{file.human_file_size}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Helper hooks for file operations
interface UseFileOperationsOptions {
  listUrl: string
  uploadUrl: string
  uploadUrlEndpoint?: string // For large file uploads
  downloadUrlPattern: (fileId: number) => string
  deleteUrlPattern: (fileId: number) => string
  historyUrlPattern?: (fileId: number) => string
}

export function useFileOperations(options: UseFileOperationsOptions) {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWrapper.get(options.listUrl)
      setFiles(response)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setError('Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [options.listUrl])

  const uploadFile = useCallback(async (file: File): Promise<FileRecord | null> => {
    setError(null)
    try {
      // For large files, use signed URL upload
      if (file.size > DIRECT_UPLOAD_MAX_SIZE && options.uploadUrlEndpoint) {
        // Get signed upload URL
        const urlResponse: UploadUrlResponse = await fetchWrapper.post(options.uploadUrlEndpoint, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        })

        // Upload directly to S3
        await fetch(urlResponse.upload_url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
        })

        await fetchFiles()
        return urlResponse.file
      } else {
        // Direct upload for smaller files
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetchWrapper.post(options.uploadUrl, formData)
        await fetchFiles()
        return response
      }
    } catch (err) {
      console.error('Failed to upload file:', err)
      setError('Failed to upload file')
      return null
    }
  }, [options.uploadUrl, options.uploadUrlEndpoint, fetchFiles])

  const downloadFile = useCallback(async (file: FileRecord) => {
    try {
      const response: DownloadResponse = await fetchWrapper.get(options.downloadUrlPattern(file.id))
      // Open the download URL in a new tab
      window.open(response.download_url, '_blank')
    } catch (err) {
      console.error('Failed to download file:', err)
      setError('Failed to download file')
    }
  }, [options.downloadUrlPattern])

  const deleteFile = useCallback(async (file: FileRecord): Promise<boolean> => {
    setError(null)
    try {
      await fetchWrapper.delete(options.deleteUrlPattern(file.id), {})
      await fetchFiles()
      return true
    } catch (err) {
      console.error('Failed to delete file:', err)
      setError('Failed to delete file')
      return false
    }
  }, [options.deleteUrlPattern, fetchFiles])

  const getFileHistory = useCallback(async (file: FileRecord): Promise<DownloadHistoryEntry[]> => {
    if (!options.historyUrlPattern) return []
    try {
      const response: FileHistoryResponse = await fetchWrapper.get(options.historyUrlPattern(file.id))
      return response.download_history
    } catch (err) {
      console.error('Failed to get file history:', err)
      return []
    }
  }, [options.historyUrlPattern])

  return useMemo(() => ({
    files,
    loading,
    error,
    fetchFiles,
    uploadFile,
    downloadFile,
    deleteFile,
    getFileHistory,
  }), [files, loading, error, fetchFiles, uploadFile, downloadFile, deleteFile, getFileHistory])
}

// Higher-level hook that includes modal state management for delete and history modals
interface UseFileManagementOptions extends UseFileOperationsOptions {
  autoFetch?: boolean
}

export function useFileManagement(options: UseFileManagementOptions) {
  const { autoFetch = false, ...fileOpsOptions } = options
  const fileOps = useFileOperations(fileOpsOptions)

  // Modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyFile, setHistoryFile] = useState<FileRecord | null>(null)
  const [historyData, setHistoryData] = useState<DownloadHistoryEntry[]>([])
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteFile, setDeleteFileState] = useState<FileRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleViewHistory = useCallback(async (file: FileRecord) => {
    const history = await fileOps.getFileHistory(file)
    setHistoryFile(file)
    setHistoryData(history)
    setHistoryModalOpen(true)
  }, [fileOps])

  const handleDeleteRequest = useCallback((file: FileRecord) => {
    setDeleteFileState(file)
    setDeleteModalOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteFile) return
    setIsDeleting(true)
    await fileOps.deleteFile(deleteFile)
    setIsDeleting(false)
    setDeleteModalOpen(false)
    setDeleteFileState(null)
  }, [deleteFile, fileOps])

  const closeHistoryModal = useCallback(() => {
    setHistoryModalOpen(false)
  }, [])

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false)
  }, [])

  return useMemo(() => ({
    // File operations
    ...fileOps,

    // History modal state and handlers
    historyModalOpen,
    historyFile,
    historyData,
    handleViewHistory,
    closeHistoryModal,

    // Delete modal state and handlers
    deleteModalOpen,
    deleteFile,
    isDeleting,
    handleDeleteRequest,
    handleDeleteConfirm,
    closeDeleteModal,
  }), [
    fileOps,
    historyModalOpen,
    historyFile,
    historyData,
    handleViewHistory,
    closeHistoryModal,
    deleteModalOpen,
    deleteFile,
    isDeleting,
    handleDeleteRequest,
    handleDeleteConfirm,
    closeDeleteModal,
  ])
}
