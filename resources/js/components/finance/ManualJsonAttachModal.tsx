'use client'

import { AlertCircle, Check, CheckCircle, ChevronLeft, ClipboardCopy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

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
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Performs basic structural validation on parsed JSON for the given form type. */
function validateParsedData(data: unknown, formType: string): string[] {
  const errors: string[] = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('JSON must be a plain object (not an array or primitive).')
    return errors
  }
  const obj = data as Record<string, unknown>

  switch (formType) {
    case 'w2':
    case 'w2c':
      if (obj['box1_wages'] === undefined) {
        errors.push('Missing required field: box1_wages')
      }
      if (obj['employer_name'] === undefined) {
        errors.push('Missing required field: employer_name')
      }
      break
    case '1099_int':
    case '1099_int_c':
      if (obj['box1_interest'] === undefined) {
        errors.push('Missing required field: box1_interest')
      }
      if (obj['payer_name'] === undefined) {
        errors.push('Missing required field: payer_name')
      }
      break
    case '1099_div':
    case '1099_div_c':
      if (obj['box1a_ordinary'] === undefined) {
        errors.push('Missing required field: box1a_ordinary')
      }
      if (obj['payer_name'] === undefined) {
        errors.push('Missing required field: payer_name')
      }
      break
    case '1099_misc':
      if (obj['payer_name'] === undefined) {
        errors.push('Missing required field: payer_name')
      }
      break
    case 'k1': {
      if (obj['schemaVersion'] !== '2026.1') {
        errors.push('Missing or wrong schemaVersion — must be "2026.1"')
      }
      const fields = obj['fields']
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        errors.push('Missing required property: fields (must be an object)')
      }
      const codes = obj['codes']
      if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
        errors.push('Missing required property: codes (must be an object)')
      }
      break
    }
  }
  return errors
}

/** Returns a short form-specific JSON placeholder example for the textarea. */
function getJsonPlaceholder(formType: string): string {
  switch (formType) {
    case 'w2':
    case 'w2c':
      return '{\n  "employer_name": "Acme Corp",\n  "box1_wages": 100000,\n  "box2_fed_tax": 22000\n}'
    case '1099_int':
    case '1099_int_c':
      return '{\n  "payer_name": "Big Bank NA",\n  "box1_interest": 1234.56,\n  "box6_foreign_tax": 0\n}'
    case '1099_div':
    case '1099_div_c':
      return '{\n  "payer_name": "Fidelity",\n  "box1a_ordinary": 2500.00,\n  "box1b_qualified": 2000.00\n}'
    case '1099_misc':
      return '{\n  "payer_name": "Payer LLC",\n  "box3_other_income": 5000.00,\n  "box4_fed_tax": null\n}'
    case 'k1':
      return (
        '{\n  "schemaVersion": "2026.1",\n  "formType": "K-1-1065",\n' +
        '  "fields": { "A": { "value": "Partnership LLC" }, "1": { "value": "12345.67" } },\n' +
        '  "codes": { "11": [{ "code": "A", "value": "500.00", "notes": "Net LT cap gain" }] }\n}'
      )
    default:
      return '{\n  /* paste the JSON returned by the LLM here */\n}'
  }
}



interface PromptInfo {
  prompt: string
  json_schema: Record<string, unknown>
  form_label: string
}

