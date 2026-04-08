'use client'

import { AlertCircle, Check, CheckCircle, ChevronLeft, ClipboardCopy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { fin_payslip_schema } from '@/components/payslip/payslipDbCols'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PromptInfo {
  prompt: string
  json_schema: Record<string, unknown>
  form_label: string
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSingle(data: unknown): string[] {
  const result = fin_payslip_schema.safeParse(data)
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') + ': ' : ''
    return path + issue.message
  })
}

function validateBulk(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return ['JSON must be an array of payslip objects.']
  }
  const arraySchema = z.array(fin_payslip_schema)
  const result = arraySchema.safeParse(data)
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') + ': ' : ''
    return path + issue.message
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PayslipJsonModalProps {
  open: boolean
  /** 'single' edits one payslip; 'bulk' edits the entire year (or all years) as a JSON array. */
  mode: 'single' | 'bulk'
  /** Pre-fill the textarea with this data (edit mode). */
  initialData?: fin_payslip | fin_payslip[] | null
  /** Called after a successful save. */
  onSuccess: () => void
  /** Called when the modal should close without saving. */
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PayslipJsonModal({ open, mode, initialData, onSuccess, onClose }: PayslipJsonModalProps) {
  const [promptInfo, setPromptInfo] = useState<PromptInfo | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [schemaCopied, setSchemaCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isValid, setIsValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const title = mode === 'bulk' ? 'Edit Payslips as JSON (Bulk)' : 'Edit Payslip as JSON'

  // Load prompt info and pre-fill textarea when modal opens
  useEffect(() => {
    if (!open) return

    const initStr = initialData != null ? JSON.stringify(initialData, null, 2) : ''
    setJsonInput(initStr)
    setValidationErrors([])
    setIsValid(initStr !== '')
    setPromptCopied(false)
    setSchemaCopied(false)

    setPromptLoading(true)
    fetchWrapper
      .get('/api/payslips/prompt')
      .then((data: unknown) => setPromptInfo(data as PromptInfo))
      .catch(() => toast.error('Could not load prompt info.'))
      .finally(() => setPromptLoading(false))
  }, [open, initialData])

  // Validate JSON input on change
  useEffect(() => {
    if (!jsonInput.trim()) {
      setValidationErrors([])
      setIsValid(false)
      return
    }
    try {
      const parsed = JSON.parse(jsonInput)
      const errors = mode === 'bulk' ? validateBulk(parsed) : validateSingle(parsed)
      setValidationErrors(errors)
      setIsValid(errors.length === 0)
    } catch {
      setValidationErrors(['Invalid JSON — please check your input for syntax errors.'])
      setIsValid(false)
    }
  }, [jsonInput, mode])

  const handleCopyPrompt = useCallback(async () => {
    if (!promptInfo?.prompt) return
    await navigator.clipboard.writeText(promptInfo.prompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2500)
  }, [promptInfo])

  const handleCopySchema = useCallback(async () => {
    if (!promptInfo?.json_schema) return
    const schema = mode === 'bulk'
      ? { type: 'array', items: promptInfo.json_schema }
      : promptInfo.json_schema
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2))
    setSchemaCopied(true)
    setTimeout(() => setSchemaCopied(false), 2500)
  }, [promptInfo, mode])

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    let parsedData: unknown
    try {
      parsedData = JSON.parse(jsonInput)
    } catch {
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'bulk') {
        await fetchWrapper.post('/api/payslips/bulk', parsedData)
        toast.success('Payslips saved successfully.')
      } else {
        await fetchWrapper.post('/api/payslips', parsedData)
        toast.success('Payslip saved successfully.')
      }
      onSuccess()
    } catch (err) {
      toast.error('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }, [isValid, jsonInput, mode, onSuccess])

  const placeholder =
    mode === 'bulk'
      ? '[\n  {\n    "period_start": "2025-01-01",\n    "period_end": "2025-01-15",\n    "pay_date": "2025-01-20",\n    "earnings_gross": 5000\n  }\n]'
      : '{\n  "period_start": "2025-01-01",\n  "period_end": "2025-01-15",\n  "pay_date": "2025-01-20",\n  "earnings_gross": 5000\n}'

  const displaySchema =
    promptInfo?.json_schema != null
      ? mode === 'bulk'
        ? { type: 'array', items: promptInfo.json_schema }
        : promptInfo.json_schema
      : null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !submitting && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
          <p className="text-sm text-muted-foreground">
            {mode === 'bulk'
              ? 'Edit all payslips as a JSON array. Existing payslips (with payslip_id) will be updated; items without an id will be inserted.'
              : 'Edit this payslip directly as JSON. You can also copy the LLM prompt below to extract data from a PDF payslip.'}
          </p>

          {promptLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading prompt…
            </div>
          )}

          {promptInfo && (
            <>
              {/* ── LLM Prompt ─────────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">Step 1 — Copy this prompt to your LLM</h3>
                  <Button variant="ghost" size="sm" onClick={handleCopyPrompt} className="gap-1.5">
                    {promptCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600" /> Copied
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="h-3.5 w-3.5" /> Copy prompt
                      </>
                    )}
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all border">
                  {promptInfo.prompt}
                </pre>
              </section>

              {/* ── JSON schema reference ─────────────────────────────── */}
              {displaySchema && (
                <section>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold">Step 2 — Expected JSON format (for reference)</h3>
                    <Button variant="ghost" size="sm" onClick={handleCopySchema} className="gap-1.5">
                      {schemaCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-600" /> Copied
                        </>
                      ) : (
                        <>
                          <ClipboardCopy className="h-3.5 w-3.5" /> Copy schema
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-36 whitespace-pre-wrap break-all border">
                    {JSON.stringify(displaySchema, null, 2)}
                  </pre>
                </section>
              )}
            </>
          )}

          {/* ── JSON Paste / Edit Area ───────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">
                {promptInfo ? 'Step 3 — Paste or edit the JSON here' : 'Edit JSON'}
              </h3>
              {isValid && (
                <Badge variant="outline" className="text-green-700 border-green-400 gap-1">
                  <CheckCircle className="h-3 w-3" /> Valid JSON
                </Badge>
              )}
            </div>
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={placeholder}
              className="font-mono text-xs h-48 resize-none"
              disabled={submitting}
            />
          </section>

          {/* ── Validation errors ─────────────────────────────────────── */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5 text-xs">
                  {validationErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="gap-1.5 mr-auto">
            <ChevronLeft className="h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitting ? 'Saving…' : 'Save JSON'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
