import { AlertTriangle, Plus } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import { PhrAllergiesResponseSchema,type PhrAllergy } from '@/phr/types'

const CRITICALITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  unable_to_assess: 'bg-muted text-muted-foreground',
}

interface AddFormProps {
  patientId: number
  onAdded: (a: PhrAllergy) => void
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [substance, setSubstance] = useState('')
  const [reaction, setReaction] = useState('')
  const [criticality, setCriticality] = useState('low')
  const [category, setCategory] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!substance.trim()) { setError('Substance is required.'); return }
    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/allergies`,
        compactPayload({ substance, reaction, criticality, category, clinical_status: 'active' }),
      )
       
      onAdded((raw as any)?.allergy as PhrAllergy)
      setSubstance(''); setReaction(''); setCriticality('low'); setCategory('')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add Allergy</Button>
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Allergy</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Substance * <Input value={substance} onChange={(e) => setSubstance(e.target.value)} placeholder="Penicillin" required /></label>
        <label className="grid gap-1 text-sm font-medium">Reaction <Input value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="Hives, anaphylaxis…" /></label>
        <label className="grid gap-1 text-sm font-medium">Category <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="medication, food, environment" /></label>
        <label className="grid gap-1 text-sm font-medium">
          Criticality
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="unable_to_assess">Unable to Assess</option>
          </select>
        </label>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

export default function AllergiesPage({ patientId }: { patientId: number }) {
  const [allergies, setAllergies] = useState<PhrAllergy[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawAllergies, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/allergies`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setAllergies(PhrAllergiesResponseSchema.parse(rawAllergies).allergies)
       
      setCanManage(Boolean((rawPatient as any)?.patient?.can_manage))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  const active = allergies.filter((a) => a.clinical_status === 'active')
  const other = allergies.filter((a) => a.clinical_status !== 'active')

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <AlertTriangle className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Allergies</h1>
      </div>
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {canManage && <div className="mb-6"><AddForm patientId={patientId} onAdded={(a) => setAllergies((prev) => [a, ...prev])} /></div>}
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!busy && allergies.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No allergies recorded.</div>}
      {[...active, ...other].map((a) => (
        <div key={a.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium text-card-foreground">{a.substance}</p>
            <p className="text-xs text-muted-foreground">
              {[a.category, a.reaction].filter(Boolean).join(' · ')}
            </p>
          </div>
          {a.criticality && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CRITICALITY_CLASS[a.criticality] ?? CRITICALITY_CLASS.low}`}>{a.criticality}</span>
          )}
        </div>
      ))}
    </div>
  )
}
