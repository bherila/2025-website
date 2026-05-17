import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function ConditionsPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="conditions" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Conditions — coming soon.</p>
      </section>
    </PhrShell>
  )
}
