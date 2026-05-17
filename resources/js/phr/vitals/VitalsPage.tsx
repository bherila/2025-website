import { HeartPulse, Plus } from 'lucide-react'
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
  type PhrVital,
  type PhrVitalFormData,
  PhrVitalFormSchema,
  PhrVitalResponseSchema,
  PhrVitalsResponseSchema,
} from '@/phr/types'

const emptyVitalForm: PhrVitalFormData = {
  vital_name: '',
  vital_date: '',
  observed_at: '',
  vital_value: '',
  value_numeric: '',
  value_numeric_secondary: '',
  unit: '',
  secondary_unit: '',
  body_site: '',
  notes: '',
}

export default function VitalsPage({ patientId: _patientId }: { patientId: number }) {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId } = usePhrPatients()
  const [recordsBusy, setRecordsBusy] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [vitals, setVitals] = useState<PhrVital[]>([])
  const [form, setForm] = useState<PhrVitalFormData>(emptyVitalForm)

  useEffect(() => {
    if (selectedPatientId === null) {
      setVitals([])
      return
    }

    void (async () => {
      setRecordsBusy(true)
      setRecordsError(null)
      try {
        const rawVitals = await fetchWrapper.get(`/api/phr/patients/${selectedPatientId}/vitals`)
        setVitals(PhrVitalsResponseSchema.parse(rawVitals).vitals)
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
    const parsed = PhrVitalFormSchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Invalid vital.')
      return
    }

    setRecordsBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${selectedPatient.id}/vitals`, numericPayload(parsed.data, [
        'value_numeric',
        'value_numeric_secondary',
      ]))
      const response = PhrVitalResponseSchema.parse(rawResponse)
      setVitals((current) => [response.vital, ...current])
      setForm(emptyVitalForm)
    } catch (caught) {
      setFormError(errorMessage(caught))
    } finally {
      setRecordsBusy(false)
    }
  }

  return (
    <PhrShell activeTab="vitals" patientId={selectedPatientId} busy={busy || recordsBusy} error={error ?? recordsError}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <HeartPulse className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-card-foreground">Vitals</h2>
          </div>

          {!selectedPatient ? <p className="text-sm text-muted-foreground">Select a profile to manage vitals.</p> : null}

          {selectedPatient?.can_manage ? (
            <form className="mb-4 grid gap-3 rounded-md border border-border bg-background p-3" onSubmit={(event) => void submit(event)}>
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledInput label="Name" value={form.vital_name} onChange={(value) => setForm({ ...form, vital_name: value })} required />
                <LabeledInput label="Date" type="date" value={form.vital_date ?? ''} onChange={(value) => setForm({ ...form, vital_date: value })} />
                <LabeledInput label="Observed" type="datetime-local" value={form.observed_at ?? ''} onChange={(value) => setForm({ ...form, observed_at: value })} />
                <LabeledInput label="Value" value={form.vital_value ?? ''} onChange={(value) => setForm({ ...form, vital_value: value })} />
                <LabeledInput label="Numeric" inputMode="decimal" value={form.value_numeric ?? ''} onChange={(value) => setForm({ ...form, value_numeric: value })} />
                <LabeledInput label="Secondary" inputMode="decimal" value={form.value_numeric_secondary ?? ''} onChange={(value) => setForm({ ...form, value_numeric_secondary: value })} />
                <LabeledInput label="Unit" value={form.unit ?? ''} onChange={(value) => setForm({ ...form, unit: value })} />
                <LabeledInput label="Secondary Unit" value={form.secondary_unit ?? ''} onChange={(value) => setForm({ ...form, secondary_unit: value })} />
              </div>
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              <Button type="submit" size="sm">
                <Plus className="size-4" />
                Add Vital
              </Button>
            </form>
          ) : null}

          {vitals.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">No vitals.</p>
          ) : (
            <div className="grid gap-2">
              {vitals.map((vital) => (
                <div key={vital.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{vital.vital_name ?? 'Vital'}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {[vital.observed_at, vital.vital_date].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className="max-w-40 break-words text-right text-sm font-semibold text-foreground">{[vital.vital_value, vital.unit].filter(Boolean).join(' ')}</p>
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
