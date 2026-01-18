import * as React from 'react';
import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle, XCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface FileImportStatus {
  file: File;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
}

interface ImportBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  onImported: () => void;
}

export function ImportBillModal({ open, onOpenChange, accountId, onImported }: ImportBillModalProps) {
  const [files, setFiles] = useState<FileImportStatus[]>([]);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: FileImportStatus[] = [];
    const errors: string[] = [];

    Array.from(selectedFiles).forEach((file) => {
      if (file.type !== 'application/pdf') {
        errors.push(`${file.name}: Not a PDF file`);
        return;
      }
      // Warn if > 10MB but don't block here, let backend or chunking handle (though backend limit is 6MB now)
      // Actually backend limit is 6MB per request. If a single file is > 6MB, it will fail.
      if (file.size > 6 * 1024 * 1024) {
        errors.push(`${file.name}: File size exceeds 6MB`);
        return;
      }
      newFiles.push({ file, status: 'pending' });
    });

    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
      // Optional: show toast
    }

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    if (files.length === 0) return;

    setImporting(true);
    setImportComplete(false);

    // Reset status
    setFiles(prev => prev.map(f => {
      const { error, ...rest } = f;
      return { ...rest, status: 'importing' } as FileImportStatus;
    }));

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    
    // Chunk logic
    const MAX_CHUNK_SIZE_MB = 5.9;
    const maxSizeBytes = MAX_CHUNK_SIZE_MB * 1024 * 1024;
    const chunks: FileImportStatus[][] = [];
    let currentChunk: FileImportStatus[] = [];
    let currentChunkSize = 0;

    for (const f of files) {
       if (currentChunk.length > 0 && currentChunkSize + f.file.size > maxSizeBytes) {
           chunks.push(currentChunk);
           currentChunk = [];
           currentChunkSize = 0;
       }
       currentChunk.push(f);
       currentChunkSize += f.file.size;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    setProgress({ current: 0, total: chunks.length });

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        setProgress({ current: i + 1, total: chunks.length });

        // Update status of current chunk to processing (if we wanted to be granular)
        
        const formData = new FormData();
        chunk.forEach((f) => {
          formData.append('files[]', f.file);
        });

        try {
          const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/import-pdf`, {
            method: 'POST',
            headers: {
              'X-CSRF-TOKEN': csrfToken,
            },
            body: formData,
          });

          const data = await response.json();

          if (!response.ok) {
            const errorMsg = data.error || `Batch ${i+1} failed`;
            // Mark all in this chunk as error
            setFiles(prev => prev.map(f => {
                if (chunk.some(c => c.file === f.file)) {
                    return { ...f, status: 'error', error: errorMsg };
                }
                return f;
            }));
          } else {
            // Success
            if (data.results && Array.isArray(data.results)) {
               setFiles(prev => prev.map(f => {
                  const result = data.results.find((r: any) => r.filename === f.file.name);
                  if (result) {
                      const newStatus = result.status === 'success' ? 'success' : 'error';
                      const { error, ...cleanF } = f;
                      return { ...cleanF, status: newStatus, ...(result.error ? { error: result.error } : {}) } as FileImportStatus;
                  }
                  // If not in results but was in chunk? (Shouldn't happen if API is correct)
                  if (chunk.some(c => c.file === f.file)) {
                      // Maybe keep as is or mark error?
                  }
                  return f;
               }));
            }
          }
        } catch (err) {
             const errorMsg = err instanceof Error ? err.message : 'Network error';
             setFiles(prev => prev.map(f => {
                if (chunk.some(c => c.file === f.file)) {
                    return { ...f, status: 'error', error: errorMsg };
                }
                return f;
            }));
        }
      }
    } catch (err) {
        // Global error (should be caught inside loop but just in case)
        console.error("Global import error", err);
    }

    setImportComplete(true);
    setImporting(false);
    onImported();
  };

  const handleClose = () => {
    if (importing) return;
    
    setFiles([]);
    setImportComplete(false);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!importing} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Bills from PDF</DialogTitle>
          <DialogDescription>
            Upload one or more utility bill PDFs. They will be processed in batches.
          </DialogDescription>
        </DialogHeader>

        {importing ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="font-medium">
                Processing batch {progress.current} of {progress.total}...
              </span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="w-full" />
            
            {/* File status list */}
            <div className="max-h-40 overflow-y-auto space-y-2 mt-4">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-sm">
                  {f.status === 'importing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {f.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {f.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span>{f.file.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : importComplete ? (
          <div className="py-6 space-y-4">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-4 mb-4">
                {successCount > 0 && (
                  <div className="flex items-center space-x-1 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">{successCount} imported</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center space-x-1 text-destructive">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">{errorCount} failed</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Final file status list */}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-sm p-2 rounded bg-muted/50">
                  {f.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  {f.status === 'error' && <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                  <span className={`truncate ${f.status === 'error' ? 'text-destructive' : ''}`}>{f.file.name}</span>
                  {f.error && <span className="text-xs text-destructive flex-shrink-0">- {f.error}</span>}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="py-4">
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center space-y-2">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <p className="font-medium">Click to select PDF files</p>
                  <p className="text-sm text-muted-foreground">
                    Maximum 6MB per file. Select multiple files.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">{files.length} file(s) selected:</p>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <div className="flex items-center space-x-2 min-w-0">
                          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm truncate">{f.file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({(f.file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs text-muted-foreground">
                Note: You must have a Gemini API key configured in your <a href="/dashboard" className="underline">account settings</a> to use this feature.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleImport} disabled={files.length === 0}>
                Import {files.length > 0 ? `${files.length} Bill(s)` : 'Bills'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}