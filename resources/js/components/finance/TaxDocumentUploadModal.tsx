'use client'

import { FileCode2, Loader2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import ManualJsonAttachModal from '@/components/finance/ManualJsonAttachModal'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

interface TaxDocumentUploadModalProps {
  open: boolean
  formType: string
  taxYear: number
  accountId?: number
  employmentEntityId?: number
  onSuccess: () => void
  onCancel: () => void
  /** Called when the user clicks "Create Blank" */
  onCreateBlank?: () => void
}

type UploadPhase = 'idle' | 'requesting' | 'uploading' | 'saving' | 'done'

/**
 * Compresses an image blob to an optimised PNG using an off-screen Canvas.
 * Returns a new Blob with type 'image/png'.
 */
async function compressImageToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      // Limit max dimension to 2000 px while preserving aspect ratio
      const MAX = 2000
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(result => {
        if (result) resolve(result)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for compression'))
    }
    img.src = url
  })
}

export default function TaxDocumentUploadModal({
  open,
  formType,
  taxYear,
  accountId,
  employmentEntityId,
  onSuccess,
  onCancel,
  onCreateBlank,
}: TaxDocumentUploadModalProps) {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showManualJson, setShowManualJson] = useState(false)
  const [attachedJson, setAttachedJson] = useState<unknown | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('idle')
      setUploadProgress(0)
      setIsDragging(false)
      setShowManualJson(false)
      setAttachedJson(null)
    }
  }, [open])

  const doUpload = useCallback(
    async (file: File, overrideFilename?: string) => {
      const filename = overrideFilename ?? file.name
      try {
        setPhase('requesting')
        setUploadProgress(0)

        const fileHash = await computeFileSHA256(file)

        const uploadRequest = (await fetchWrapper.post('/api/finance/tax-documents/request-upload', {
          filename,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        })) as { upload_url: string; s3_key: string; expires_in: number }

        setPhase('uploading')

        // Use XMLHttpRequest for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', uploadRequest.upload_url)
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100))
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`Upload failed: HTTP ${xhr.status}`))
          }
          xhr.onerror = () => reject(new Error('Network error during upload'))
          xhr.send(file)
        })

        setPhase('saving')

        // Capture the current attachedJson value for this specific upload
        const jsonToAttach = attachedJson

        await fetchWrapper.post('/api/finance/tax-documents', {
          s3_key: uploadRequest.s3_key,
          original_filename: filename,
          form_type: formType,
          tax_year: taxYear,
          file_size_bytes: file.size,
          file_hash: fileHash,
          mime_type: file.type || 'application/octet-stream',
          ...(accountId != null ? { account_id: accountId } : {}),
          ...(employmentEntityId != null ? { employment_entity_id: employmentEntityId } : {}),
          // When JSON was pre-attached, include it so the backend skips AI processing
          ...(jsonToAttach != null ? { parsed_data: jsonToAttach } : {}),
        })

        setPhase('done')
        toast.success('Document uploaded successfully')
        onSuccess()
      } catch (err) {
        setPhase('idle')
        toast.error('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    },
    [formType, taxYear, accountId, employmentEntityId, onSuccess, attachedJson],
  )

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (fileInputRef.current) fileInputRef.current.value = ''
      await doUpload(file)
    },
    [doUpload],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      await doUpload(file)
    },
    [doUpload],
  )

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  // Handle CTRL+V paste
  useEffect(() => {
    if (!open) return

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      // Check for image first
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue
          try {
            const pngBlob = await compressImageToPng(blob)
            // Minify pasted image using optipng-js (only for pasted images, not uploaded files)
            let finalBlob = pngBlob
            try {
              const { default: optipng } = await import('optipng-js')
              const arrayBuffer = await pngBlob.arrayBuffer()
              const input = new Uint8Array(arrayBuffer)
              const result = optipng(input, ['-o2'])
              finalBlob = new Blob([result.data], { type: 'image/png' })
            } catch {
              // optipng failed (e.g. WASM init error or unsupported image) — fall back to canvas-compressed PNG
            }
            const file = new File([finalBlob], 'clipping.png', { type: 'image/png' })
            await doUpload(file)
          } catch {
            toast.error('Failed to process pasted image. Please try a different format.')
          }
          return
        }
      }

      // Check for text
      for (const item of Array.from(items)) {
        if (item.type === 'text/plain') {
          item.getAsString(async text => {
            if (!text.trim()) {
              toast.error('No text content found in clipboard. Please paste an image or text.')
              return
            }
            const file = new File([text], 'clipping.txt', { type: 'text/plain' })
            await doUpload(file)
          })
          return
        }
      }

      toast.error('No supported content found in clipboard. Please paste an image or text file.')
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [open, doUpload])

  const isUploading = phase !== 'idle' && phase !== 'done'
  const formLabel = FORM_TYPE_LABELS[formType] ?? formType

  return (
    <>
      <Dialog open={open && !showManualJson} onOpenChange={isOpen => !isOpen && !isUploading && onCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {formLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Drop zone */}
            <div
              ref={dropZoneRef}
              role="button"
              tabIndex={isUploading ? -1 : 0}
              aria-label="Drop file here, paste a screen clipping, or press Enter to select a file"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onKeyDown={e => {
                if (!isUploading && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30'}
                ${isUploading ? 'pointer-events-none opacity-70' : ''}
              `}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    {phase === 'requesting' && 'Preparing upload...'}
                    {phase === 'uploading' && `Uploading... ${uploadProgress}%`}
                    {phase === 'saving' && 'Saving...'}
                  </p>
                  {phase === 'uploading' && (
                    <Progress value={uploadProgress} className="w-full max-w-xs" />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="font-medium text-foreground">Drop file here, paste a screen clipping, or click here to select a file</p>
                  <p className="text-xs">PDF, PNG, JPG, or TXT</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*,text/plain"
              className="hidden"
              onChange={handleFileSelected}
            />

            {/* Attached JSON indicator */}
            {attachedJson != null && !isUploading && (
              <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40 px-3 py-2 text-sm">
                <FileCode2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                <span className="flex-1 text-green-800 dark:text-green-300 font-medium">JSON attached — upload the PDF to complete</span>
                <button
                  type="button"
                  className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-200"
                  onClick={() => setAttachedJson(null)}
                  title="Remove attached JSON"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Attach JSON option */}
            {!isUploading && attachedJson == null && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowManualJson(true)}
                >
                  <FileCode2 className="h-4 w-4" />
                  Attach JSON from LLM
                </Button>
              </>
            )}

            {/* Create Blank option */}
            {onCreateBlank && !isUploading && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onCancel()
                    onCreateBlank()
                  }}
                >
                  Create Blank {formLabel}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual JSON attachment sub-dialog */}
      <ManualJsonAttachModal
        open={open && showManualJson}
        formType={formType}
        taxYear={taxYear}
        accountId={accountId}
        employmentEntityId={employmentEntityId}
        onJsonReady={(data) => {
          setAttachedJson(data)
          setShowManualJson(false)
        }}
        onSuccess={(_doc: TaxDocument) => {
          setShowManualJson(false)
          onSuccess()
        }}
        onBack={() => setShowManualJson(false)}
      />
    </>
  )
}
