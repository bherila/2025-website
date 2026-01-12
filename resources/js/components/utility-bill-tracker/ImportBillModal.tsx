import * as React from 'react';
import { useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ImportBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  onImported: () => void;
}

export function ImportBillModal({ open, onOpenChange, accountId, onImported }: ImportBillModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/import-pdf`, {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import bill');
      }

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onOpenChange(false);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during import');
    } finally {
      setImporting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !importing) {
      setFile(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    if (!importing) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!importing}>
        <DialogHeader>
          <DialogTitle>Import Bill from PDF</DialogTitle>
          <DialogDescription>
            Upload a utility bill PDF to automatically extract bill details using AI.
          </DialogDescription>
        </DialogHeader>

        {importing ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Processing your bill...</p>
              <p className="text-sm text-muted-foreground">
                This may take a minute or two while we extract the data.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="py-4">
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-12 w-12 text-primary" />
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm" type="button">
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="font-medium">Click to select a PDF file</p>
                    <p className="text-sm text-muted-foreground">
                      Maximum file size: 10MB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="mt-4 text-sm text-destructive">{error}</div>
              )}

              <p className="mt-4 text-xs text-muted-foreground">
                Note: You must have a Gemini API key configured in your account settings to use this feature.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleImport} disabled={!file}>
                Import Bill
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
