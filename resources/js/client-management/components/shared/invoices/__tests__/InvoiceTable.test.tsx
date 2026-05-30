import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import type { NormalizedInvoice } from '../invoiceAdapters'
import { InvoiceTable } from '../InvoiceTable'

// Stub shadcn Badge so tests don't need full CSS setup
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}))

// Stub shadcn Checkbox
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) => (
    <input type="checkbox" checked={checked} onChange={onCheckedChange} data-testid="checkbox" readOnly />
  ),
}))

const adminInvoice: NormalizedInvoice = {
  id: 1,
  invoice_number: 'INV-001',
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  cycle_start: '2026-01-01',
  cycle_end: '2026-01-31',
  due_date: null,
  status: 'draft',
  invoice_total: 1500,
  invoice_kind: 'cadence_period',
  hours_worked: 10,
  retainer_hours_included: 20,
  hours_billed_at_rate: 0,
  stripe_payment_status: null,
  stripe_failure_reason: null,
  client_agreement_id: 1,
}

const portalInvoice: NormalizedInvoice = {
  id: 55,
  invoice_number: 'INV-055',
  period_start: '2026-03-01',
  period_end: '2026-03-31',
  cycle_start: '2026-03-01',
  cycle_end: '2026-03-31',
  due_date: '2026-04-15',
  status: 'issued',
  invoice_total: 2000,
}

describe('InvoiceTable — admin mode', () => {
  it('renders admin column headers', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[]}
        onToggleSelected={jest.fn()}
        renderActions={() => null}
      />
    )

    expect(screen.getByText('Invoice')).toBeInTheDocument()
    expect(screen.getByText('Cycle')).toBeInTheDocument()
    expect(screen.getByText('Kind')).toBeInTheDocument()
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Stripe Failure')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders invoice number in a row', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[]}
        onToggleSelected={jest.fn()}
        renderActions={() => null}
      />
    )

    expect(screen.getByText('INV-001')).toBeInTheDocument()
  })

  it('shows checkbox per row', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[]}
        onToggleSelected={jest.fn()}
        renderActions={() => null}
      />
    )

    expect(screen.getByTestId('checkbox')).toBeInTheDocument()
  })

  it('calls onToggleSelected with the invoice id when checkbox is clicked', () => {
    const onToggle = jest.fn()
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[]}
        onToggleSelected={onToggle}
        renderActions={() => null}
      />
    )

    fireEvent.click(screen.getByTestId('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('renders actions from renderActions prop', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[]}
        onToggleSelected={jest.fn()}
        renderActions={(inv) => <button>Action for {inv.id}</button>}
      />
    )

    expect(screen.getByText('Action for 1')).toBeInTheDocument()
  })

  it('shows empty state when no invoices', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[]}
        selected={[]}
        onToggleSelected={jest.fn()}
        renderActions={() => null}
      />
    )

    expect(screen.getByText('No invoices match these filters.')).toBeInTheDocument()
  })

  it('marks the checkbox as checked when invoice id is in selected', () => {
    render(
      <InvoiceTable
        mode="admin"
        invoices={[adminInvoice]}
        selected={[1]}
        onToggleSelected={jest.fn()}
        renderActions={() => null}
      />
    )

    const checkbox = screen.getByTestId('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })
})

describe('InvoiceTable — portal mode', () => {
  it('renders portal column headers', () => {
    render(
      <InvoiceTable
        mode="portal"
        invoices={[portalInvoice]}
        slug="acme"
        onOpen={jest.fn()}
      />
    )

    expect(screen.getByText('Invoice #')).toBeInTheDocument()
    expect(screen.getByText('Period')).toBeInTheDocument()
    expect(screen.getByText('Due Date')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('renders invoice number in a row', () => {
    render(
      <InvoiceTable
        mode="portal"
        invoices={[portalInvoice]}
        slug="acme"
        onOpen={jest.fn()}
      />
    )

    expect(screen.getByText('INV-055')).toBeInTheDocument()
  })

  it('does NOT render admin-only columns (checkbox, kind, hours, stripe failure)', () => {
    render(
      <InvoiceTable
        mode="portal"
        invoices={[portalInvoice]}
        slug="acme"
        onOpen={jest.fn()}
      />
    )

    expect(screen.queryByText('Stripe Failure')).not.toBeInTheDocument()
    expect(screen.queryByText('Kind')).not.toBeInTheDocument()
    expect(screen.queryByText('Hours')).not.toBeInTheDocument()
    expect(screen.queryByTestId('checkbox')).not.toBeInTheDocument()
  })

  it('calls onOpen with the invoice when a row is clicked', () => {
    const onOpen = jest.fn()
    render(
      <InvoiceTable
        mode="portal"
        invoices={[portalInvoice]}
        slug="acme"
        onOpen={onOpen}
      />
    )

    fireEvent.click(screen.getByText('INV-055'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }))
  })

  it('shows portal empty state card when no invoices', () => {
    render(
      <InvoiceTable
        mode="portal"
        invoices={[]}
        slug="acme"
        onOpen={jest.fn()}
      />
    )

    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    expect(screen.getByText('Invoices will appear here once they are issued.')).toBeInTheDocument()
  })

  it('shows fallback invoice number when invoice_number is null', () => {
    render(
      <InvoiceTable
        mode="portal"
        invoices={[{ ...portalInvoice, invoice_number: null }]}
        slug="acme"
        onOpen={jest.fn()}
      />
    )

    expect(screen.getByText('INV-55')).toBeInTheDocument()
  })
})
