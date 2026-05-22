import type React from 'react'
import { lazy } from 'react'

import type { MillerRegistryEntry, MillerRenderProps } from '@/components/ui/miller'

export type PhrModuleId =
  | 'summary'
  | 'labs'
  | 'lab-panel-detail'
  | 'vitals'
  | 'vitals-reading-detail'
  | 'vitals-trend'
  | 'imaging'
  | 'imaging-study-detail'
  | 'office-visits'
  | 'office-visit-detail'
  | 'medications'
  | 'medication-detail'
  | 'conditions'
  | 'condition-detail'
  | 'procedures'
  | 'procedure-detail'
  | 'immunizations'
  | 'immunization-detail'
  | 'allergies'
  | 'allergy-detail'
  | 'documents'
  | 'document-viewer'
  | 'access'
  | 'access-grant-detail'

export const PHR_MODULE_IDS: readonly PhrModuleId[] = [
  'summary',
  'labs',
  'lab-panel-detail',
  'vitals',
  'vitals-reading-detail',
  'vitals-trend',
  'imaging',
  'imaging-study-detail',
  'office-visits',
  'office-visit-detail',
  'medications',
  'medication-detail',
  'conditions',
  'condition-detail',
  'procedures',
  'procedure-detail',
  'immunizations',
  'immunization-detail',
  'allergies',
  'allergy-detail',
  'documents',
  'document-viewer',
  'access',
  'access-grant-detail',
]

export const PHR_MODULE_IDS_SET: ReadonlySet<string> = new Set<string>(PHR_MODULE_IDS)

export interface PhrShellState {
  patientId: number | undefined
}

export const PHR_LIST_MODULES: { id: PhrModuleId; label: string; shortLabel: string }[] = [
  { id: 'summary', label: 'Summary', shortLabel: 'Summary' },
  { id: 'labs', label: 'Labs', shortLabel: 'Labs' },
  { id: 'vitals', label: 'Vitals', shortLabel: 'Vitals' },
  { id: 'imaging', label: 'Imaging', shortLabel: 'Imaging' },
  { id: 'office-visits', label: 'Office Visits', shortLabel: 'Visits' },
  { id: 'medications', label: 'Medications', shortLabel: 'Meds' },
  { id: 'conditions', label: 'Conditions', shortLabel: 'Conditions' },
  { id: 'procedures', label: 'Procedures', shortLabel: 'Procedures' },
  { id: 'immunizations', label: 'Immunizations', shortLabel: 'Immun.' },
  { id: 'allergies', label: 'Allergies', shortLabel: 'Allergies' },
  { id: 'documents', label: 'Documents', shortLabel: 'Docs' },
  { id: 'access', label: 'Access', shortLabel: 'Access' },
]

export type PhrModuleMeta = Record<string, never>

export type PhrRegistryEntry = MillerRegistryEntry<PhrShellState, PhrModuleId, PhrModuleMeta>
export type PhrRenderProps = MillerRenderProps<PhrShellState, PhrModuleId>

const SummaryPage = lazy(() => import('@/phr/summary/SummaryPage'))
const LabsPage = lazy(() => import('@/phr/labs/LabsPage'))
const LabPanelDetail = lazy(() => import('@/phr/labs/LabPanelDetail'))
const VitalsPage = lazy(() => import('@/phr/vitals/VitalsPage'))
const VitalsReadingDetail = lazy(() => import('@/phr/vitals/VitalsReadingDetail'))
const VitalsTrend = lazy(() => import('@/phr/vitals/VitalsTrend'))
const ImagingPage = lazy(() => import('@/phr/imaging/ImagingPage'))
const ImagingStudyDetail = lazy(() => import('@/phr/imaging/ImagingStudyDetail'))
const OfficeVisitsPage = lazy(() => import('@/phr/office-visits/OfficeVisitsPage'))
const OfficeVisitDetail = lazy(() => import('@/phr/office-visits/OfficeVisitDetail'))
const MedicationsPage = lazy(() => import('@/phr/medications/MedicationsPage'))
const MedicationDetail = lazy(() => import('@/phr/medications/MedicationDetail'))
const ConditionsPage = lazy(() => import('@/phr/conditions/ConditionsPage'))
const ConditionDetail = lazy(() => import('@/phr/conditions/ConditionDetail'))
const ProceduresPage = lazy(() => import('@/phr/procedures/ProceduresPage'))
const ProcedureDetail = lazy(() => import('@/phr/procedures/ProcedureDetail'))
const ImmunizationsPage = lazy(() => import('@/phr/immunizations/ImmunizationsPage'))
const ImmunizationDetail = lazy(() => import('@/phr/immunizations/ImmunizationDetail'))
const AllergiesPage = lazy(() => import('@/phr/allergies/AllergiesPage'))
const AllergyDetail = lazy(() => import('@/phr/allergies/AllergyDetail'))
const DocumentsPage = lazy(() => import('@/phr/documents/DocumentsPage'))
const DocumentViewer = lazy(() => import('@/phr/documents/DocumentViewer'))
const AccessPage = lazy(() => import('@/phr/access/AccessPage'))
const AccessGrantDetail = lazy(() => import('@/phr/access/AccessGrantDetail'))

