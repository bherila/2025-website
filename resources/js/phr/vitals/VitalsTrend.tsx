interface VitalsTrendProps {
  patientId: number
  recordId: string
}

export default function VitalsTrend({ patientId, recordId }: VitalsTrendProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Vital {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Vitals trend chart coming soon.</p>
    </div>
  )
}
