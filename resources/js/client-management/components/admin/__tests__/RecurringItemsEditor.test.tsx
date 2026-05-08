import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import RecurringItemsEditor from '@/client-management/components/admin/RecurringItemsEditor'
import type { Agreement } from '@/client-management/types/common'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <select aria-label="Cadence" value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
    delete: jest.fn(),
  },
}))

const mockPost = fetchWrapper.post as jest.Mock

const agreement: Agreement = {
  id: 10,
  active_date: '2026-01-01 00:00:00',
  termination_date: null,
  client_company_signed_date: null,
  is_visible_to_client: true,
  monthly_retainer_hours: '10.00',
  monthly_retainer_fee: '1000.00',
  billing_cadence: 'quarterly',
  recurring_items: [],
}

describe('RecurringItemsEditor', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it('validates anchor month for annual items before posting', async () => {
    render(<RecurringItemsEditor companyId={1} agreement={agreement} onChanged={jest.fn()} />)

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Annual license' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Cadence' }), { target: { value: 'annual' } })
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))

    expect(await screen.findByText('Anchor month is required for this cadence.')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
