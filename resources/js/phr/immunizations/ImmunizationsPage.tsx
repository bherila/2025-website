import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function ImmunizationsPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="immunizations" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Immunizations — coming soon.</p>
      </section>
    </PhrShell>
  )
}
