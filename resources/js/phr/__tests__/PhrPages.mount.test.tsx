import '@testing-library/jest-dom'

import { render, screen, waitFor } from '@testing-library/react'

import AccessPage from '@/phr/access/AccessPage'
import AllergiesPage from '@/phr/allergies/AllergiesPage'
import ConditionsPage from '@/phr/conditions/ConditionsPage'
import DocumentsPage from '@/phr/documents/DocumentsPage'
import ImagingPage from '@/phr/imaging/ImagingPage'
import ImmunizationsPage from '@/phr/immunizations/ImmunizationsPage'
import LabsPage from '@/phr/labs/LabsPage'
import MedicationsPage from '@/phr/medications/MedicationsPage'
import OfficeVisitsPage from '@/phr/office-visits/OfficeVisitsPage'
import PatientsPage from '@/phr/patients/PatientsPage'
import PatientsManagePage from '@/phr/patients-manage/PatientsManagePage'
import ProceduresPage from '@/phr/procedures/ProceduresPage'
import SummaryPage from '@/phr/summary/SummaryPage'
import VitalsPage from '@/phr/vitals/VitalsPage'

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

function makePatient() {
  return {
    id: 101,
    owner_user_id: 2,
    display_name: 'Primary',
    relationship: 'self',
    birth_date: null,
    sex_at_birth: null,
    notes: null,
    archived_at: null,
    created_at: null,
    updated_at: null,
    access_level: 'owner',
    can_manage: true,
    can_share: true,
    access_grants: [
      {
        id: 1,
        user_id: 2,
        user_name: 'Owner',
        user_email: 'owner@example.com',
        access_level: 'owner',
        granted_at: null,
      },
    ],
  }
}

beforeEach(() => {
  mockGet.mockClear()
  mockPost.mockClear()
  mockDelete.mockClear()
  const patient = makePatient()
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/api/phr/patients') {
      return { patients: [patient] }
    }
    if (url.includes('/lab-results')) {
      return { lab_results: [] }
    }
    if (url.includes('/vitals')) {
      return { vitals: [] }
    }
    if (url.includes('/dicom/studies')) {
      return { studies: [] }
    }
    return {}
  })
  mockPost.mockResolvedValue({ patient })
  mockDelete.mockResolvedValue({})
})

async function expectActiveTab(label: string, expectsFetch: boolean = true): Promise<void> {
  if (expectsFetch) {
    await waitFor(() => expect(mockGet).toHaveBeenCalled())
  }
  expect(screen.getByRole('heading', { name: 'PHR' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
}

describe('PHR page mounts', () => {
  it('mounts patients page with shell active tab', async () => {
    render(<PatientsPage />)
    await expectActiveTab('Patients')
  })

  it('mounts patients manage page with shell active tab', async () => {
    render(<PatientsManagePage />)
    await expectActiveTab('Manage')
  })

  it('mounts summary page with shell active tab', async () => {
    render(<SummaryPage />)
    await expectActiveTab('Summary')
  })

  it('mounts labs page with shell active tab', async () => {
    render(<LabsPage />)
    await expectActiveTab('Labs')
  })

  it('mounts vitals page with shell active tab', async () => {
    render(<VitalsPage />)
    await expectActiveTab('Vitals')
  })

  it('mounts imaging page with shell active tab', async () => {
    render(<ImagingPage />)
    await expectActiveTab('Imaging')
  })

  it('mounts office visits page with shell active tab', async () => {
    render(<OfficeVisitsPage />)
    await expectActiveTab('Office Visits', false)
  })

  it('mounts medications page with shell active tab', async () => {
    render(<MedicationsPage />)
    await expectActiveTab('Medications', false)
  })

  it('mounts conditions page with shell active tab', async () => {
    render(<ConditionsPage />)
    await expectActiveTab('Conditions', false)
  })

  it('mounts procedures page with shell active tab', async () => {
    render(<ProceduresPage />)
    await expectActiveTab('Procedures', false)
  })

  it('mounts immunizations page with shell active tab', async () => {
    render(<ImmunizationsPage />)
    await expectActiveTab('Immunizations', false)
  })

  it('mounts allergies page with shell active tab', async () => {
    render(<AllergiesPage />)
    await expectActiveTab('Allergies', false)
  })

  it('mounts documents page with shell active tab', async () => {
    render(<DocumentsPage />)
    await expectActiveTab('Documents', false)
  })

  it('mounts access page with shell active tab', async () => {
    render(<AccessPage />)
    await expectActiveTab('Access')
  })
})
