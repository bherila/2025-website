interface DocumentViewerProps {
  patientId: number
  recordId: string
}

export default function DocumentViewer({ patientId, recordId }: DocumentViewerProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Document {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Inline PDF/image viewer with download coming soon.</p>
    </div>
  )
}
