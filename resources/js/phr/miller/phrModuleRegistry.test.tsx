import { render, screen } from '@testing-library/react'
import type React from 'react'
import { Suspense } from 'react'

import type { MillerDrillTarget } from '@/components/ui/miller'

import type { PhrModuleId } from './phrModuleRegistry'
import { phrModuleRegistry } from './phrModuleRegistry'

interface MockListPageProps {
  patientId: number
  onDrill?: (target: MillerDrillTarget<PhrModuleId>) => void
}

const capturedListProps: Partial<Record<PhrModuleId, MockListPageProps>> = {}

function makeMockListPage(moduleId: PhrModuleId) {
  return function MockListPage({ patientId, onDrill }: MockListPageProps): React.ReactElement {
    if (onDrill === undefined) {
      capturedListProps[moduleId] = { patientId }
    } else {
      capturedListProps[moduleId] = { patientId, onDrill }
    }
    return <div data-testid={`mock-${moduleId}`}>{moduleId}</div>
  }
}

jest.mock('@/phr/labs/LabsPage', () => ({ __esModule: true, default: makeMockListPage('labs') }))
jest.mock('@/phr/vitals/VitalsPage', () => ({ __esModule: true, default: makeMockListPage('vitals') }))
jest.mock('@/phr/imaging/ImagingPage', () => ({ __esModule: true, default: makeMockListPage('imaging') }))
jest.mock('@/phr/office-visits/OfficeVisitsPage', () => ({ __esModule: true, default: makeMockListPage('office-visits') }))
jest.mock('@/phr/medications/MedicationsPage', () => ({ __esModule: true, default: makeMockListPage('medications') }))
jest.mock('@/phr/conditions/ConditionsPage', () => ({ __esModule: true, default: makeMockListPage('conditions') }))
jest.mock('@/phr/procedures/ProceduresPage', () => ({ __esModule: true, default: makeMockListPage('procedures') }))
jest.mock('@/phr/immunizations/ImmunizationsPage', () => ({ __esModule: true, default: makeMockListPage('immunizations') }))
jest.mock('@/phr/allergies/AllergiesPage', () => ({ __esModule: true, default: makeMockListPage('allergies') }))
jest.mock('@/phr/documents/DocumentsPage', () => ({ __esModule: true, default: makeMockListPage('documents') }))
jest.mock('@/phr/access/AccessPage', () => ({ __esModule: true, default: makeMockListPage('access') }))

const LIST_MODULES: PhrModuleId[] = [
  'labs',
  'vitals',
  'imaging',
  'office-visits',
  'medications',
  'conditions',
  'procedures',
  'immunizations',
  'allergies',
  'documents',
  'access',
]

describe('phrModuleRegistry', () => {
  beforeEach(() => {
    for (const id of LIST_MODULES) {
      delete capturedListProps[id]
    }
  })

  it('forwards onDrill to list pages', async () => {
    const onDrill = jest.fn((_: MillerDrillTarget<PhrModuleId>) => {})

    for (const id of LIST_MODULES) {
      const ListColumn = phrModuleRegistry[id].component
      const rendered = render(
        <Suspense fallback={null}>
          <ListColumn state={{ patientId: 123 }} onDrill={onDrill} />
        </Suspense>,
      )
      await screen.findByTestId(`mock-${id}`)
      expect(capturedListProps[id]).toMatchObject({
        patientId: 123,
        onDrill,
      })
      rendered.unmount()
    }
  })

  it('registers Documents as full width and visual detail columns as wide', () => {
    expect(phrModuleRegistry.documents.size).toBe('full')
    expect(phrModuleRegistry['vitals-trend'].size).toBe('wide')
    expect(phrModuleRegistry['document-viewer'].size).toBe('wide')
  })
})
