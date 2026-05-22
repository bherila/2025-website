interface OfficeVisitDetailProps {
  patientId: number
  recordId: string
}

export default function OfficeVisitDetail({ patientId, recordId }: OfficeVisitDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Visit {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Visit notes, providers, and attachments coming soon.</p>
    </div>
  )
}
