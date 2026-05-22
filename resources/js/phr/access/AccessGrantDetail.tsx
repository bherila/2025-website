interface AccessGrantDetailProps {
  patientId: number
  recordId: string
}

export default function AccessGrantDetail({ patientId, recordId }: AccessGrantDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Grant {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Grantee, scope, and expiry coming soon.</p>
    </div>
  )
}
