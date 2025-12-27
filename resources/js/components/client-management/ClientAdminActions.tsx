import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileText, Loader2 } from 'lucide-react'
import type { InvoicePreview, ClientAdminActionsProps } from '@/types/client-management/invoice'

export default function ClientAdminActions({ companyId, companySlug }: ClientAdminActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Default to current month
  const today = new Date()
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  
  const [periodStart, setPeriodStart] = useState(firstDayOfMonth.toISOString().split('T')[0])
  const [periodEnd, setPeriodEnd] = useState(lastDayOfMonth.toISOString().split('T')[0])

  const handlePreview = async () => {
    setError(null)
    setSuccess(null)
    setPreviewing(true)
    
    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/invoices/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
        })
      })

      const data = await response.json()

      if (response.ok) {
        setPreview(data)
      } else {
        setError(data.error || 'Failed to preview invoice')
      }
    } catch (err) {
      setError('An error occurred while previewing the invoice')
    } finally {
      setPreviewing(false)
    }
  }

  const handleGenerate = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(`Invoice ${data.invoice.invoice_number} generated successfully!`)
        setPreview(null)
        // Optionally redirect to the invoice page
        setTimeout(() => {
          if (companySlug) {
            window.location.href = `/client/portal/${companySlug}/invoices`
          }
        }, 1500)
      } else {
        setError(data.error || 'Failed to generate invoice')
      }
    } catch (err) {
      setError('An error occurred while generating the invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        Run Invoicing
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Generate an invoice for the specified billing period.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription className="text-green-600">{success}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_start">Period Start</Label>
                <Input
                  id="period_start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value)
                    setPreview(null)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">Period End</Label>
                <Input
                  id="period_end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value)
                    setPreview(null)
                  }}
                />
              </div>
            </div>

            {!preview && (
              <Button 
                onClick={handlePreview} 
                variant="secondary" 
                className="w-full"
                disabled={previewing}
              >
                {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Preview Invoice
              </Button>
            )}

            {preview && (
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <h4 className="font-medium">Invoice Preview</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Period:</div>
                  <div>{preview.period_start} to {preview.period_end}</div>
                  
                  <div>Time Entries:</div>
                  <div>{preview.time_entries_count}</div>
                  
                  <div>Hours Worked:</div>
                  <div>{preview.hours_worked.toFixed(2)}</div>
                  
                  {preview.agreement && (
                    <>
                      <div>Retainer Hours:</div>
                      <div>{preview.agreement.monthly_retainer_hours}</div>
                      
                      <div>Monthly Fee:</div>
                      <div>${parseFloat(preview.agreement.monthly_retainer_fee).toLocaleString()}</div>
                    </>
                  )}
                  
                  {preview.calculation && (
                    <>
                      {preview.calculation.rollover_hours_used > 0 && (
                        <>
                          <div>Rollover Used:</div>
                          <div>{preview.calculation.rollover_hours_used.toFixed(2)}</div>
                        </>
                      )}
                      
                      {preview.calculation.hours_billed_at_rate > 0 && (
                        <>
                          <div>Additional Hours:</div>
                          <div>{preview.calculation.hours_billed_at_rate.toFixed(2)}</div>
                        </>
                      )}
                    </>
                  )}

                  {preview.delayed_billing_hours > 0 && (
                    <>
                      <div className="text-amber-600">Prior Period Hours:</div>
                      <div className="text-amber-600">
                        {preview.delayed_billing_hours.toFixed(2)} ({preview.delayed_billing_entries_count} entries)
                      </div>
                    </>
                  )}
                  
                  <div className="font-medium pt-2 border-t">Invoice Total:</div>
                  <div className="font-medium pt-2 border-t">${preview.invoice_total.toFixed(2)}</div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={handleGenerate} 
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Invoice
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setPreview(null)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
