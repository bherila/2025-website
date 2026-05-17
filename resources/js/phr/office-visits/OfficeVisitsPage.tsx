import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function OfficeVisitsPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="office-visits" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Office Visits — coming soon.</p>
      </section>
    </PhrShell>
  )
}
