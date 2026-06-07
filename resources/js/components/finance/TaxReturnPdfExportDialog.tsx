'use client'

import { AlertTriangle, Download, Files, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  TaxReturnPdfExporter,
  TaxReturnPdfMode,
  TaxReturnPdfScope,
} from '@/types/finance/tax-return-pdf'

interface TaxReturnPdfExportDialogProps {
  open: boolean
  year: number
  isExporting: boolean
  onOpenChange: (open: boolean) => void
  onExport: TaxReturnPdfExporter
}

export function TaxReturnPdfExportDialog({
  open,
  year,
  isExporting,
  onOpenChange,
  onExport,
}: TaxReturnPdfExportDialogProps): React.ReactElement {
  const [scope, setScope] = useState<TaxReturnPdfScope>('form')
  const [mode, setMode] = useState<TaxReturnPdfMode>('editable')
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setErrors([])
      setWarnings([])
    }
  }, [open])

  const filename = useMemo(() => {
    if (scope === 'form') {
      return `${year}-form-1040.pdf`
    }

    return `${year}-federal-return.pdf`
  }, [scope, year])

  const handleExport = async (): Promise<void> => {
    setErrors([])
    setWarnings([])

    const result = await onExport({
      year,
      scope,
      mode,
      ...(scope === 'form' ? { formId: 'form-1040' } : {}),
      filename,
    })

    setErrors(result.errors)
    setWarnings(result.warnings)

    if (result.ok) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Download IRS PDF</DialogTitle>
          <DialogDescription>
            Generate from backend Tax Preview facts and the pinned official IRS template.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Scope</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={scope === 'form' ? 'default' : 'outline'}
                className="h-auto justify-start gap-2 px-3 py-2 text-left"
                onClick={() => setScope('form')}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span className="grid gap-0.5">
                  <span className="text-sm">Form 1040</span>
                  <span className="text-xs font-normal opacity-75">Individual editable file</span>
                </span>
              </Button>
              <Button
                type="button"
                variant={scope === 'return' ? 'default' : 'outline'}
                className="h-auto justify-start gap-2 px-3 py-2 text-left"
                onClick={() => setScope('return')}
              >
                <Files className="h-4 w-4" aria-hidden="true" />
                <span className="grid gap-0.5">
                  <span className="text-sm">Federal return</span>
                  <span className="text-xs font-normal opacity-75">Readiness checked</span>
                </span>
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Mode</div>
            <div className="inline-flex w-full rounded-md border border-border p-1 sm:w-auto">
              <button
                type="button"
                className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors sm:flex-none ${mode === 'editable' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                onClick={() => setMode('editable')}
              >
                Editable
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors sm:flex-none ${mode === 'print' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                onClick={() => setMode('print')}
              >
                Print
              </button>
            </div>
          </div>

          {(errors.length > 0 || warnings.length > 0) && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              {errors.map((error) => (
                <div key={error} className="flex gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ))}
              {warnings.map((warning) => (
                <div key={warning} className="flex gap-2 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleExport()} disabled={isExporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? 'Generating...' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
