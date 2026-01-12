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
  const [currentIndex, setCurrentIndex] = useState(0);
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
      // Show first error (could be enhanced to show all)
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
    setCurrentIndex(0);
    setImportComplete(false);

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);
      
      // Update status to importing
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'importing' } : f
      ));

      const currentFile = files[i];
      if (!currentFile) continue;

      try {
        const formData = new FormData();
        formData.append('file', currentFile.file);

        const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/import-pdf`, {
          method: 'POST',
          headers: {
            'X-CSRF-TOKEN': csrfToken,
          },
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to import bill');
        }

        // Update status to success
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'success' } : f
        ));
      } catch (err) {
        // Update status to error
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { 
            ...f, 
            status: 'error', 
            error: err instanceof Error ? err.message : 'Import failed' 
          } : f
        ));
      }
    }

    setImportComplete(true);
    setImporting(false);
    onImported();
  };

  const handleClose = () => {
    if (importing) return;
    
    setFiles([]);
    setCurrentIndex(0);
    setImportComplete(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const progressPercent = files.length > 0 ? ((currentIndex + (importing ? 0.5 : 1)) / files.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!importing} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Bills from PDF</DialogTitle>
          <DialogDescription>
            Upload one or more utility bill PDFs to automatically extract bill details using AI.
          </DialogDescription>
        </DialogHeader>

        {importing ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="font-medium">
                Processing file {currentIndex + 1} of {files.length}...
              </span>
            </div>
            <Progress value={progressPercent} className="w-full" />
            <p className="text-sm text-center text-muted-foreground">
              Currently importing: {files[currentIndex]?.file.name}
            </p>
            
            {/* File status list */}
            <div className="max-h-40 overflow-y-auto space-y-2 mt-4">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-sm">
                  {f.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {f.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  {f.status === 'importing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {f.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
                  <span className={f.status === 'error' ? 'text-destructive' : ''}>{f.file.name}</span>
                  {f.error && <span className="text-xs text-destructive">({f.error})</span>}
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
                    Maximum 10MB per file. Select multiple files at once.
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
                Note: You must have a Gemini API key configured in your account settings to use this feature.
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
