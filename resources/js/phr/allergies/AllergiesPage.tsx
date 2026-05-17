import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function AllergiesPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="allergies" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Allergies — coming soon.</p>
      </section>
    </PhrShell>
  )
}
