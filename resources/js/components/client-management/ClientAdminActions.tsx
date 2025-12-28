import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { ClientAdminActionsProps } from '@/types/client-management/invoice'

interface GenerateAllResults {
  generated: Array<{ period: string; invoice_id: number; invoice_number: string }>
  updated: Array<{ period: string; invoice_id: number; invoice_number: string }>
  skipped: Array<{ period: string; invoice_id?: number; status?: string; reason?: string; error?: string }>
  summary: {
    generated_count: number
    updated_count: number
    skipped_count: number
  }
}

export default function ClientAdminActions({ companyId, onClose, onSuccess }: ClientAdminActionsProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GenerateAllResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerateAll = async () => {
    setError(null)
    setResults(null)
    setLoading(true)

    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/invoices/generate-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      const data = await response.json()

      if (response.ok) {
        setResults(data.results)
        if (onSuccess) {
          onSuccess()
        }
      } else {
        setError(data.error || 'Failed to generate invoices')
      }
    } catch (err) {
      setError('An error occurred while generating invoices')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setResults(null)
    setError(null)
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Run Invoicing</DialogTitle>
          <DialogDescription>
            Generate invoices for all calendar months from the agreement start date to now.
            This will create new draft invoices or update existing draft invoices. Issued, paid, and voided invoices will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!results && !loading && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                This process will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Generate new invoices for months without invoices</li>
                  <li>Update existing draft invoices with current data</li>
                  <li>Skip issued, paid, and voided invoices</li>
                </ul>
              </div>
              <Button 
                onClick={handleGenerateAll} 
                className="w-full"
              >
                Generate Invoices for All Months
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating invoices...</p>
            </div>
          )}

          {results && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mb-2" />
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {results.summary.generated_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Generated</div>
                </div>

                <div className="flex flex-col items-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {results.summary.updated_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Updated</div>
                </div>

                <div className="flex flex-col items-center p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
                  <XCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 mb-2" />
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {results.summary.skipped_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>

              {results.generated.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Generated Invoices</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {results.generated.map((item, idx) => (
                      <div key={idx} className="text-sm flex justify-between items-center p-2 bg-green-50 dark:bg-green-950 rounded">
                        <span className="font-mono">{item.period}</span>
                        <span className="text-xs text-muted-foreground">{item.invoice_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.updated.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Updated Draft Invoices</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {results.updated.map((item, idx) => (
                      <div key={idx} className="text-sm flex justify-between items-center p-2 bg-blue-50 dark:bg-blue-950 rounded">
                        <span className="font-mono">{item.period}</span>
                        <span className="text-xs text-muted-foreground">{item.invoice_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.skipped.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Skipped</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {results.skipped.map((item, idx) => (
                      <div key={idx} className="text-sm p-2 bg-amber-50 dark:bg-amber-950 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-mono">{item.period}</span>
                          {item.status && (
                            <span className="text-xs text-muted-foreground uppercase">{item.status}</span>
                          )}
                        </div>
                        {(item.reason || item.error) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.reason || item.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                onClick={handleClose} 
                className="w-full"
                variant="default"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
