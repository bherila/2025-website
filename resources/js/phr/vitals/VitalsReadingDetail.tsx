interface VitalsReadingDetailProps {
  patientId: number
  recordId: string
}

export default function VitalsReadingDetail({ patientId, recordId }: VitalsReadingDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Record {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Vital reading detail coming soon.</p>
    </div>
  )
}
