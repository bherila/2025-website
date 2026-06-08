import { act, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { AccountLineItem } from '@/types/finance/account-line-item'

import TransactionLinkModal from '../TransactionLinkModal'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('@/lib/financeRouteBuilder', () => ({
  goToTransaction: jest.fn(),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('../CreateAndLinkTransactionModal', () => ({
  __esModule: true,
  default: () => null,
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

const transaction = {
  t_id: 10,
  t_account: 1,
  acct_name: 'taxable',
  t_date: '2025-03-05',
  t_description: 'Distribution outflow',
  t_amt: -100,
  t_account_balance: undefined,
  t_price: undefined,
  t_commission: undefined,
  t_fee: undefined,
} satisfies AccountLineItem

beforeEach(() => {
  jest.clearAllMocks()
})

async function renderTransactionLinkModal(transactionOverride: AccountLineItem = transaction): Promise<void> {
  await act(async () => {
    render(
      <TransactionLinkModal
        transaction={transactionOverride}
        isOpen
        onClose={jest.fn()}
      />
    )
    await Promise.resolve()
  })
}

function mockLinkResponses({
  parentTransaction = null,
  childTransactions = [],
  potentialMatches = [],
}: {
  parentTransaction?: unknown
  childTransactions?: unknown[]
  potentialMatches?: unknown[]
}) {
  mockedFetchWrapper.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/links')) {
      return {
        parent_transaction: parentTransaction,
        child_transactions: childTransactions,
      }
    }

    if (url.endsWith('/linkable')) {
      return {
        potential_matches: potentialMatches,
      }
    }

    throw new Error(`Unexpected URL: ${url}`)
  })
}

test('uses theme-aware foreground and muted classes for transaction summary content', async () => {
  mockLinkResponses({})

  await renderTransactionLinkModal()

  const currentTransactionHeading = screen.getByText('Current Transaction')
  const currentTransactionCard = currentTransactionHeading.closest('div')

  expect(currentTransactionCard).toHaveClass('bg-muted', 'text-foreground')
  const currentTransactionRows = currentTransactionCard?.querySelectorAll('p')
  expect(currentTransactionRows?.[0]).toHaveClass('text-foreground')
  expect(currentTransactionRows?.[2]).toHaveClass('text-destructive')

  await waitFor(() => {
    expect(screen.getByText('No linked transactions.')).toBeInTheDocument()
  })
  expect(mockedFetchWrapper.get).toHaveBeenCalledWith('/api/finance/transactions/10/links')
})

test('uses semantic theme tokens for linked transaction and balance status colors', async () => {
  mockLinkResponses({
    childTransactions: [
      {
        t_id: 11,
        t_account: 2,
        acct_name: 'cash account',
        t_date: '2025-03-05',
        t_description: 'Cash inflow',
        t_amt: 100,
      },
    ],
  })

  await renderTransactionLinkModal()

  await waitFor(() => {
    expect(screen.getByText('cash account')).toBeInTheDocument()
  })

  const linkedTransactionCard = screen.getByText('Cash inflow').closest('div')
  const linkedAmount = within(linkedTransactionCard as HTMLElement).getByText(/\$100\.00/)
  expect(linkedAmount).toHaveClass('text-success')

  const balanceMessage = screen.getByText('✓ Linked transactions are balanced (sum to $0.00)')
  expect(balanceMessage).toHaveClass('text-success')
  expect(balanceMessage.closest('div')).toHaveClass('bg-success/10', 'border-success/30')
})

test('styles linkable transaction amounts with theme-aware classes instead of inline colors', async () => {
  mockLinkResponses({
    potentialMatches: [
      {
        t_id: 20,
        t_account: 2,
        acct_name: 'cash account',
        t_date: '2025-03-06',
        t_description: 'Positive match',
        t_amt: 100,
      },
      {
        t_id: 21,
        t_account: 3,
        acct_name: 'brokerage account',
        t_date: '2025-03-06',
        t_description: 'Negative match',
        t_amt: -25,
      },
    ],
  })

  await renderTransactionLinkModal()

  await waitFor(() => {
    expect(screen.getByText('Positive match')).toBeInTheDocument()
    expect(screen.getByText('Negative match')).toBeInTheDocument()
  })

  const positiveAmount = screen.getByText('$100.00')
  const negativeAmount = screen.getByText('-$25.00')

  expect(positiveAmount).toHaveClass('text-success')
  expect(positiveAmount).not.toHaveAttribute('style')
  expect(negativeAmount).toHaveClass('text-destructive')
  expect(negativeAmount).not.toHaveAttribute('style')
})
