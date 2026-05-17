import { AlertTriangle, FlaskConical, HeartPulse, ImageIcon, Pill, Stethoscope, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import { patientTabUrl } from '@/lib/phrRouteBuilder'
import { errorMessage } from '@/phr/shared'
import {
  type PhrDicomStudy,
  PhrDicomStudiesResponseSchema,
  type PhrLabResult,
  PhrLabResultsResponseSchema,
  type PhrPatient,
  PhrPatientResponseSchema,
  type PhrVital,
  PhrVitalsResponseSchema,
} from '@/phr/types'

interface TileProps {
  icon: React.ReactNode
  title: string
  href: string
  children: React.ReactNode
}

function Tile({ icon, title, href, children }: TileProps) {
  return (
    <a
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground group-hover:text-primary">{icon}</span>
        <h2 className="text-sm font-semibold text-card-foreground">{title}</h2>
      </div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </a>
  )
}

function recentAbnormal(labs: PhrLabResult[]): PhrLabResult[] {
  return labs.filter((l) => l.abnormal_flag && l.abnormal_flag !== 'N').slice(0, 5)
}

function mostRecentDate(studies: PhrDicomStudy[]): string | null {
  const dates = studies.map((s) => s.study_date).filter(Boolean)
  if (dates.length === 0) {
    return null
  }
  return dates.sort().reverse()[0] ?? null
}

export default function SummaryPage({ patientId }: { patientId: number }) {
  const [patient, setPatient] = useState<PhrPatient | null>(null)
  const [labs, setLabs] = useState<PhrLabResult[]>([])
  const [vitals, setVitals] = useState<PhrVital[]>([])
  const [studies, setStudies] = useState<PhrDicomStudy[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawPatient, rawLabs, rawVitals, rawStudies] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
        fetchWrapper.get(`/api/phr/patients/${patientId}/lab-results`),
        fetchWrapper.get(`/api/phr/patients/${patientId}/vitals`),
        fetchWrapper.get(`/api/phr/patients/${patientId}/dicom/studies`),
      ])
      setPatient(PhrPatientResponseSchema.parse(rawPatient).patient)
      setLabs(PhrLabResultsResponseSchema.parse(rawLabs).lab_results)
      setVitals(PhrVitalsResponseSchema.parse(rawVitals).vitals)
      setStudies(PhrDicomStudiesResponseSchema.parse(rawStudies).studies)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  if (busy) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </div>
    )
  }

  const abnormalLabs = recentAbnormal(labs)
  const recentStudyDate = mostRecentDate(studies)

  const vitalNames = Array.from(new Set(vitals.map((v) => v.vital_name).filter(Boolean)))
  const recentLabs = labs.slice(0, 5)

  const accessGrants = patient?.access_grants ?? []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{patient?.display_name ?? 'Summary'}</h1>
        {patient?.relationship && (
          <p className="mt-1 text-sm text-muted-foreground">{patient.relationship}</p>
        )}
      </div>

      {abnormalLabs.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-400/50 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {abnormalLabs.length} abnormal lab result{abnormalLabs.length === 1 ? '' : 's'} — check the{' '}
            <a href={patientTabUrl('labs', patientId)} className="underline">
              Labs tab
            </a>
            .
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={<FlaskConical className="size-4" />} title="Labs" href={patientTabUrl('labs', patientId)}>
          {labs.length === 0 ? (
            'No lab results recorded.'
          ) : (
            <>
              <span className="font-medium text-foreground">{labs.length}</span> result{labs.length === 1 ? '' : 's'}
              {abnormalLabs.length > 0 && (
                <span className="ml-2 font-medium text-yellow-700 dark:text-yellow-400">
                  ({abnormalLabs.length} abnormal)
                </span>
              )}
              {recentLabs[0]?.collection_datetime && (
                <p className="mt-1 text-xs">Most recent: {recentLabs[0].collection_datetime.slice(0, 10)}</p>
              )}
            </>
          )}
        </Tile>

        <Tile icon={<HeartPulse className="size-4" />} title="Vitals" href={patientTabUrl('vitals', patientId)}>
          {vitals.length === 0 ? (
            'No vitals recorded.'
          ) : (
            <>
              <span className="font-medium text-foreground">{vitals.length}</span> reading{vitals.length === 1 ? '' : 's'}
              {vitalNames.length > 0 && (
                <p className="mt-1 text-xs truncate">{vitalNames.slice(0, 4).join(' · ')}</p>
              )}
            </>
          )}
        </Tile>

        <Tile icon={<ImageIcon className="size-4" />} title="Imaging" href={patientTabUrl('imaging', patientId)}>
          {studies.length === 0 ? (
            'No imaging studies recorded.'
          ) : (
            <>
              <span className="font-medium text-foreground">{studies.length}</span> stud{studies.length === 1 ? 'y' : 'ies'}
              {recentStudyDate && (
                <p className="mt-1 text-xs">Most recent: {recentStudyDate}</p>
              )}
            </>
          )}
        </Tile>

        <Tile icon={<Stethoscope className="size-4" />} title="Conditions" href={patientTabUrl('conditions', patientId)}>
          Coming soon.
        </Tile>

        <Tile icon={<Pill className="size-4" />} title="Medications" href={patientTabUrl('medications', patientId)}>
          Coming soon.
        </Tile>

        <Tile icon={<Users className="size-4" />} title="Access" href={patientTabUrl('access', patientId)}>
          {patient?.can_share === false ? (
            'Shared with you.'
          ) : accessGrants.length <= 1 ? (
            'Only you have access.'
          ) : (
            <>
              Shared with{' '}
              <span className="font-medium text-foreground">{accessGrants.length - 1}</span>{' '}
              other{accessGrants.length - 1 === 1 ? '' : 's'}.
            </>
          )}
        </Tile>
      </div>
    </div>
  )
}
