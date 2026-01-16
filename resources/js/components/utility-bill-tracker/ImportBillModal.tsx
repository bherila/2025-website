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
      if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: File size exceeds 10MB`);
        return;
      }
      newFiles.push({ file, status: 'pending' });
    });

    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
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

    // Set all files to importing status, removing any previous errors
    setFiles(prev => prev.map(f => {
      const { error, ...rest } = f;
      return { ...rest, status: 'importing' } as FileImportStatus;
    }));

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    try {
      const formData = new FormData();
      files.forEach((f) => {
        formData.append('files[]', f.file);
      });

      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/import-pdf`, {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': csrfToken,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // If the entire batch failed
        const errorMsg = data.error || 'Batch import failed';
        setFiles(prev => prev.map(f => ({ ...f, status: 'error', error: errorMsg })));
      } else {
        // Process individual results
        if (data.results && Array.isArray(data.results)) {
          setFiles(prev => prev.map(f => {
            // Find result by filename
            const result = data.results.find((r: any) => r.filename === f.file.name);
            if (result) {
              const newStatus = result.status === 'success' ? 'success' : 'error';
              // Construct object carefully to satisfy exactOptionalPropertyTypes
              const newFileState: FileImportStatus = {
                ...f,
                status: newStatus,
              };
              if (result.error) {
                newFileState.error = result.error;
              } else {
                 // If success, ensure error is removed (though we started from 'f' which might have it? 
                 // No, 'f' is from 'prev' which was set to 'importing' without error in the step above, 
                 // BUT 'prev' in this setFiles call refers to the state at the time of THIS update.
                 // The 'setFiles' above runs first, but this is a new update.
                 // However, since we are inside an async function after await, the state might have been updated.
                 // Safest is to destructure 'f' again to be sure.
                 const { error, ...cleanF } = f;
                 return { ...cleanF, status: newStatus, ...(result.error ? { error: result.error } : {}) } as FileImportStatus;
              }
              return newFileState;
            }
            return { ...f, status: 'error', error: 'No result returned' };
          }));
        } else {
           throw new Error('Invalid response format from server');
        }
      }
    } catch (err) {
      // Network or other error affecting the whole batch
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'error', 
        error: err instanceof Error ? err.message : 'Import failed' 
      })));
    }

    setImportComplete(true);
    setImporting(false);
    onImported();
  };

  const handleClose = () => {
    if (importing) return;
    
    setFiles([]);
    setImportComplete(false);
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
            Upload one or more utility bill PDFs. They will be processed in a single batch.
          </DialogDescription>
        </DialogHeader>

        {importing ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="font-medium">
                Processing {files.length} file(s)...
              </span>
            </div>
            <Progress value={100} className="w-full animate-pulse" />
            <p className="text-sm text-center text-muted-foreground">
              This may take a minute depending on the number of files.
            </p>
            
            {/* File status list */}
            <div className="max-h-40 overflow-y-auto space-y-2 mt-4">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-sm">
                  {f.status === 'importing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
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
                    Maximum 6MB total. Select multiple files at once.
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