interface ManualJsonAttachModalProps {
  open: boolean
  formType: string
  taxYear: number
  accountId?: number | undefined
  employmentEntityId?: number | undefined
  /** Existing document JSON (for edit mode — pre-fills the textarea). */
  initialJson?: unknown
  /**
   * When provided, clicking the action button calls onJsonReady(parsedData) instead
   * of posting to the API. Used when attaching JSON before uploading the PDF file.
   */
  onJsonReady?: (data: unknown) => void
  onSuccess: (document: TaxDocument) => void
  onBack: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManualJsonAttachModal({
  open,
  formType,
  taxYear,
  accountId,
  employmentEntityId,
  initialJson,
  onJsonReady,
  onSuccess,
  onBack,
}: ManualJsonAttachModalProps) {
  const [promptInfo, setPromptInfo] = useState<PromptInfo | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [schemaCopied, setSchemaCopied] = useState(false)

  const [jsonInput, setJsonInput] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isValid, setIsValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const formLabel = FORM_TYPE_LABELS[formType] ?? formType

  // Fetch prompt info when modal opens
  useEffect(() => {
    if (!open) return
    // Pre-fill with initialJson when in edit mode
    const initStr = initialJson != null ? JSON.stringify(initialJson, null, 2) : ''
    setJsonInput(initStr)
    setValidationErrors([])
    setIsValid(initStr !== '')
    setPromptCopied(false)
    setSchemaCopied(false)

    setPromptLoading(true)
    fetchWrapper
      .get(`/api/finance/tax-documents/prompt?form_type=${encodeURIComponent(formType)}&tax_year=${encodeURIComponent(String(taxYear))}`)
      .then((data: unknown) => setPromptInfo(data as PromptInfo))
      .catch(() => toast.error('Could not load prompt info.'))
      .finally(() => setPromptLoading(false))
  }, [open, formType, taxYear, initialJson])

  // Validate json input on change
  useEffect(() => {
    if (!jsonInput.trim()) {
      setValidationErrors([])
      setIsValid(false)
      return
    }
    try {
      const parsed = JSON.parse(jsonInput)
      const errors = validateParsedData(parsed, formType)
      setValidationErrors(errors)
      setIsValid(errors.length === 0)
    } catch {
      setValidationErrors(['Invalid JSON — please check your input for syntax errors.'])
      setIsValid(false)
    }
  }, [jsonInput, formType])

  const handleCopyPrompt = useCallback(async () => {
    if (!promptInfo?.prompt) return
    await navigator.clipboard.writeText(promptInfo.prompt)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2500)
  }, [promptInfo])

  const handleCopySchema = useCallback(async () => {
    if (!promptInfo?.json_schema) return
    await navigator.clipboard.writeText(JSON.stringify(promptInfo.json_schema, null, 2))
    setSchemaCopied(true)
    setTimeout(() => setSchemaCopied(false), 2500)
  }, [promptInfo])

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    let parsedData: unknown
    try {
      parsedData = JSON.parse(jsonInput)
    } catch {
      return
    }

    // If caller wants the JSON without an API call (e.g., attach JSON before uploading PDF)
    if (onJsonReady) {
      onJsonReady(parsedData)
      return
    }

    setSubmitting(true)
    try {
      const doc = (await fetchWrapper.post('/api/finance/tax-documents/manual', {
        form_type: formType,
        tax_year: taxYear,
        parsed_data: parsedData,
        ...(accountId != null ? { account_id: accountId } : {}),
        ...(employmentEntityId != null ? { employment_entity_id: employmentEntityId } : {}),
      })) as TaxDocument

      toast.success(`${formLabel} JSON attached successfully.`)
      onSuccess(doc)
    } catch (err) {
      toast.error('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }, [isValid, jsonInput, onJsonReady, formType, taxYear, accountId, employmentEntityId, formLabel, onSuccess])

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && !submitting && onBack()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Attach JSON — {formLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
          {/* Instructions */}
          <p className="text-sm text-muted-foreground">
            Copy the prompt below and paste it along with your document into any LLM (ChatGPT, Claude, Gemini,
            etc.). The LLM will return a JSON object — paste that JSON in the field at the bottom.
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
                  {JSON.stringify(promptInfo.json_schema, null, 2)}
                </pre>
              </section>
            </>
          )}

          {/* ── JSON Paste Area ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Step 3 — Paste the LLM output here</h3>
              {isValid && (
                <Badge variant="outline" className="text-green-700 border-green-400 gap-1">
                  <CheckCircle className="h-3 w-3" /> Valid JSON
                </Badge>
              )}
            </div>
            <Textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              placeholder={getJsonPlaceholder(formType)}
              className="font-mono text-xs h-40 resize-none"
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
          <Button variant="ghost" onClick={onBack} disabled={submitting} className="gap-1.5 mr-auto">
            <ChevronLeft className="h-4 w-4" /> Back to upload
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitting ? 'Saving…' : onJsonReady ? 'Attach JSON' : 'Attach JSON'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
