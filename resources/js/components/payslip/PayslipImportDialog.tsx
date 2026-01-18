'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileText, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { importPayslips } from '@/lib/api'

interface PayslipImportDialogProps {
  onImportSuccess: () => void
}

export function PayslipImportDialog({ onImportSuccess }: PayslipImportDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
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
      
      if (combinedFiles.length > 100) {
        toast.error('You can only upload up to 100 files at a time.')
        return
      }
      
      const totalSize = getTotalSize(combinedFiles)
      if (totalSize > 6 * 1024 * 1024) { // 6MB
        toast.error('Total file size exceeds 6MB. Please select fewer files.')
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
    try {
      const result = await importPayslips(files)
      if (result.success) {
        toast.success(result.message)
        onImportSuccess()
        setFiles([])
        setOpen(false)
      } else {
        toast.error(result.error || 'Failed to import payslips.')
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error(error.message || 'An unexpected error occurred during upload.')
    } finally {
      setIsUploading(false)
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
            Upload up to 100 PDF files (max 6MB total). The system will use AI to extract data.
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
                Selected: {files.length} file(s) - {(getTotalSize(files) / 1024 / 1024).toFixed(2)} MB / 6 MB
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