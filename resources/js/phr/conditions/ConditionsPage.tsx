import { Activity, Plus } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import { type PhrCondition, PhrConditionsResponseSchema } from '@/phr/types'

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  inactive: 'bg-muted text-muted-foreground',
  remission: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
}

interface AddFormProps {
  patientId: number
  onAdded: (c: PhrCondition) => void
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [onsetDate, setOnsetDate] = useState('')
  const [icd10Code, setIcd10Code] = useState('')
  const [clinicalStatus, setClinicalStatus] = useState('active')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/conditions`,
        compactPayload({ name, onset_date: onsetDate, icd10_code: icd10Code, clinical_status: clinicalStatus }),
      )
       
      onAdded((raw as any)?.condition as PhrCondition)
      setName(''); setOnsetDate(''); setIcd10Code(''); setClinicalStatus('active')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add Condition</Button>
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Condition</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Name * <Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="grid gap-1 text-sm font-medium">Onset Date <Input type="date" value={onsetDate} onChange={(e) => setOnsetDate(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">ICD-10 Code <Input value={icd10Code} onChange={(e) => setIcd10Code(e.target.value)} placeholder="E11.9" /></label>
        <label className="grid gap-1 text-sm font-medium">
          Status
          <select
            value={clinicalStatus}
            onChange={(e) => setClinicalStatus(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="resolved">Resolved</option>
            <option value="remission">Remission</option>
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

export default function ConditionsPage({ patientId }: { patientId: number }) {
  const [conditions, setConditions] = useState<PhrCondition[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawConditions, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/conditions`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setConditions(PhrConditionsResponseSchema.parse(rawConditions).conditions)
       
      setCanManage(Boolean((rawPatient as any)?.patient?.can_manage))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  const active = conditions.filter((c) => c.clinical_status === 'active')
  const other = conditions.filter((c) => c.clinical_status !== 'active')

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Activity className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Conditions</h1>
      </div>
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {canManage && <div className="mb-6"><AddForm patientId={patientId} onAdded={(c) => setConditions((p) => [c, ...p])} /></div>}
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!busy && conditions.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No conditions recorded.</div>}
      {[...active, ...other].map((c) => (
        <div key={c.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium text-card-foreground">{c.name}</p>
            <p className="text-xs text-muted-foreground">{[c.icd10_code, c.onset_date ? `Onset: ${c.onset_date}` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[c.clinical_status] ?? STATUS_CLASS.active}`}>{c.clinical_status}</span>
        </div>
      ))}
    </div>
  )
}
