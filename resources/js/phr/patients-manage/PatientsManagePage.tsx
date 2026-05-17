import { useState } from 'react'

import PatientForm from '@/phr/patients/PatientForm'
import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'

export default function PatientsManagePage() {
  const { patients, selectedPatientId, busy, error, setSelectedPatientId, upsertPatient } = usePhrPatients()
  const [submitBusy, setSubmitBusy] = useState(false)

  return (
    <PhrShell activeTab="patients-manage" patientId={selectedPatientId} busy={busy || submitBusy} error={error}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientForm onCreated={upsertPatient} setBusy={setSubmitBusy} />
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />
      </div>
    </PhrShell>
  )
}
