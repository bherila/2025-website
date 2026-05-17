import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'

export default function PatientsPage() {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId } = usePhrPatients()

  return (
    <PhrShell activeTab="patients" patientId={selectedPatientId} busy={busy} error={error}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-card-foreground">Selected Profile</h2>
          {selectedPatient ? (
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">Name</dt>
                <dd>{selectedPatient.display_name}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Relationship</dt>
                <dd>{selectedPatient.relationship || 'Profile'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Access</dt>
                <dd>{selectedPatient.access_level ?? 'viewer'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Select a profile to view details.</p>
          )}
        </section>
      </div>
    </PhrShell>
  )
}
