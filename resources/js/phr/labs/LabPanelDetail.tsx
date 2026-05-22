interface LabPanelDetailProps {
  patientId: number
  recordId: string
}

export default function LabPanelDetail({ patientId, recordId }: LabPanelDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Record {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Lab panel detail coming soon.</p>
    </div>
  )
}
