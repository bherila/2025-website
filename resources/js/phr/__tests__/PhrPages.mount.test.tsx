import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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
import ProceduresPage from '@/phr/procedures/ProceduresPage'
import VitalsPage from '@/phr/vitals/VitalsPage'

const PATIENT_ID = 101

const mockGet = jest.fn()
const mockPost = jest.fn()
const mockPatch = jest.fn()
const mockDelete = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

function makePatient() {
  return {
    id: PATIENT_ID,
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
    access_grants: [],
  }
}

beforeEach(() => {
  mockGet.mockClear()
  mockPost.mockClear()
  mockPatch.mockClear()
  mockDelete.mockClear()
  const patient = makePatient()
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/api/phr/patients') return { patients: [patient] }
    if (url === `/api/phr/patients/${PATIENT_ID}`) return { patient }
    if (url.includes('/lab-results')) return { lab_results: [], can_manage: true }
    if (url.includes('/vitals')) return { vitals: [], can_manage: true }
    if (url.includes('/documents')) return { documents: [], can_manage: true }
    if (url.includes('/exports')) return { exports: [] }
    if (url.includes('/dicom/studies')) return { studies: [] }
    if (url.includes('/access')) return { access_grants: [] }
    if (url.includes('/conditions')) return { conditions: [], can_manage: true }
    if (url.includes('/procedures')) return { procedures: [], can_manage: true }
    if (url.includes('/immunizations')) return { immunizations: [], can_manage: true }
    if (url.includes('/allergies')) return { allergies: [], can_manage: true }
    return {}
  })
  mockPost.mockResolvedValue({ patient })
  mockPatch.mockResolvedValue({ patient })
  mockDelete.mockResolvedValue({})
})

