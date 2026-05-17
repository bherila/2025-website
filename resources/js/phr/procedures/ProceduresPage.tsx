import { Plus,Scissors } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import { type PhrProcedure, PhrProceduresResponseSchema } from '@/phr/types'

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  cancelled: 'bg-muted text-muted-foreground',
}

interface AddFormProps {
  patientId: number
  onAdded: (p: PhrProcedure) => void
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [performedOn, setPerformedOn] = useState('')
  const [performerName, setPerformerName] = useState('')
  const [cptCode, setCptCode] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/procedures`,
        compactPayload({ name, performed_on: performedOn, performer_name: performerName, cpt_code: cptCode, status: 'completed' }),
      )
       
      onAdded((raw as any)?.procedure as PhrProcedure)
      setName(''); setPerformedOn(''); setPerformerName(''); setCptCode('')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add Procedure</Button>
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Procedure</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Name * <Input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="grid gap-1 text-sm font-medium">Date Performed <Input type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">CPT Code <Input value={cptCode} onChange={(e) => setCptCode(e.target.value)} placeholder="99213" /></label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Performer <Input value={performerName} onChange={(e) => setPerformerName(e.target.value)} /></label>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

export default function ProceduresPage({ patientId }: { patientId: number }) {
  const [procedures, setProcedures] = useState<PhrProcedure[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawProcedures, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/procedures`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setProcedures(PhrProceduresResponseSchema.parse(rawProcedures).procedures)
       
      setCanManage(Boolean((rawPatient as any)?.patient?.can_manage))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => { void load() }, [load])

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Scissors className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Procedures</h1>
      </div>
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {canManage && <div className="mb-6"><AddForm patientId={patientId} onAdded={(p) => setProcedures((prev) => [p, ...prev])} /></div>}
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!busy && procedures.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No procedures recorded.</div>}
      <div className="flex flex-col gap-2">
        {procedures.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-card-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {[p.cpt_code, p.performed_on, p.performer_name].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[p.status] ?? STATUS_CLASS.completed}`}>{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
