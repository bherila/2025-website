import { FlaskConical, HeartPulse } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'
import { errorMessage } from '@/phr/shared'
import { type PhrLabResult, PhrLabResultsResponseSchema, type PhrVital, PhrVitalsResponseSchema } from '@/phr/types'

export default function SummaryPage() {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId } = usePhrPatients()
  const [recordsBusy, setRecordsBusy] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [labs, setLabs] = useState<PhrLabResult[]>([])
  const [vitals, setVitals] = useState<PhrVital[]>([])

  useEffect(() => {
    if (selectedPatientId === null) {
      setLabs([])
      setVitals([])
      return
    }

    void (async () => {
      setRecordsBusy(true)
      setRecordError(null)
      try {
        const [rawLabs, rawVitals] = await Promise.all([
          fetchWrapper.get(`/api/phr/patients/${selectedPatientId}/lab-results`),
          fetchWrapper.get(`/api/phr/patients/${selectedPatientId}/vitals`),
        ])
        setLabs(PhrLabResultsResponseSchema.parse(rawLabs).lab_results)
        setVitals(PhrVitalsResponseSchema.parse(rawVitals).vitals)
      } catch (caught) {
        setRecordError(errorMessage(caught))
      } finally {
        setRecordsBusy(false)
      }
    })()
  }, [selectedPatientId])

  return (
    <PhrShell activeTab="summary" patientId={selectedPatientId} busy={busy || recordsBusy} error={error ?? recordError}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
        <section className="rounded-md border border-border bg-card p-4">
          {!selectedPatient ? (
            <p className="text-sm text-muted-foreground">Select a profile to view summary.</p>
          ) : (
            <div className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">{selectedPatient.display_name}</h2>
                <p className="text-sm text-muted-foreground">{selectedPatient.relationship || 'Profile'} summary</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Recent Labs</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{labs.length} result{labs.length === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">Recent Vitals</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{vitals.length} reading{vitals.length === 1 ? '' : 's'}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </PhrShell>
  )
}
