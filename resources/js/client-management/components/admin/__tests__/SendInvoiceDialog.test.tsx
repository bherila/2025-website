import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import SendInvoiceDialog from '@/client-management/components/admin/SendInvoiceDialog'
import { fetchWrapper } from '@/fetchWrapper'

import type { NormalizedInvoice } from '../../shared/invoices/invoiceAdapters'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockGet = fetchWrapper.get as jest.Mock
const mockPost = fetchWrapper.post as jest.Mock

const invoice: NormalizedInvoice = {
  id: 42,
  invoice_number: 'INV-042',
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  cycle_start: '2026-01-01',
  cycle_end: '2026-01-31',
  due_date: null,
  status: 'issued',
  invoice_total: 1500,
  company_id: 7,
  company_name: 'Acme Co',
  billing_email: 'billing@acme.test',
}

describe('SendInvoiceDialog', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({ billing_email: 'billing@acme.test', recipient_suggestions: [] })
    mockPost.mockResolvedValue({ message: 'Invoice emailed successfully.', last_emailed_at: '2026-06-04T00:00:00Z' })
  })

  it('pre-fills the To field with the company billing email and loads recipients on open', async () => {
    render(
      <SendInvoiceDialog open onOpenChange={jest.fn()} companyId={7} invoice={invoice} />,
    )

    const toField = screen.getByLabelText('To') as HTMLInputElement
    expect(toField.value).toBe('billing@acme.test')

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/client/mgmt/companies/7/billing-recipients')
    })
  })

  it('renders loaded recipient suggestions as quick-add chips', async () => {
    mockGet.mockResolvedValue({
      billing_email: 'billing@acme.test',
      recipient_suggestions: ['lead@acme.test', 'ops@acme.test'],
    })

    render(
      <SendInvoiceDialog open onOpenChange={jest.fn()} companyId={7} invoice={invoice} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /lead@acme\.test/ }))

    const toField = screen.getByLabelText('To') as HTMLInputElement
    expect(toField.value).toBe('billing@acme.test, lead@acme.test')
  })

  it('uses the loaded billing email when the summary does not have one', async () => {
    mockGet.mockResolvedValue({
      billing_email: 'fresh-billing@acme.test',
      recipient_suggestions: ['lead@acme.test'],
    })

    render(
      <SendInvoiceDialog open onOpenChange={jest.fn()} companyId={7} invoice={{ ...invoice, billing_email: null }} />,
    )

    const toField = screen.getByLabelText('To') as HTMLInputElement

    await waitFor(() => {
      expect(toField.value).toBe('fresh-billing@acme.test')
    })
  })

  it('posts to the send endpoint with the recipients as an array when Send is clicked', async () => {
    const onSent = jest.fn()

    render(
      <SendInvoiceDialog open onOpenChange={jest.fn()} companyId={7} invoice={invoice} onSent={onSent} />,
    )

    const toField = screen.getByLabelText('To')
    fireEvent.change(toField, { target: { value: 'someone@example.com' } })

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/client/mgmt/companies/7/invoices/42/send',
        expect.objectContaining({ to: ['someone@example.com'] }),
      )
    })

    expect(Array.isArray(mockPost.mock.calls[0][1].to)).toBe(true)

    await waitFor(() => {
      expect(onSent).toHaveBeenCalled()
    })
  })

  it('shows a validation error and does not post when To is empty', async () => {
    mockGet.mockResolvedValue({ billing_email: null, recipient_suggestions: [] })

    render(
      <SendInvoiceDialog
        open
        onOpenChange={jest.fn()}
        companyId={7}
        invoice={{ ...invoice, billing_email: null }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Add at least one recipient email address.')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
