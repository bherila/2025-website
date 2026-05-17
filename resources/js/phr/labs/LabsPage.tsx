import { FlaskConical, Plus } from 'lucide-react'
import type { ComponentProps, FormEvent } from 'react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'
import { errorMessage, numericPayload } from '@/phr/shared'
import {
  type PhrLabResult,
  type PhrLabResultFormData,
  PhrLabResultFormSchema,
  PhrLabResultResponseSchema,
  PhrLabResultsResponseSchema,
} from '@/phr/types'

const emptyLabForm: PhrLabResultFormData = {
  test_name: '',
  analyte: '',
  value: '',
  value_numeric: '',
  unit: '',
  result_datetime: '',
  range_min: '',
  range_max: '',
  abnormal_flag: '',
  notes: '',
}

export default function LabsPage() {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId } = usePhrPatients()
  const [recordsBusy, setRecordsBusy] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [labResults, setLabResults] = useState<PhrLabResult[]>([])
  const [form, setForm] = useState<PhrLabResultFormData>(emptyLabForm)

  useEffect(() => {
    if (selectedPatientId === null) {
      setLabResults([])
      return
    }

    void (async () => {
      setRecordsBusy(true)
      setRecordsError(null)
      try {
        const rawLabs = await fetchWrapper.get(`/api/phr/patients/${selectedPatientId}/lab-results`)
        setLabResults(PhrLabResultsResponseSchema.parse(rawLabs).lab_results)
      } catch (caught) {
        setRecordsError(errorMessage(caught))
      } finally {
        setRecordsBusy(false)
      }
    })()
  }, [selectedPatientId])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selectedPatient) {
      return
    }

    setFormError(null)
    const parsed = PhrLabResultFormSchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Invalid lab result.')
      return
    }

    setRecordsBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${selectedPatient.id}/lab-results`, numericPayload(parsed.data, [
        'value_numeric',
        'range_min',
        'range_max',
      ]))
      const response = PhrLabResultResponseSchema.parse(rawResponse)
      setLabResults((current) => [response.lab_result, ...current])
      setForm(emptyLabForm)
    } catch (caught) {
      setFormError(errorMessage(caught))
    } finally {
      setRecordsBusy(false)
    }
  }

  return (
    <PhrShell activeTab="labs" patientId={selectedPatientId} busy={busy || recordsBusy} error={error ?? recordsError}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-card-foreground">Labs</h2>
          </div>

          {!selectedPatient ? <p className="text-sm text-muted-foreground">Select a profile to manage labs.</p> : null}

          {selectedPatient?.can_manage ? (
            <form className="mb-4 grid gap-3 rounded-md border border-border bg-background p-3" onSubmit={(event) => void submit(event)}>
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledInput label="Panel" value={form.test_name ?? ''} onChange={(value) => setForm({ ...form, test_name: value })} />
                <LabeledInput label="Analyte" value={form.analyte} onChange={(value) => setForm({ ...form, analyte: value })} required />
                <LabeledInput label="Value" value={form.value ?? ''} onChange={(value) => setForm({ ...form, value })} />
                <LabeledInput label="Numeric" inputMode="decimal" value={form.value_numeric ?? ''} onChange={(value) => setForm({ ...form, value_numeric: value })} />
                <LabeledInput label="Unit" value={form.unit ?? ''} onChange={(value) => setForm({ ...form, unit: value })} />
                <LabeledInput label="Result Date" type="datetime-local" value={form.result_datetime ?? ''} onChange={(value) => setForm({ ...form, result_datetime: value })} />
                <LabeledInput label="Range Min" inputMode="decimal" value={form.range_min ?? ''} onChange={(value) => setForm({ ...form, range_min: value })} />
                <LabeledInput label="Range Max" inputMode="decimal" value={form.range_max ?? ''} onChange={(value) => setForm({ ...form, range_max: value })} />
              </div>
              <LabeledInput label="Flag" value={form.abnormal_flag ?? ''} onChange={(value) => setForm({ ...form, abnormal_flag: value })} />
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              <Button type="submit" size="sm">
                <Plus className="size-4" />
                Add Lab
              </Button>
            </form>
          ) : null}

          {labResults.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">No lab results.</p>
          ) : (
            <div className="grid gap-2">
              {labResults.map((labResult) => (
                <div key={labResult.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{labResult.analyte ?? 'Lab result'}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {[labResult.test_name, labResult.result_datetime].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className="max-w-40 break-words text-right text-sm font-semibold text-foreground">{[labResult.value, labResult.unit].filter(Boolean).join(' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PhrShell>
  )
}

interface LabeledInputProps extends Omit<ComponentProps<typeof Input>, 'onChange'> {
  label: string
  onChange: (value: string) => void
}

function LabeledInput({ label, onChange, ...props }: LabeledInputProps) {
  return (
    <label className="grid gap-1 text-sm font-medium text-foreground">
      {label}
      <Input {...props} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