describe('PHR page mounts', () => {
  it('mounts patients page and shows Add Patient button', async () => {
    render(<PatientsPage />)
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/phr/patients'))
    expect(screen.getByRole('link', { name: /add patient/i })).toBeInTheDocument()
  })

  it('mounts patients page and shows patient card', async () => {
    render(<PatientsPage />)
    await waitFor(() => expect(screen.getByText('Primary')).toBeInTheDocument())
  })

  it('mounts labs page without crash', () => {
    render(<LabsPage patientId={PATIENT_ID} />)
    expect(document.body).toBeTruthy()
  })

  it('mounts vitals page without crash', () => {
    render(<VitalsPage patientId={PATIENT_ID} />)
    expect(document.body).toBeTruthy()
  })

  it('mounts imaging page without crash', () => {
    render(<ImagingPage patientId={PATIENT_ID} />)
    expect(document.body).toBeTruthy()
  })

  it('keeps imaging upload dialog failed when finalize fails', async () => {
    const originalXmlHttpRequest = globalThis.XMLHttpRequest
    MockUploadXMLHttpRequest.reset()
    globalThis.XMLHttpRequest = MockUploadXMLHttpRequest as unknown as typeof XMLHttpRequest

    mockPost.mockImplementation(async (url: string) => {
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads`) {
        return { upload: makeDicomUpload('pending') }
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/signed-url`) {
        return makeSignedDicomUpload()
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/files/complete`) {
        return makeDicomUploadFileResponse()
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/finalize`) {
        throw new Error('Finalize failed.')
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/cancel`) {
        return { upload: makeDicomUpload('failed') }
      }
      return { patient: makePatient() }
    })

    try {
      const { container } = render(<ImagingPage patientId={PATIENT_ID} />)

      await waitFor(() => expect(screen.getByRole('button', { name: /upload dicom/i })).toBeInTheDocument())

      const input = container.querySelector('input[type="file"]')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected DICOM file input to render.')
      }

      const file = new File(['dicom'], 'IM0001', { type: 'application/dicom' })
      Object.defineProperty(file, 'webkitRelativePath', { value: 'CARDIAC_CT/IM0001' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => expect(screen.getByText('Upload failed')).toBeInTheDocument())
      expect(MockUploadXMLHttpRequest.instances[0]?.requestHeaders).toMatchObject({
        'Content-Type': 'application/dicom',
        'x-amz-meta-upload': 'dicom',
      })
      expect(screen.queryByText('Upload complete')).not.toBeInTheDocument()
      expect(screen.getAllByText(/Finalize failed\./).length).toBeGreaterThan(0)
      expect(mockPost).toHaveBeenCalledWith(`/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/signed-url`, {
        filename: 'IM0001',
        relative_path: 'CARDIAC_CT/IM0001',
        content_type: 'application/dicom',
        file_size: 5,
      })
      expect(mockPost).toHaveBeenCalledWith(`/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/files/complete`, {
        r2_key: 'phr/dicom/patients/1/uploads/upload-uuid/CARDIAC_CT/IM0001',
        relative_path: 'CARDIAC_CT/IM0001',
        original_filename: 'IM0001',
        mime_type: 'application/dicom',
        file_size_bytes: 5,
      })
      expect(mockPost).toHaveBeenCalledWith(`/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/cancel`, {})
    } finally {
      globalThis.XMLHttpRequest = originalXmlHttpRequest
    }
  })

  it('cancels imaging upload sessions when direct storage upload fails', async () => {
    const originalXmlHttpRequest = globalThis.XMLHttpRequest
    MockUploadXMLHttpRequest.reset()
    MockUploadXMLHttpRequest.status = 403
    MockUploadXMLHttpRequest.statusText = 'Forbidden'
    MockUploadXMLHttpRequest.responseText = '<!DOCTYPE html><html lang="en"><head><title>Redirected</title></head></html>'
    globalThis.XMLHttpRequest = MockUploadXMLHttpRequest as unknown as typeof XMLHttpRequest

    const finalizeUrl = `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/finalize`
    const cancelUrl = `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/cancel`

    mockPost.mockImplementation(async (url: string) => {
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads`) {
        return { upload: makeDicomUpload('pending') }
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/signed-url`) {
        return makeSignedDicomUpload()
      }
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/files/complete`) {
        throw new Error('Complete should not be called.')
      }
      if (url === finalizeUrl) {
        throw new Error('Finalize should not be called.')
      }
      if (url === cancelUrl) {
        return { upload: makeDicomUpload('failed') }
      }
      return { patient: makePatient() }
    })

    try {
      const { container } = render(<ImagingPage patientId={PATIENT_ID} />)

      await waitFor(() => expect(screen.getByRole('button', { name: /upload dicom/i })).toBeInTheDocument())

      const input = container.querySelector('input[type="file"]')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected DICOM file input to render.')
      }

      const file = new File(['dicom'], 'IM0001', { type: 'application/dicom' })
      Object.defineProperty(file, 'webkitRelativePath', { value: 'CARDIAC_CT/IM0001' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => expect(screen.getByText('Upload failed')).toBeInTheDocument())
      expect(MockUploadXMLHttpRequest.instances[0]?.requestHeaders['Content-Type']).toBe('application/dicom')
      expect(screen.queryByText('Upload complete')).not.toBeInTheDocument()
      expect(screen.getAllByText(/Storage upload failed/).length).toBeGreaterThan(0)
      expect(mockPost).toHaveBeenCalledWith(cancelUrl, {})
      expect(mockPost).not.toHaveBeenCalledWith(finalizeUrl, {})
    } finally {
      globalThis.XMLHttpRequest = originalXmlHttpRequest
    }
  })

  it('fails oversized imaging files before sending them to the server', async () => {
    const originalXmlHttpRequest = globalThis.XMLHttpRequest
    MockUploadXMLHttpRequest.reset()
    globalThis.XMLHttpRequest = MockUploadXMLHttpRequest as unknown as typeof XMLHttpRequest

    const finalizeUrl = `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/finalize`
    const cancelUrl = `/api/phr/patients/${PATIENT_ID}/dicom/uploads/501/cancel`

    mockPost.mockImplementation(async (url: string) => {
      if (url === `/api/phr/patients/${PATIENT_ID}/dicom/uploads`) {
        return {
          upload: makeDicomUpload('pending'),
          limits: {
            max_file_bytes: 3,
            max_file_size_label: '3 B',
          },
        }
      }
      if (url === cancelUrl) {
        return { upload: makeDicomUpload('failed') }
      }
      if (url === finalizeUrl) {
        throw new Error('Finalize should not be called.')
      }
      return { patient: makePatient() }
    })

    try {
      const { container } = render(<ImagingPage patientId={PATIENT_ID} />)

      await waitFor(() => expect(screen.getByRole('button', { name: /upload dicom/i })).toBeInTheDocument())

      const input = container.querySelector('input[type="file"]')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected DICOM file input to render.')
      }

      const file = new File(['dicom'], 'IM0001', { type: 'application/dicom' })
      Object.defineProperty(file, 'webkitRelativePath', { value: 'CARDIAC_CT/IM0001' })

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => expect(screen.getByText('Upload failed')).toBeInTheDocument())
      expect(MockUploadXMLHttpRequest.instances).toHaveLength(0)
      expect(screen.getAllByText(/exceeds the server upload limit of 3 B/).length).toBeGreaterThan(0)
      expect(mockPost).toHaveBeenCalledWith(cancelUrl, {})
      expect(mockPost).not.toHaveBeenCalledWith(finalizeUrl, {})
    } finally {
      globalThis.XMLHttpRequest = originalXmlHttpRequest
    }
  })

  it('mounts access page without crash', () => {
    render(<AccessPage patientId={PATIENT_ID} />)
    expect(document.body).toBeTruthy()
  })

  it('mounts stub pages without crash', () => {
    render(<AllergiesPage patientId={PATIENT_ID} />)
    render(<ConditionsPage patientId={PATIENT_ID} />)
    render(<DocumentsPage patientId={PATIENT_ID} />)
    render(<ImmunizationsPage patientId={PATIENT_ID} />)
    render(<MedicationsPage patientId={PATIENT_ID} />)
    render(<OfficeVisitsPage patientId={PATIENT_ID} />)
    render(<ProceduresPage patientId={PATIENT_ID} />)
    expect(document.body).toBeTruthy()
  })

  it('renders condition actions including GenAI import handoff', async () => {
    render(<ConditionsPage patientId={PATIENT_ID} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add condition/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /import via genai/i })).toHaveAttribute(
      'href',
      `/phr/patient/${PATIENT_ID}/documents?job_type=phr_problem_list`,
    )
  })

  it('renders procedure manual entry with import guidance', async () => {
    render(<ProceduresPage patientId={PATIENT_ID} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add procedure/i })).toBeInTheDocument())
    expect(screen.getByText(/CCDA or FHIR record imports/i)).toBeInTheDocument()
  })

  it('renders immunization actions including GenAI import handoff', async () => {
    render(<ImmunizationsPage patientId={PATIENT_ID} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add immunization/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /import via genai/i })).toHaveAttribute(
      'href',
      `/phr/patient/${PATIENT_ID}/documents?job_type=phr_immunization`,
    )
  })

  it('renders allergy manual entry with import guidance', async () => {
    render(<AllergiesPage patientId={PATIENT_ID} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /add allergy/i })).toBeInTheDocument())
    expect(screen.getByText(/extracted as part of office-visit review/i)).toBeInTheDocument()
  })
})

