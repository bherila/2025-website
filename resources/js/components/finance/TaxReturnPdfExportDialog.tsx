'use client'

import { AlertTriangle, Download, FileText, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchWrapper } from '@/fetchWrapper'
import type {
  TaxReturnPdfExporter,
  TaxReturnPdfExportOptionsResponse,
  TaxReturnPdfFormId,
  TaxReturnPdfMode,
} from '@/types/finance/tax-return-pdf'

type TaxReturnPdfPreset = 'form-1040' | 'recommended' | 'all' | 'custom'

interface TaxReturnPdfExportDialogProps {
  open: boolean
  year: number
  isExporting: boolean
  onOpenChange: (open: boolean) => void
  onExport: TaxReturnPdfExporter
}

const FALLBACK_OPTIONS: TaxReturnPdfExportOptionsResponse = {
  year: 2025,
  supportedForms: [
    { id: 'form-1040', label: 'Form 1040 — U.S. Individual Income Tax Return', category: 'Form', available: true, recommended: true, hasData: true, warnings: [] },
  ],
  recommendedFormIds: ['form-1040'],
  allSupportedFormIds: ['form-1040'],
  unsupportedRequiredForms: [],
  warnings: ['Taxpayer identity fields are not included by default and will be blank in the generated PDF.'],
}

export function TaxReturnPdfExportDialog({
  open,
  year,
  isExporting,
  onOpenChange,
  onExport,
}: TaxReturnPdfExportDialogProps): React.ReactElement {
  const [preset, setPreset] = useState<TaxReturnPdfPreset>('recommended')
  const [mode, setMode] = useState<TaxReturnPdfMode>('editable')
  const [selectedFormIds, setSelectedFormIds] = useState<TaxReturnPdfFormId[]>(['form-1040'])
  const [includeProfilePii, setIncludeProfilePii] = useState(false)
  const [options, setOptions] = useState<TaxReturnPdfExportOptionsResponse | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setErrors([])
    setWarnings([])
    setIncludeProfilePii(false)
    setPreset('recommended')
    setIsLoadingOptions(true)

    fetchWrapper.get(`/finance/tax-preview/pdf-export-options?year=${year}`)
      .then((data: TaxReturnPdfExportOptionsResponse) => {
        if (cancelled) {
          return
        }

        setOptions(data)
        setSelectedFormIds(data.recommendedFormIds.length > 0 ? data.recommendedFormIds : ['form-1040'])
        setWarnings(data.warnings)
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        const fallback = { ...FALLBACK_OPTIONS, year }
        setOptions(fallback)
        setSelectedFormIds(fallback.recommendedFormIds)
        setWarnings(fallback.warnings)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, year])

  const effectiveOptions = options ?? { ...FALLBACK_OPTIONS, year }

  const filename = useMemo(() => `${year}-irs-supported-packet.pdf`, [year])
  const canExport = selectedFormIds.length > 0 && !isLoadingOptions && !isExporting

  const applyPreset = (nextPreset: TaxReturnPdfPreset): void => {
    setPreset(nextPreset)

    if (nextPreset === 'form-1040') {
      setSelectedFormIds(['form-1040'])
    } else if (nextPreset === 'recommended') {
      setSelectedFormIds(effectiveOptions.recommendedFormIds.length > 0 ? effectiveOptions.recommendedFormIds : ['form-1040'])
    } else if (nextPreset === 'all') {
      setSelectedFormIds(effectiveOptions.allSupportedFormIds)
    }
  }

  const toggleForm = (formId: TaxReturnPdfFormId, checked: boolean): void => {
    setPreset('custom')
    setSelectedFormIds((current) => {
      if (checked) {
        return current.includes(formId) ? current : [...current, formId]
      }

      return current.filter((currentFormId) => currentFormId !== formId)
    })
  }

  const handleExport = async (): Promise<void> => {
    setErrors([])

    const result = await onExport({
      year,
      scope: 'selection',
      mode,
      formIds: selectedFormIds,
      includeProfilePii,
      filename,
    })

    setErrors(result.errors)
    setWarnings([...effectiveOptions.warnings, ...result.warnings])

    if (result.ok && result.warnings.length === 0) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download IRS PDF</DialogTitle>
          <DialogDescription>
            Generate a supported IRS PDF packet from backend Tax Preview facts and pinned templates.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Preset</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ['form-1040', 'Form 1040 only', 'Blank identity fields by default'],
                ['recommended', 'Recommended supported packet', 'Required supported forms'],
                ['all', 'All pinned forms', 'Includes blank supported forms'],
                ['custom', 'Custom', 'Choose exact forms below'],
              ].map(([id, label, description]) => (
                <Button
                  key={id}
                  type="button"
                  variant={preset === id ? 'default' : 'outline'}
                  className="h-auto justify-start gap-2 px-3 py-2 text-left"
                  onClick={() => applyPreset(id as TaxReturnPdfPreset)}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  <span className="grid gap-0.5">
                    <span className="text-sm">{label}</span>
                    <span className="text-xs font-normal opacity-75">{description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Forms</div>
              {isLoadingOptions && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
            </div>
            <div className="grid gap-2 rounded-md border border-border p-3">
              {effectiveOptions.supportedForms.map((form) => (
                <label key={form.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50">
                  <Checkbox
                    checked={selectedFormIds.includes(form.id)}
                    onCheckedChange={(checked) => toggleForm(form.id, checked === true)}
                    aria-label={form.label}
                  />
                  <span className="grid gap-1 text-sm leading-none">
                    <span className="font-medium">{form.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {form.recommended ? 'Recommended for current facts' : form.hasData ? 'Supported pinned PDF' : 'Supported, may render blank'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {effectiveOptions.unsupportedRequiredForms.length > 0 && (
            <section className="grid gap-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Unavailable but detected</div>
              <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
                {effectiveOptions.unsupportedRequiredForms.map((form) => (
                  <div key={form.id} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Checkbox checked={false} disabled aria-label={`${form.label} unavailable`} />
                    <span className="grid gap-1">
                      <span className="font-medium">{form.label}</span>
                      <span className="text-xs">{form.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-2">
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
          </section>

          <section className="grid gap-2 rounded-md border border-border p-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={includeProfilePii} onCheckedChange={(checked) => setIncludeProfilePii(checked === true)} />
              <span className="grid gap-1">
                <span className="font-medium">Include saved taxpayer identity fields, if present</span>
                <span className="text-xs text-muted-foreground">
                  Taxpayer identity fields are left blank by default. Complete them manually in the editable PDF unless you explicitly opt in.
                </span>
              </span>
            </label>
          </section>

          {(errors.length > 0 || warnings.length > 0) && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              {errors.map((error) => (
                <div key={error} className="flex gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ))}
              {Array.from(new Set(warnings)).map((warning) => (
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
          <Button type="button" onClick={() => void handleExport()} disabled={!canExport}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? 'Generating...' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
