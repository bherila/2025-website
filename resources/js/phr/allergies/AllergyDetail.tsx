interface AllergyDetailProps {
  patientId: number
  recordId: string
}

export default function AllergyDetail({ patientId, recordId }: AllergyDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Allergy {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Substance, reaction, and severity coming soon.</p>
    </div>
  )
}
