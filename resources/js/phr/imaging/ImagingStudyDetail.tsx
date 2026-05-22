interface ImagingStudyDetailProps {
  patientId: number
  recordId: string
}

export default function ImagingStudyDetail({ patientId, recordId }: ImagingStudyDetailProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Patient {patientId} · Study {recordId}
      </p>
      <p className="text-sm text-muted-foreground">Study metadata and series detail coming soon.</p>
    </div>
  )
}
