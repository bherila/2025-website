import { FlaskConical, HeartPulse, Plus, RefreshCcw, Share2, UserRound, UsersRound } from 'lucide-react'
import type { ComponentProps, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'

import {
  type PhrAccessGrant,
  PhrAccessResponseSchema,
  type PhrLabResult,
  type PhrLabResultFormData,
  PhrLabResultFormSchema,
  PhrLabResultResponseSchema,
  PhrLabResultsResponseSchema,
  type PhrPatient,
  type PhrPatientFormData,
  PhrPatientFormSchema,
  PhrPatientListResponseSchema,
  PhrPatientResponseSchema,
  type PhrVital,
  type PhrVitalFormData,
  PhrVitalFormSchema,
  PhrVitalResponseSchema,
  PhrVitalsResponseSchema,
} from './types'

interface ApiError {
  message?: string
}

interface PatientListProps {
  patients: PhrPatient[]
  selectedPatientId: number | null
  onSelect: (patientId: number) => void
}

interface PatientFormProps {
  onCreated: (patient: PhrPatient) => void
  setBusy: (busy: boolean) => void
}

interface RecordPanelProps {
  selectedPatient: PhrPatient | null
  labResults: PhrLabResult[]
  vitals: PhrVital[]
  onLabCreated: (labResult: PhrLabResult) => void
  onVitalCreated: (vital: PhrVital) => void
  setBusy: (busy: boolean) => void
}

interface SharingPanelProps {
  selectedPatient: PhrPatient | null
  onPatientUpdated: (patient: PhrPatient) => void
  onAccessRevoked: () => void
  setBusy: (busy: boolean) => void
}

const emptyPatientForm: PhrPatientFormData = {
  display_name: '',
  relationship: '',
  birth_date: '',
  sex_at_birth: '',
  notes: '',
}

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

function PHRApp() {
  const [patients, setPatients] = useState<PhrPatient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [labResults, setLabResults] = useState<PhrLabResult[]>([])
  const [vitals, setVitals] = useState<PhrVital[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  )

  useEffect(() => {
    void loadPatients()
  }, [])

  useEffect(() => {
    if (selectedPatientId === null) {
      return
    }

    void loadPatientRecords(selectedPatientId)
  }, [selectedPatientId])

  async function loadPatients(): Promise<void> {
    setBusy(true)
    setError(null)

    try {
      const rawResponse: unknown = await fetchWrapper.get('/api/phr/patients')
      const response = PhrPatientListResponseSchema.parse(rawResponse)
      setPatients(response.patients)
      setSelectedPatientId((current) => current ?? response.patients[0]?.id ?? null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function loadPatientRecords(patientId: number): Promise<void> {
    setBusy(true)
    setError(null)

    try {
      const [rawLabs, rawVitals] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/lab-results`),
        fetchWrapper.get(`/api/phr/patients/${patientId}/vitals`),
      ])
      setLabResults(PhrLabResultsResponseSchema.parse(rawLabs).lab_results)
      setVitals(PhrVitalsResponseSchema.parse(rawVitals).vitals)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  function upsertPatient(patient: PhrPatient): void {
    setPatients((current) => {
      const next = current.filter((item) => item.id !== patient.id)
      next.push(patient)
      return next.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''))
    })
    setSelectedPatientId(patient.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">PHR</h1>
          <p className="mt-1 text-sm text-muted-foreground">Personal health records</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadPatients()} disabled={busy}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <PatientForm onCreated={upsertPatient} setBusy={setBusy} />
          <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          <RecordPanel
            selectedPatient={selectedPatient}
            labResults={labResults}
            vitals={vitals}
            onLabCreated={(labResult) => setLabResults((current) => [labResult, ...current])}
            onVitalCreated={(vital) => setVitals((current) => [vital, ...current])}
            setBusy={setBusy}
          />
          <SharingPanel
            selectedPatient={selectedPatient}
            onPatientUpdated={upsertPatient}
            onAccessRevoked={() => selectedPatientId !== null && void loadPatients()}
            setBusy={setBusy}
          />
        </main>
      </div>
    </div>
  )
}

function PatientForm({ onCreated, setBusy }: PatientFormProps) {
  const [form, setForm] = useState<PhrPatientFormData>(emptyPatientForm)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    const parsed = PhrPatientFormSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid patient profile.')
      return
    }

    setBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post('/api/phr/patients', compactPayload(parsed.data))
      const response = PhrPatientResponseSchema.parse(rawResponse)
      onCreated(response.patient)
      setForm(emptyPatientForm)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-card-foreground">Patient Profile</h2>
      </div>
      <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
        <LabeledInput label="Name" value={form.display_name} onChange={(value) => setForm({ ...form, display_name: value })} required />
        <LabeledInput label="Relationship" value={form.relationship ?? ''} onChange={(value) => setForm({ ...form, relationship: value })} />
        <LabeledInput label="Birth Date" type="date" value={form.birth_date ?? ''} onChange={(value) => setForm({ ...form, birth_date: value })} />
        <LabeledInput label="Sex At Birth" value={form.sex_at_birth ?? ''} onChange={(value) => setForm({ ...form, sex_at_birth: value })} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="sm">
          <Plus className="size-4" />
          Add Profile
        </Button>
      </form>
    </section>
  )
}

function PatientList({ patients, selectedPatientId, onSelect }: PatientListProps) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <UsersRound className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-card-foreground">Profiles</h2>
      </div>
      <div className="flex flex-col gap-2">
        {patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No patient profiles.</p>
        ) : patients.map((patient) => (
          <button
            key={patient.id}
            type="button"
            className={[
              'rounded-md border px-3 py-2 text-left transition-colors',
              selectedPatientId === patient.id
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border bg-background hover:bg-muted/60',
            ].join(' ')}
            onClick={() => onSelect(patient.id)}
          >
            <span className="block truncate text-sm font-medium">{patient.display_name}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {patient.relationship || 'Profile'} · {patient.access_level ?? 'viewer'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RecordPanel({ selectedPatient, labResults, vitals, onLabCreated, onVitalCreated, setBusy }: RecordPanelProps) {
  if (!selectedPatient) {
    return (
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">No profile selected.</p>
      </section>
    )
  }

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-card-foreground">{selectedPatient.display_name}</h2>
        <p className="text-sm text-muted-foreground">
          {selectedPatient.relationship || 'Profile'} · {selectedPatient.can_manage ? 'Manage' : 'View'}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <LabResultsPanel patient={selectedPatient} labResults={labResults} onCreated={onLabCreated} setBusy={setBusy} />
        <VitalsPanel patient={selectedPatient} vitals={vitals} onCreated={onVitalCreated} setBusy={setBusy} />
      </div>
    </section>
  )
}

interface LabResultsPanelProps {
  patient: PhrPatient
  labResults: PhrLabResult[]
  onCreated: (labResult: PhrLabResult) => void
  setBusy: (busy: boolean) => void
}

function LabResultsPanel({ patient, labResults, onCreated, setBusy }: LabResultsPanelProps) {
  const [form, setForm] = useState<PhrLabResultFormData>(emptyLabForm)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    const parsed = PhrLabResultFormSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid lab result.')
      return
    }

    setBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${patient.id}/lab-results`, numericPayload(parsed.data, [
        'value_numeric',
        'range_min',
        'range_max',
      ]))
      const response = PhrLabResultResponseSchema.parse(rawResponse)
      onCreated(response.lab_result)
      setForm(emptyLabForm)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-card-foreground">Labs</h3>
      </div>
      {patient.can_manage ? (
        <form className="grid gap-3 rounded-md border border-border bg-background p-3" onSubmit={(event) => void submit(event)}>
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="sm">
            <Plus className="size-4" />
            Add Lab
          </Button>
        </form>
      ) : null}
      <RecordList
        emptyLabel="No lab results."
        rows={labResults.map((labResult) => ({
          id: labResult.id,
          title: labResult.analyte ?? 'Lab result',
          subtitle: [labResult.test_name, labResult.result_datetime].filter(Boolean).join(' · '),
          value: [labResult.value, labResult.unit].filter(Boolean).join(' '),
        }))}
      />
    </div>
  )
}

interface VitalsPanelProps {
  patient: PhrPatient
  vitals: PhrVital[]
  onCreated: (vital: PhrVital) => void
  setBusy: (busy: boolean) => void
}

function VitalsPanel({ patient, vitals, onCreated, setBusy }: VitalsPanelProps) {
  const [form, setForm] = useState<PhrVitalFormData>(emptyVitalForm)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    const parsed = PhrVitalFormSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid vital.')
      return
    }

    setBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${patient.id}/vitals`, numericPayload(parsed.data, [
        'value_numeric',
        'value_numeric_secondary',
      ]))
      const response = PhrVitalResponseSchema.parse(rawResponse)
      onCreated(response.vital)
      setForm(emptyVitalForm)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <HeartPulse className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-card-foreground">Vitals</h3>
      </div>
      {patient.can_manage ? (
        <form className="grid gap-3 rounded-md border border-border bg-background p-3" onSubmit={(event) => void submit(event)}>
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="sm">
            <Plus className="size-4" />
            Add Vital
          </Button>
        </form>
      ) : null}
      <RecordList
        emptyLabel="No vitals."
        rows={vitals.map((vital) => ({
          id: vital.id,
          title: vital.vital_name ?? 'Vital',
          subtitle: [vital.observed_at, vital.vital_date].filter(Boolean).join(' · '),
          value: [vital.vital_value, vital.unit].filter(Boolean).join(' '),
        }))}
      />
    </div>
  )
}

function SharingPanel({ selectedPatient, onPatientUpdated, onAccessRevoked, setBusy }: SharingPanelProps) {
  const [email, setEmail] = useState('')
  const [accessLevel, setAccessLevel] = useState<'manager' | 'viewer'>('viewer')
  const [error, setError] = useState<string | null>(null)

  if (!selectedPatient?.can_share) {
    return null
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selectedPatient) {
      return
    }

    setError(null)
    setBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${selectedPatient.id}/access`, {
        email,
        access_level: accessLevel,
      })
      const response = PhrAccessResponseSchema.parse(rawResponse)
      onPatientUpdated(response.patient)
      setEmail('')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(access: PhrAccessGrant): Promise<void> {
    if (!selectedPatient || access.access_level === 'owner') {
      return
    }

    setBusy(true)
    setError(null)
    try {
      await fetchWrapper.delete(`/api/phr/patients/${selectedPatient.id}/access/${access.id}`, {})
      onAccessRevoked()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Share2 className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-card-foreground">Sharing</h2>
      </div>
      <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]" onSubmit={(event) => void submit(event)}>
        <LabeledInput label="Email" type="email" value={email} onChange={setEmail} required />
        <label className="grid gap-1 text-sm font-medium text-foreground">
          Access
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={accessLevel}
            onChange={(event) => setAccessLevel(event.target.value === 'manager' ? 'manager' : 'viewer')}
          >
            <option value="viewer">Viewer</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm">
            <Plus className="size-4" />
            Share
          </Button>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 grid gap-2">
        {selectedPatient.access_grants.map((access) => (
          <div key={access.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{access.user_name ?? access.user_email}</p>
              <p className="truncate text-xs text-muted-foreground">{access.user_email} · {access.access_level}</p>
            </div>
            {access.access_level !== 'owner' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void revoke(access)}>
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
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

interface RecordRow {
  id: number
  title: string
  subtitle: string
  value: string
}

interface RecordListProps {
  emptyLabel: string
  rows: RecordRow[]
}

function RecordList({ emptyLabel, rows }: RecordListProps) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-md border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-foreground">{row.title}</p>
              {row.subtitle ? <p className="mt-1 break-words text-xs text-muted-foreground">{row.subtitle}</p> : null}
            </div>
            {row.value ? <p className="max-w-40 break-words text-right text-sm font-semibold text-foreground">{row.value}</p> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function compactPayload<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
  )
}

function numericPayload<T extends Record<string, unknown>>(data: T, numericKeys: string[]): Record<string, unknown> {
  const payload = compactPayload(data)

  for (const key of numericKeys) {
    const value = payload[key]
    payload[key] = typeof value === 'string' && value.trim() !== '' ? Number(value) : null
  }

  return payload
}

function errorMessage(caught: unknown): string {
  if (typeof caught === 'string') {
    return caught
  }

  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as ApiError).message)
  }

  return 'Request failed.'
}

const root = document.getElementById('phr-root')

if (root) {
  createRoot(root).render(<PHRApp />)
}
