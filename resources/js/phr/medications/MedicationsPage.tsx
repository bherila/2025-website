import { Pill, Plus } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import { type PhrMedication, PhrMedicationsResponseSchema } from '@/phr/types'

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  discontinued: 'bg-muted text-muted-foreground',
  completed: 'bg-muted text-muted-foreground',
  on_hold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
}

interface AddFormProps {
  patientId: number
  onAdded: (m: PhrMedication) => void
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [frequency, setFrequency] = useState('')
  const [startedOn, setStartedOn] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/medications`,
        compactPayload({ name, dose, frequency, started_on: startedOn, status: 'active' }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onAdded((raw as any)?.medication as PhrMedication)
      setName(''); setDose(''); setFrequency(''); setStartedOn('')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add Medication</Button>
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Medication</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Name * <Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="grid gap-1 text-sm font-medium">Dose <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="10 mg" /></label>
        <label className="grid gap-1 text-sm font-medium">Frequency <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="BID, daily…" /></label>
        <label className="grid gap-1 text-sm font-medium">Started On <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} /></label>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

export default function MedicationsPage({ patientId }: { patientId: number }) {
  const [medications, setMedications] = useState<PhrMedication[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawMeds, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/medications`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setMedications(PhrMedicationsResponseSchema.parse(rawMeds).medications)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCanManage(Boolean((rawPatient as any)?.patient?.can_manage))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  const active = medications.filter((m) => m.status === 'active')
  const other = medications.filter((m) => m.status !== 'active')

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Pill className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Medications</h1>
      </div>
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {canManage && <div className="mb-6"><AddForm patientId={patientId} onAdded={(m) => setMedications((p) => [m, ...p])} /></div>}
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!busy && medications.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No medications recorded.</div>}
      {[...active, ...other].map((m) => (
        <div key={m.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium text-card-foreground">{m.name}</p>
            <p className="text-xs text-muted-foreground">{[m.dose, m.dose_unit, m.frequency].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[m.status] ?? STATUS_CLASS.active}`}>{m.status}</span>
        </div>
      ))}
    </div>
  )
}
