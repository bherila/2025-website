import { Plus,ShieldCheck } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import { compactPayload, errorMessage } from '@/phr/shared'
import { type PhrImmunization, PhrImmunizationsResponseSchema } from '@/phr/types'

interface AddFormProps {
  patientId: number
  onAdded: (i: PhrImmunization) => void
}

function AddForm({ patientId, onAdded }: AddFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vaccineName, setVaccineName] = useState('')
  const [administeredOn, setAdministeredOn] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [lotNumber, setLotNumber] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!vaccineName.trim()) { setError('Vaccine name is required.'); return }
    setBusy(true)
    setError(null)
    try {
      const raw: unknown = await fetchWrapper.post(
        `/api/phr/patients/${patientId}/immunizations`,
        compactPayload({ vaccine_name: vaccineName, administered_on: administeredOn, manufacturer, lot_number: lotNumber }),
      )
       
      onAdded((raw as any)?.immunization as PhrImmunization)
      setVaccineName(''); setAdministeredOn(''); setManufacturer(''); setLotNumber('')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />Add Immunization</Button>
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Immunization</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">Vaccine Name * <Input value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} required /></label>
        <label className="grid gap-1 text-sm font-medium">Date Administered <Input type="date" value={administeredOn} onChange={(e) => setAdministeredOn(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">Manufacturer <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">Lot Number <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} /></label>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

export default function ImmunizationsPage({ patientId }: { patientId: number }) {
  const [immunizations, setImmunizations] = useState<PhrImmunization[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawImmunizations, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/immunizations`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setImmunizations(PhrImmunizationsResponseSchema.parse(rawImmunizations).immunizations)
       
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
        <ShieldCheck className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold text-foreground">Immunizations</h1>
      </div>
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {canManage && <div className="mb-6"><AddForm patientId={patientId} onAdded={(i) => setImmunizations((prev) => [i, ...prev])} /></div>}
      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!busy && immunizations.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No immunizations recorded.</div>}
      <div className="flex flex-col gap-2">
        {immunizations.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-card-foreground">{i.vaccine_name}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  i.administered_on,
                  i.manufacturer,
                  i.lot_number ? `Lot: ${i.lot_number}` : null,
                  i.dose_number != null && i.series_doses != null ? `Dose ${i.dose_number}/${i.series_doses}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
