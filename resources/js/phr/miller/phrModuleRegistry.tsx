import type React from 'react'
import { lazy } from 'react'

import type { KeyAmount, MillerDrillTarget, MillerRegistryEntry, MillerRenderProps } from '@/components/ui/miller'

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

export type PhrModuleCategory = 'Clinical' | 'Documents & Imaging' | 'Admin'

export interface PhrModuleMeta {
  category: PhrModuleCategory
  keywords: string[]
  keyAmounts?: (state: PhrShellState) => KeyAmount[] | null
  hasData?: (state: PhrShellState) => boolean
}

export interface PhrRegistryEntry extends MillerRegistryEntry<PhrShellState, PhrModuleId, PhrModuleMeta> {
  category: PhrModuleCategory
  keywords: string[]
  keyAmounts?: (state: PhrShellState) => KeyAmount[] | null
  hasData?: (state: PhrShellState) => boolean
}

export interface PhrModuleDefinition {
  id: PhrModuleId
  label: string
  shortLabel: string
  category: PhrModuleCategory
  keywords: string[]
}

type PhrColumnSize = PhrRegistryEntry['size']
export type PhrRenderProps = MillerRenderProps<PhrShellState, PhrModuleId>

export function getPhrModuleMeta(entry: PhrRegistryEntry): PhrModuleMeta {
  const meta = entry.meta ?? {
    category: entry.category,
    keywords: entry.keywords,
  }

  return {
    category: meta.category,
    keywords: meta.keywords,
    ...(meta.keyAmounts ?? entry.keyAmounts ? { keyAmounts: meta.keyAmounts ?? entry.keyAmounts } : {}),
    ...(meta.hasData ?? entry.hasData ? { hasData: meta.hasData ?? entry.hasData } : {}),
  }
}

const SUMMARY_MODULE = {
  id: 'summary',
  label: 'Summary',
  shortLabel: 'Summary',
  category: 'Clinical',
  keywords: ['summary', 'overview', 'health'],
} satisfies PhrModuleDefinition

const LABS_MODULE = {
  id: 'labs',
  label: 'Labs',
  shortLabel: 'Labs',
  category: 'Clinical',
  keywords: ['labs', 'laboratory', 'results', 'bloodwork'],
} satisfies PhrModuleDefinition

const VITALS_MODULE = {
  id: 'vitals',
  label: 'Vitals',
  shortLabel: 'Vitals',
  category: 'Clinical',
  keywords: ['vitals', 'blood pressure', 'weight', 'height'],
} satisfies PhrModuleDefinition

const IMAGING_MODULE = {
  id: 'imaging',
  label: 'Imaging',
  shortLabel: 'Imaging',
  category: 'Documents & Imaging',
  keywords: ['imaging', 'radiology', 'xray', 'mri', 'ct'],
} satisfies PhrModuleDefinition

const OFFICE_VISITS_MODULE = {
  id: 'office-visits',
  label: 'Office Visits',
  shortLabel: 'Visits',
  category: 'Clinical',
  keywords: ['visits', 'appointments', 'encounters'],
} satisfies PhrModuleDefinition

const MEDICATIONS_MODULE = {
  id: 'medications',
  label: 'Medications',
  shortLabel: 'Meds',
  category: 'Clinical',
  keywords: ['medications', 'prescriptions', 'drugs', 'rx'],
} satisfies PhrModuleDefinition

const CONDITIONS_MODULE = {
  id: 'conditions',
  label: 'Conditions',
  shortLabel: 'Conditions',
  category: 'Clinical',
  keywords: ['conditions', 'diagnoses', 'problems'],
} satisfies PhrModuleDefinition

const PROCEDURES_MODULE = {
  id: 'procedures',
  label: 'Procedures',
  shortLabel: 'Procedures',
  category: 'Clinical',
  keywords: ['procedures', 'surgery', 'treatments'],
} satisfies PhrModuleDefinition

const IMMUNIZATIONS_MODULE = {
  id: 'immunizations',
  label: 'Immunizations',
  shortLabel: 'Immun.',
  category: 'Clinical',
  keywords: ['immunizations', 'vaccines', 'shots'],
} satisfies PhrModuleDefinition

const ALLERGIES_MODULE = {
  id: 'allergies',
  label: 'Allergies',
  shortLabel: 'Allergies',
  category: 'Clinical',
  keywords: ['allergies', 'reactions'],
} satisfies PhrModuleDefinition

const DOCUMENTS_MODULE = {
  id: 'documents',
  label: 'Documents',
  shortLabel: 'Docs',
  category: 'Documents & Imaging',
  keywords: ['documents', 'files', 'records', 'upload'],
} satisfies PhrModuleDefinition

