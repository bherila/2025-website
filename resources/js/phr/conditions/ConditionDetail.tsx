interface ConditionDetailProps {
  patientId: number
  recordId: string
}

export default function ConditionDetail({ patientId, recordId }: ConditionDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Condition {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Status, dates, and related labs/notes coming soon.</p>
    </div>
  )
}
