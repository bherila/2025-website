import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import CompanyCard from '@/client-management/components/admin/CompanyCard'
import type { ClientCompany } from '@/client-management/types/common'

function makeCompany(overrides: Partial<ClientCompany> = {}): ClientCompany {
  return {
    id: 42,
    company_name: 'Acme Consulting',
    slug: 'acme-consulting',
    is_active: true,
    stripe_billing_enabled: true,
    created_at: '2026-05-01 00:00:00',
    users: [{ id: 1, name: 'Carl Miller', email: 'carl@example.com', last_login_date: null }],
    agreements: [],
    current_billing_cadence: 'monthly',
    current_cycle_progress: 46,
    needs_attention: true,
    total_balance_due: 100,
    uninvoiced_hours: 2.5,
    lifetime_value: 5000,
    unpaid_invoices: [],
    ...overrides,
  }
}

describe('CompanyCard', () => {
  it('renders labeled metrics, status, and semantic links', () => {
    const onAddUser = jest.fn()
    render(<CompanyCard company={makeCompany()} onAddUser={onAddUser} />)

    expect(screen.getByText('Balance due')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('Uninvoiced')).toBeInTheDocument()
    expect(screen.getByText('2.50h')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('(never logged in)')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Manage/ })).toHaveAttribute('href', '/client/mgmt/42')
    expect(screen.getByRole('link', { name: /Portal/ })).toHaveAttribute('href', '/client/portal/acme-consulting')
  })

  it('invokes onAddUser with the company id', () => {
    const onAddUser = jest.fn()
    render(<CompanyCard company={makeCompany()} onAddUser={onAddUser} />)

    fireEvent.click(screen.getByRole('button', { name: /Add User/ }))

    expect(onAddUser).toHaveBeenCalledWith(42)
  })
})
