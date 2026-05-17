import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function MedicationsPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="medications" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Medications — coming soon.</p>
      </section>
    </PhrShell>
  )
}
