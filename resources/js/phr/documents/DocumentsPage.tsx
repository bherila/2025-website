import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function DocumentsPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="documents" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Documents — coming soon.</p>
      </section>
    </PhrShell>
  )
}