const ACCESS_MODULE = {
  id: 'access',
  label: 'Access',
  shortLabel: 'Access',
  category: 'Admin',
  keywords: ['access', 'sharing', 'permissions', 'caregivers'],
} satisfies PhrModuleDefinition

const LAB_PANEL_DETAIL_MODULE = {
  id: 'lab-panel-detail',
  label: 'Lab Panel',
  shortLabel: 'Lab Panel',
  category: LABS_MODULE.category,
  keywords: LABS_MODULE.keywords,
} satisfies PhrModuleDefinition

const VITALS_READING_DETAIL_MODULE = {
  id: 'vitals-reading-detail',
  label: 'Vital Reading',
  shortLabel: 'Vital',
  category: VITALS_MODULE.category,
  keywords: VITALS_MODULE.keywords,
} satisfies PhrModuleDefinition

const VITALS_TREND_MODULE = {
  id: 'vitals-trend',
  label: 'Vitals Trend',
  shortLabel: 'Trend',
  category: VITALS_MODULE.category,
  keywords: VITALS_MODULE.keywords,
} satisfies PhrModuleDefinition

const IMAGING_STUDY_DETAIL_MODULE = {
  id: 'imaging-study-detail',
  label: 'Study Detail',
  shortLabel: 'Study',
  category: IMAGING_MODULE.category,
  keywords: IMAGING_MODULE.keywords,
} satisfies PhrModuleDefinition

const OFFICE_VISIT_DETAIL_MODULE = {
  id: 'office-visit-detail',
  label: 'Visit Detail',
  shortLabel: 'Visit',
  category: OFFICE_VISITS_MODULE.category,
  keywords: OFFICE_VISITS_MODULE.keywords,
} satisfies PhrModuleDefinition

const MEDICATION_DETAIL_MODULE = {
  id: 'medication-detail',
  label: 'Medication Detail',
  shortLabel: 'Medication',
  category: MEDICATIONS_MODULE.category,
  keywords: MEDICATIONS_MODULE.keywords,
} satisfies PhrModuleDefinition

const CONDITION_DETAIL_MODULE = {
  id: 'condition-detail',
  label: 'Condition Detail',
  shortLabel: 'Condition',
  category: CONDITIONS_MODULE.category,
  keywords: CONDITIONS_MODULE.keywords,
} satisfies PhrModuleDefinition

const PROCEDURE_DETAIL_MODULE = {
  id: 'procedure-detail',
  label: 'Procedure Detail',
  shortLabel: 'Procedure',
  category: PROCEDURES_MODULE.category,
  keywords: PROCEDURES_MODULE.keywords,
} satisfies PhrModuleDefinition

const IMMUNIZATION_DETAIL_MODULE = {
  id: 'immunization-detail',
  label: 'Immunization Detail',
  shortLabel: 'Immunization',
  category: IMMUNIZATIONS_MODULE.category,
  keywords: IMMUNIZATIONS_MODULE.keywords,
} satisfies PhrModuleDefinition

const ALLERGY_DETAIL_MODULE = {
  id: 'allergy-detail',
  label: 'Allergy Detail',
  shortLabel: 'Allergy',
  category: ALLERGIES_MODULE.category,
  keywords: ALLERGIES_MODULE.keywords,
} satisfies PhrModuleDefinition

const DOCUMENT_VIEWER_MODULE = {
  id: 'document-viewer',
  label: 'Document Viewer',
  shortLabel: 'Document',
  category: DOCUMENTS_MODULE.category,
  keywords: DOCUMENTS_MODULE.keywords,
} satisfies PhrModuleDefinition

const ACCESS_GRANT_DETAIL_MODULE = {
  id: 'access-grant-detail',
  label: 'Access Grant',
  shortLabel: 'Grant',
  category: ACCESS_MODULE.category,
  keywords: ACCESS_MODULE.keywords,
} satisfies PhrModuleDefinition

export const PHR_LIST_MODULES: PhrModuleDefinition[] = [
  SUMMARY_MODULE,
  LABS_MODULE,
  VITALS_MODULE,
  IMAGING_MODULE,
  OFFICE_VISITS_MODULE,
  MEDICATIONS_MODULE,
  CONDITIONS_MODULE,
  PROCEDURES_MODULE,
  IMMUNIZATIONS_MODULE,
  ALLERGIES_MODULE,
  DOCUMENTS_MODULE,
  ACCESS_MODULE,
]

