import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import CyclePreviewPanel from '@/client-management/components/admin/CyclePreviewPanel'
import type { Agreement } from '@/client-management/types/common'

const company = {
  id: 1,
  company_name: 'Acme Consulting',
  slug: 'acme',
  is_active: true,
  created_at: '2026-01-01 00:00:00',
  users: [],
  agreements: [],
  uninvoiced_hours: 34,
}

const baseAgreement: Agreement = {
  id: 10,
  client_company_id: 1,
  active_date: '2026-01-01 00:00:00',
  termination_date: null,
  client_company_signed_date: null,
  monthly_retainer_hours: '10.00',
  monthly_retainer_fee: '1000.00',
  hourly_rate: '150.00',
  billing_cadence: 'quarterly',
  recurring_items: [
    {
      id: 1,
      client_agreement_id: 10,
      description: 'Hosting',
      amount: '50.00',
      charge_cadence: 'monthly',
      anchor_month: null,
      anchor_day: null,
      start_date: '2026-01-01',
      end_date: null,
      is_taxable: false,
      is_summarized: false,
      notes: null,
    },
  ],
}

describe('CyclePreviewPanel', () => {
  it('renders quarterly totals and opens the next-invoice preview', () => {
    render(<CyclePreviewPanel company={company} agreement={baseAgreement} />)

    expect(screen.getByText('Quarterly')).toBeInTheDocument()
    expect(screen.getByText('34.00')).toBeInTheDocument()
    expect(screen.getByText('$600.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /preview next invoice/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Retainer (30.00 hours)')).toBeInTheDocument()
    expect(screen.getByText('$3,000.00')).toBeInTheDocument()
    expect(screen.getByText('Projected overage (4.00 hours)')).toBeInTheDocument()
    expect(screen.getByText('$3,650.00')).toBeInTheDocument()
  })

  it('uses currency math for fractional rates and fees', () => {
    render(
      <CyclePreviewPanel
        company={company}
        agreement={{
          ...baseAgreement,
          monthly_retainer_fee: '1000.10',
          hourly_rate: '150.05',
        }}
      />,
    )

    expect(screen.getByText('$600.20')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /preview next invoice/i }))

    expect(screen.getByText('$3,650.50')).toBeInTheDocument()
  })
})
