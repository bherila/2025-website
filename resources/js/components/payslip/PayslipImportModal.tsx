'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileText, Upload, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { importPayslips } from '@/lib/api'

interface PayslipImportModalProps {
  onImportSuccess: () => void
}

export function PayslipImportModal({ onImportSuccess }: PayslipImportModalProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getTotalSize = (fileList: File[]) => {
    return fileList.reduce((acc, file) => acc + file.size, 0)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files)
      const allowedFiles = newFiles.filter(file => {
        const fileType = file.type
        return fileType === 'application/pdf'
      })

      if (allowedFiles.length !== newFiles.length) {
        toast.error('Only PDF files are allowed.')
      }

      const combinedFiles = [...files, ...allowedFiles]
      if (combinedFiles.length > 200) {
         toast.error('Too many files selected. Please limit to 200 files.')
         return
      }

      setFiles(combinedFiles)
    }
  }

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles(files.filter(file => file !== fileToRemove))
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.warning('Please select at least one file to import.')
      return
    }

    setIsUploading(true)
    
    // Chunk logic: 5.9 MB per chunk
    const MAX_CHUNK_SIZE_MB = 5.9;
    const chunks: File[][] = [];
    let currentChunk: File[] = [];
    let currentChunkSize = 0;
    const maxSizeBytes = MAX_CHUNK_SIZE_MB * 1024 * 1024;

    for (const file of files) {
       // If a single file is > 5.9MB, it must go in its own chunk
       if (currentChunk.length > 0 && currentChunkSize + file.size > maxSizeBytes) {
           chunks.push(currentChunk);
           currentChunk = [];
           currentChunkSize = 0;
       }
       currentChunk.push(file);
       currentChunkSize += file.size;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    setUploadProgress({ current: 0, total: chunks.length });

    let successCount = 0;
    let failCount = 0;
    let errors: string[] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        setUploadProgress({ current: i + 1, total: chunks.length });
        
        try {
            const result = await importPayslips(chunk);
            if (result.success) {
                // The API result message says "Successfully imported X payslip(s)"
                // We'll rely on the API success message mostly, but for now just count processed files
                successCount += chunk.length; 
            } else {
                failCount += chunk.length;
                errors.push(result.error || `Batch ${i+1} failed`);
            }
        } catch (e: any) {
             failCount += chunk.length;
             errors.push(e.message || `Batch ${i+1} error`);
        }
      }

      if (successCount > 0) {
        toast.success(`Processed ${successCount} files.`);
        onImportSuccess();
        setFiles([]);
        setOpen(false);
      } 
      
      if (failCount > 0) {
        toast.error(`Failed to process ${failCount} files. ${errors.slice(0, 3).join(', ')}`);
      }

    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error(error.message || 'An unexpected error occurred during upload.')
    } finally {
      setIsUploading(false)
      setUploadProgress({ current: 0, total: 0 });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Import PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Import Payslips</DialogTitle>
          <DialogDescription>
            Upload PDF files. Files will be processed in batches (max 5.9MB per batch).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="payslip-files">Payslip Files</Label>
            <Input
              id="payslip-files"
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileChange}
              ref={fileInputRef}
              disabled={isUploading}
            />
          </div>
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-2">
                Selected: {files.length} file(s) - {(getTotalSize(files) / 1024 / 1024).toFixed(2)} MB
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground max-h-[200px] overflow-y-auto">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between">
                    <span className="flex items-center truncate max-w-[300px]" title={file.name}>
                      <FileText className="mr-2 h-4 w-4 flex-shrink-0" /> <span className="truncate">{file.name}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(file)}
                      disabled={isUploading}
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          {isUploading && (
             <div className="flex items-center mr-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Batch {uploadProgress.current}/{uploadProgress.total}
             </div>
          )}
          <Button onClick={() => setOpen(false)} variant="ghost" disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={isUploading || files.length === 0}>
            {isUploading ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
