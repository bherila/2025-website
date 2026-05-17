import { Plus, Share2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'
import { errorMessage } from '@/phr/shared'
import { type PhrAccessGrant, PhrAccessResponseSchema } from '@/phr/types'

export default function AccessPage({ patientId: _patientId }: { patientId: number }) {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId, upsertPatient, reloadPatients } = usePhrPatients()
  const [submitBusy, setSubmitBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [accessLevel, setAccessLevel] = useState<'manager' | 'viewer'>('viewer')
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selectedPatient) {
      return
    }

    setFormError(null)
    setSubmitBusy(true)
    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${selectedPatient.id}/access`, {
        email,
        access_level: accessLevel,
      })
      const response = PhrAccessResponseSchema.parse(rawResponse)
      upsertPatient(response.patient)
      setEmail('')
    } catch (caught) {
      setFormError(errorMessage(caught))
    } finally {
      setSubmitBusy(false)
    }
  }

  async function revoke(access: PhrAccessGrant): Promise<void> {
    if (!selectedPatient || access.access_level === 'owner') {
      return
    }

    setSubmitBusy(true)
    setFormError(null)
    try {
      await fetchWrapper.delete(`/api/phr/patients/${selectedPatient.id}/access/${access.id}`, {})
      await reloadPatients()
    } catch (caught) {
      setFormError(errorMessage(caught))
    } finally {
      setSubmitBusy(false)
    }
  }

  return (
    <PhrShell activeTab="access" patientId={selectedPatientId} busy={busy || submitBusy} error={error}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />

        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <Share2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-card-foreground">Sharing</h2>
          </div>

          {!selectedPatient?.can_share ? (
            <p className="text-sm text-muted-foreground">Select a profile you own to manage sharing access.</p>
          ) : (
            <>
              <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]" onSubmit={(event) => void submit(event)}>
                <label className="grid gap-1 text-sm font-medium text-foreground">
                  Email
                  <input
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
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
              {formError ? <p className="mt-3 text-sm text-destructive">{formError}</p> : null}
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
            </>
          )}
        </section>
      </div>
    </PhrShell>
  )
}
