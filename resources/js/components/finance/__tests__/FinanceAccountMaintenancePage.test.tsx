import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import React from 'react'

import FinanceAccountMaintenancePage from '../FinanceAccountMaintenancePage'

jest.mock('@/components/MainTitle', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

jest.mock('@/components/finance/AccountMaintenanceClient', () => ({
  __esModule: true,
  default: () => <section data-testid="account-maintenance-client" />,
}))

jest.mock('@/components/finance/EditAccountFlags', () => ({
  EditAccountFlags: () => <section data-testid="edit-account-flags" />,
}))

jest.mock('@/components/finance/DeleteAccountSection', () => ({
  DeleteAccountSection: () => <section data-testid="delete-account-section" />,
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: React.ComponentProps<'div'>) => <div className={className}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

describe('FinanceAccountMaintenancePage', () => {
  it('keeps maintenance focused on account settings without tax document uploads', () => {
    const { container } = render(
      <FinanceAccountMaintenancePage
        accountId={12}
        accountName="Brokerage"
        whenClosed={null}
        isDebt={false}
        isRetirement={false}
        acctNumber="1234"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Account Maintenance' })).toBeInTheDocument()
    expect(screen.getByTestId('account-maintenance-client')).toBeInTheDocument()
    expect(screen.getByTestId('edit-account-flags')).toBeInTheDocument()
    expect(screen.getByText('Deleted Transactions')).toBeInTheDocument()
    expect(screen.getByTestId('delete-account-section')).toBeInTheDocument()
    expect(screen.queryByText('1099 Tax Documents')).not.toBeInTheDocument()
    expect(container.querySelector('.border-l')).not.toBeInTheDocument()
    expect(container.querySelector('.border-t')).not.toBeInTheDocument()
  })
})
