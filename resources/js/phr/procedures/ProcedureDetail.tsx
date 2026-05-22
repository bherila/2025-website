interface ProcedureDetailProps {
  patientId: number
  recordId: string
}

export default function ProcedureDetail({ patientId, recordId }: ProcedureDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Procedure {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Date, provider, and complications coming soon.</p>
    </div>
  )
}
