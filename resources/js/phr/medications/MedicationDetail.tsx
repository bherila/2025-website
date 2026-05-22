interface MedicationDetailProps {
  patientId: number
  recordId: string
}

export default function MedicationDetail({ patientId, recordId }: MedicationDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Medication {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Current dose, history, and prescriber coming soon.</p>
    </div>
  )
}