function makeDicomUpload(status: string) {
  return {
    id: 501,
    patient_id: PATIENT_ID,
    uploaded_by_user_id: 2,
    status,
    original_root_name: 'CARDIAC_CT',
    total_files: 1,
    stored_files: status === 'pending' ? 0 : 1,
    skipped_files: 0,
    total_bytes: 5,
    stored_bytes: status === 'pending' ? 0 : 5,
    manifest_json: null,
    skipped_files_json: [],
    created_at: null,
    updated_at: null,
  }
}

function makeSignedDicomUpload() {
  return {
    upload_url: 'https://r2.example.test/signed-put',
    headers: {
      'Content-Type': 'application/dicom',
      'x-amz-meta-upload': 'dicom',
    },
    r2_key: 'phr/dicom/patients/1/uploads/upload-uuid/CARDIAC_CT/IM0001',
    relative_path: 'CARDIAC_CT/IM0001',
    expires_in: 900,
  }
}

function makeDicomUploadFileResponse() {
  return {
    result: {
      stored: true,
      skipped_reason: null,
      relative_path: 'CARDIAC_CT/IM0001',
      study_id: 7001,
    },
    upload: makeDicomUpload('pending'),
  }
}

class MockUploadXMLHttpRequest {
  static instances: MockUploadXMLHttpRequest[] = []

  static status = 200

  static statusText = 'OK'

  static responseText = ''

  static reset(): void {
    MockUploadXMLHttpRequest.instances = []
    MockUploadXMLHttpRequest.status = 200
    MockUploadXMLHttpRequest.statusText = 'OK'
    MockUploadXMLHttpRequest.responseText = ''
  }

  upload = new MockUploadEventTarget()

  status = MockUploadXMLHttpRequest.status

  statusText = MockUploadXMLHttpRequest.statusText

  responseText = MockUploadXMLHttpRequest.responseText

  withCredentials = false

  readonly requestHeaders: Record<string, string> = {}

  private readonly listeners = new MockUploadEventTarget()

  constructor() {
    MockUploadXMLHttpRequest.instances.push(this)
  }

  open(): void {}

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.addEventListener(type, listener)
  }

  send(): void {
    queueMicrotask(() => this.listeners.dispatch('load'))
  }

  abort(): void {
    this.listeners.dispatch('abort')
  }
}

class MockUploadEventTarget {
  private readonly listeners = new Map<string, Array<(event?: ProgressEvent) => void>>()

  addEventListener(type: string, listener: (event?: ProgressEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}