function noPatientState() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      Choose a patient first.
    </div>
  )
}

function makeListEntry(
  id: PhrModuleId,
  label: string,
  shortLabel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PageComponent: React.ComponentType<any>,
): PhrRegistryEntry {
  function ListColumn({ state }: PhrRenderProps) {
    if (state.patientId === undefined) return noPatientState()
    return <PageComponent patientId={state.patientId} />
  }
  ListColumn.displayName = `${id}ListColumn`
  return { id, label, shortLabel, presentation: 'column', component: ListColumn }
}

function makeDetailEntry(
  id: PhrModuleId,
  label: string,
  shortLabel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DetailComponent: React.ComponentType<any>,
  wide = false,
): PhrRegistryEntry {
  function DetailColumn({ state, instance }: PhrRenderProps) {
    if (state.patientId === undefined) return noPatientState()
    if (!instance?.key) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No record selected.
        </div>
      )
    }
    return <DetailComponent patientId={state.patientId} recordId={instance.key} />
  }
  DetailColumn.displayName = `${id}DetailColumn`
  const entry: PhrRegistryEntry = { id, label, shortLabel, presentation: 'column', component: DetailColumn }
  if (wide) entry.wide = true
  return entry
}

export const phrModuleRegistry: Record<PhrModuleId, PhrRegistryEntry> = {
  summary: makeListEntry('summary', 'Summary', 'Summary', SummaryPage),
  labs: makeListEntry('labs', 'Labs', 'Labs', LabsPage),
  'lab-panel-detail': makeDetailEntry('lab-panel-detail', 'Lab Panel', 'Lab Panel', LabPanelDetail),
  vitals: makeListEntry('vitals', 'Vitals', 'Vitals', VitalsPage),
  'vitals-reading-detail': makeDetailEntry('vitals-reading-detail', 'Vital Reading', 'Vital', VitalsReadingDetail),
  'vitals-trend': makeDetailEntry('vitals-trend', 'Vitals Trend', 'Trend', VitalsTrend, true),
  imaging: makeListEntry('imaging', 'Imaging', 'Imaging', ImagingPage),
  'imaging-study-detail': makeDetailEntry('imaging-study-detail', 'Study Detail', 'Study', ImagingStudyDetail),
  'office-visits': makeListEntry('office-visits', 'Office Visits', 'Visits', OfficeVisitsPage),
  'office-visit-detail': makeDetailEntry('office-visit-detail', 'Visit Detail', 'Visit', OfficeVisitDetail),
  medications: makeListEntry('medications', 'Medications', 'Meds', MedicationsPage),
  'medication-detail': makeDetailEntry('medication-detail', 'Medication Detail', 'Medication', MedicationDetail),
  conditions: makeListEntry('conditions', 'Conditions', 'Conditions', ConditionsPage),
  'condition-detail': makeDetailEntry('condition-detail', 'Condition Detail', 'Condition', ConditionDetail),
  procedures: makeListEntry('procedures', 'Procedures', 'Procedures', ProceduresPage),
  'procedure-detail': makeDetailEntry('procedure-detail', 'Procedure Detail', 'Procedure', ProcedureDetail),
  immunizations: makeListEntry('immunizations', 'Immunizations', 'Immun.', ImmunizationsPage),
  'immunization-detail': makeDetailEntry('immunization-detail', 'Immunization Detail', 'Immunization', ImmunizationDetail),
  allergies: makeListEntry('allergies', 'Allergies', 'Allergies', AllergiesPage),
  'allergy-detail': makeDetailEntry('allergy-detail', 'Allergy Detail', 'Allergy', AllergyDetail),
  documents: makeListEntry('documents', 'Documents', 'Docs', DocumentsPage),
  'document-viewer': makeDetailEntry('document-viewer', 'Document Viewer', 'Document', DocumentViewer, true),
  access: makeListEntry('access', 'Access', 'Access', AccessPage),
  'access-grant-detail': makeDetailEntry('access-grant-detail', 'Access Grant', 'Grant', AccessGrantDetail),
}
