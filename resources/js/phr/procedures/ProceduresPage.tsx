import PhrShell from '@/phr/PhrShell'
import { readPatientIdFromQuery } from '@/phr/shared'

export default function ProceduresPage() {
  const patientId = readPatientIdFromQuery()

  return (
    <PhrShell activeTab="procedures" patientId={patientId}>
      <section className="rounded-md border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Procedures — coming soon.</p>
      </section>
    </PhrShell>
  )
}
