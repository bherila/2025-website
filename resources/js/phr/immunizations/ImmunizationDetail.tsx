interface ImmunizationDetailProps {
  patientId: number
  recordId: string
}

export default function ImmunizationDetail({ patientId, recordId }: ImmunizationDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Immunization {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Vaccine, lot, date, and provider coming soon.</p>
    </div>
  )
}
