import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'

import DocumentImportModal from '../DocumentImportModal'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('@/lib/fileUtils', () => ({
  computeFileSHA256: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/input', () => {
  const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((props, ref) => <input ref={ref} {...props} />)
  Input.displayName = 'Input'

  return { Input }
})

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock
const mockComputeFileSHA256 = computeFileSHA256 as jest.Mock

class SuccessfulXMLHttpRequest {
  status = 200
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  open = jest.fn()
  setRequestHeader = jest.fn()
  send = jest.fn(() => {
    this.onload?.()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({
    assetAccounts: [{
      acct_id: 7,
      acct_name: 'Fidelity Taxable',
      acct_number: '1234',
    }],
  })
  mockComputeFileSHA256.mockResolvedValue('hash-123')
  globalThis.XMLHttpRequest = SuccessfulXMLHttpRequest as unknown as typeof XMLHttpRequest
})

describe('DocumentImportModal', () => {
  it('shows validation when importing without a file', async () => {
    render(<DocumentImportModal open={true} onOpenChange={jest.fn()} onImported={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    expect(await screen.findByText('Choose a file first.')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('loads account choices and completes the upload flow through unified document endpoints', async () => {
    mockPost
      .mockResolvedValueOnce({ upload_url: 'https://uploads.example.test/put', s3_key: 'tax_docs/1/upload.pdf' })
      .mockResolvedValueOnce({ id: 1 })

    const onImported = jest.fn()
    const onOpenChange = jest.fn()
    const { container } = render(<DocumentImportModal open={true} onOpenChange={onOpenChange} onImported={onImported} />)

    expect(await screen.findByText('Fidelity Taxable')).toBeInTheDocument()

    const file = new File(['pdf'], 'brokerage-1099.pdf', { type: 'application/pdf' })
    const fileInput = container.querySelector('#document-file') as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    })
    fireEvent.change(fileInput)

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/finance/documents/request-upload', {
        filename: 'brokerage-1099.pdf',
        document_kind: 'tax_form',
        content_type: 'application/pdf',
        file_size: 3,
      })
    })

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/finance/documents', expect.objectContaining({
        document_kind: 'tax_form',
        s3_key: 'tax_docs/1/upload.pdf',
        original_filename: 'brokerage-1099.pdf',
        form_type: 'broker_1099',
        file_hash: 'hash-123',
      }))
    })

    expect(onImported).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