export const PHR_DETAIL_MODULES: PhrModuleDefinition[] = [
  LAB_PANEL_DETAIL_MODULE,
  VITALS_READING_DETAIL_MODULE,
  VITALS_TREND_MODULE,
  IMAGING_STUDY_DETAIL_MODULE,
  OFFICE_VISIT_DETAIL_MODULE,
  MEDICATION_DETAIL_MODULE,
  CONDITION_DETAIL_MODULE,
  PROCEDURE_DETAIL_MODULE,
  IMMUNIZATION_DETAIL_MODULE,
  ALLERGY_DETAIL_MODULE,
  DOCUMENT_VIEWER_MODULE,
  ACCESS_GRANT_DETAIL_MODULE,
]

export interface PhrListPageProps {
  patientId: number
  onDrill?: (target: MillerDrillTarget<PhrModuleId>) => void
}

interface PhrDetailPageProps {
  patientId: number
  recordId: string
}

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

function makeListModule(
  module: PhrModuleDefinition,
  PageComponent: React.ComponentType<PhrListPageProps>,
  size?: PhrColumnSize,
): PhrRegistryEntry {
  const { id, label, shortLabel, category, keywords } = module
  function ListColumn({ state, onDrill }: PhrRenderProps) {
    if (state.patientId === undefined) return noPatientState()
    return <PageComponent patientId={state.patientId} onDrill={onDrill} />
  }
  ListColumn.displayName = `${id}ListColumn`
  const entry: PhrRegistryEntry = {
    id,
    label,
    shortLabel,
    category,
    keywords,
    presentation: 'column',
    component: ListColumn,
    meta: { category, keywords },
  }
  if (size !== undefined) entry.size = size
  return entry
}

function makeDetailModule(
  module: PhrModuleDefinition,
  DetailComponent: React.ComponentType<PhrDetailPageProps>,
  size?: PhrColumnSize,
): PhrRegistryEntry {
  const { id, label, shortLabel, category, keywords } = module
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
  const entry: PhrRegistryEntry = {
    id,
    label,
    shortLabel,
    category,
    keywords,
    presentation: 'column',
    component: DetailColumn,
    meta: { category, keywords },
  }
  if (size !== undefined) entry.size = size
  return entry
}

export const phrModuleRegistry: Record<PhrModuleId, PhrRegistryEntry> = {
  summary: makeListModule(SUMMARY_MODULE, SummaryPage),
  labs: makeListModule(LABS_MODULE, LabsPage),
  'lab-panel-detail': makeDetailModule(LAB_PANEL_DETAIL_MODULE, LabPanelDetail),
  vitals: makeListModule(VITALS_MODULE, VitalsPage),
  'vitals-reading-detail': makeDetailModule(VITALS_READING_DETAIL_MODULE, VitalsReadingDetail),
  'vitals-trend': makeDetailModule(VITALS_TREND_MODULE, VitalsTrend, 'wide'),
  imaging: makeListModule(IMAGING_MODULE, ImagingPage),
  'imaging-study-detail': makeDetailModule(IMAGING_STUDY_DETAIL_MODULE, ImagingStudyDetail),
  'office-visits': makeListModule(OFFICE_VISITS_MODULE, OfficeVisitsPage),
  'office-visit-detail': makeDetailModule(OFFICE_VISIT_DETAIL_MODULE, OfficeVisitDetail),
  medications: makeListModule(MEDICATIONS_MODULE, MedicationsPage),
  'medication-detail': makeDetailModule(MEDICATION_DETAIL_MODULE, MedicationDetail),
  conditions: makeListModule(CONDITIONS_MODULE, ConditionsPage),
  'condition-detail': makeDetailModule(CONDITION_DETAIL_MODULE, ConditionDetail),
  procedures: makeListModule(PROCEDURES_MODULE, ProceduresPage),
  'procedure-detail': makeDetailModule(PROCEDURE_DETAIL_MODULE, ProcedureDetail),
  immunizations: makeListModule(IMMUNIZATIONS_MODULE, ImmunizationsPage),
  'immunization-detail': makeDetailModule(IMMUNIZATION_DETAIL_MODULE, ImmunizationDetail),
  allergies: makeListModule(ALLERGIES_MODULE, AllergiesPage),
  'allergy-detail': makeDetailModule(ALLERGY_DETAIL_MODULE, AllergyDetail),
  documents: makeListModule(DOCUMENTS_MODULE, DocumentsPage, 'full'),
  'document-viewer': makeDetailModule(DOCUMENT_VIEWER_MODULE, DocumentViewer, 'wide'),
  access: makeListModule(ACCESS_MODULE, AccessPage),
  'access-grant-detail': makeDetailModule(ACCESS_GRANT_DETAIL_MODULE, AccessGrantDetail),
}
