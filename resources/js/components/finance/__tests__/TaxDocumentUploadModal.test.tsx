import { fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { post: jest.fn() },
}))

jest.mock('@/lib/fileUtils', () => ({
  computeFileSHA256: jest.fn().mockResolvedValue('a'.repeat(64)),
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/components/finance/ManualJsonAttachModal', () => ({
  __esModule: true,
  default: () => null,
}))

// Avoid Radix UI portal issues in jsdom
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/progress', () => ({
  Progress: () => <div data-testid="progress" />,
}))

import { fetchWrapper } from '@/fetchWrapper'

import TaxDocumentUploadModal from '../TaxDocumentUploadModal'

// --- XHR mock ---------------------------------------------------------------
// Simulates a successful S3 PUT upload by firing onload asynchronously.

class MockXHR {
  open = jest.fn()
  setRequestHeader = jest.fn()
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 200

  send = jest.fn(function (this: MockXHR) {
    Promise.resolve().then(() => this.onload?.())
  })
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    value: MockXHR,
    writable: true,
    configurable: true,
  })
})

beforeEach(() => jest.clearAllMocks())

// --- helpers ----------------------------------------------------------------

const PRESIGNED = { upload_url: 'https://s3.example.com/presign', s3_key: 'tax_docs/1/test.pdf', expires_in: 300 }
const SAVED_DOC = { id: 1, form_type: '1099_int', genai_status: 'pending' }

function mockUploadSequence() {
  ;(fetchWrapper.post as jest.Mock)
    .mockResolvedValueOnce(PRESIGNED)
    .mockResolvedValueOnce(SAVED_DOC)
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    formType: '1099_int',
    taxYear: 2024,
    onSuccess: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  }
}

/** Triggers the upload flow by firing a change event on the hidden file input. */
function triggerFileInput(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const PDF = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })

// --- tests ------------------------------------------------------------------

describe('TaxDocumentUploadModal', () => {
  it('renders when open', () => {
    (fetchWrapper.post as jest.Mock).mockResolvedValue(PRESIGNED)
    const { container } = render(<TaxDocumentUploadModal {...baseProps()} />)
    expect(container.textContent).toContain('Upload')
  })

  it('renders nothing when closed', () => {
    const { container } = render(<TaxDocumentUploadModal {...baseProps({ open: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it('passes accountId to confirm POST when provided', async () => {
    mockUploadSequence()
    const onSuccess = jest.fn()
    render(<TaxDocumentUploadModal {...baseProps({ accountId: 42, onSuccess })} />)

    triggerFileInput(PDF)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [, saveBody] = (fetchWrapper.post as jest.Mock).mock.calls[1]
    expect(saveBody).toMatchObject({ account_id: 42 })
  })

  it('does not include account_id in POST when accountId is undefined', async () => {
    mockUploadSequence()
    const onSuccess = jest.fn()
    render(<TaxDocumentUploadModal {...baseProps({ onSuccess })} />)

    triggerFileInput(PDF)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [, saveBody] = (fetchWrapper.post as jest.Mock).mock.calls[1]
    expect(saveBody).not.toHaveProperty('account_id')
  })

  it('includes the correct taxYear and formType in the confirm POST', async () => {
    mockUploadSequence()
    const onSuccess = jest.fn()
    render(<TaxDocumentUploadModal {...baseProps({ taxYear: 2023, formType: '1099_div', onSuccess })} />)

    triggerFileInput(PDF)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [, saveBody] = (fetchWrapper.post as jest.Mock).mock.calls[1]
    expect(saveBody).toMatchObject({ tax_year: 2023, form_type: '1099_div' })
  })

  it('calls onSuccess after upload completes', async () => {
    mockUploadSequence()
    const onSuccess = jest.fn()
    render(<TaxDocumentUploadModal {...baseProps({ onSuccess })} />)

    triggerFileInput(PDF)

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })
})
