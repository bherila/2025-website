import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ClientPortalProposalPage from '@/client-management/components/portal/ClientPortalProposalPage'
import type { Proposal } from '@/client-management/types/proposal'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/client-management/components/portal/ClientPortalNav', () => () => null)

jest.mock('@/client-management/components/shared/proposal/ProposalMarkdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
    disabled,
  }: {
    id?: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    disabled?: boolean
  }) => (
    <input
      type="checkbox"
      data-testid={id}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
  },
}))

const mockPost = fetchWrapper.post as jest.Mock

function makeProposal(): Proposal {
  return {
    id: 7,
    client_company_id: 1,
    version: 1,
    status: 'sent',
    is_visible_to_client: true,
    title: 'Website rebuild',
    body_markdown: 'Scope of work',
    base_amount: '2000.00',
    base_description: 'Website build',
    credit_amount: '262.50',
    credit_label: 'Less retainer already paid',
    payment_net_days: 30,
    items: [
      {
        id: 11,
        kind: 'add_on',
        description: 'SEO setup',
        amount: '375.00',
        charge_cadence: 'one_time',
        is_optional: false,
        is_selected: false,
        sort_order: 0,
      },
      {
        id: 12,
        kind: 'add_on',
        description: 'Analytics',
        amount: '500.00',
        charge_cadence: 'one_time',
        is_optional: true,
        is_selected: false,
        sort_order: 1,
      },
      {
        id: 13,
        kind: 'scope',
        description: 'Blog module',
        amount: null,
        charge_cadence: 'one_time',
        is_optional: true,
        is_selected: false,
        sort_order: 2,
      },
    ],
  } as Proposal
}

describe('ClientPortalProposalPage', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  const renderPage = () =>
    render(
      <ClientPortalProposalPage slug="acme" companyName="Acme" companyId={1} initialProposal={makeProposal()} />,
    )

  it('shows the maximum net with all optional items selected by default', () => {
    renderPage()
    // 2000 + 375 (mandatory) + 500 (optional, default on) − 262.50
    expect(screen.getByText('$2,612.50')).toBeInTheDocument()
  })

  it('recomputes the total when an optional add-on is unchecked', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('item-12'))
    // 2000 + 375 − 262.50
    expect(screen.getByText('$2,112.50')).toBeInTheDocument()
  })

  it('posts name, title and the kept optional item ids on accept', async () => {
    mockPost.mockResolvedValue({ proposal: { ...makeProposal(), status: 'accepted' }, agreement_id: 99, invoice_id: 5 })
    renderPage()

    // Opt out of the Analytics add-on (id 12); keep the Blog deliverable (id 13).
    fireEvent.click(screen.getByTestId('item-12'))

    fireEvent.click(screen.getByText('Accept & Sign'))
    fireEvent.change(screen.getByLabelText('Your Full Name'), { target: { value: 'Carl Client' } })
    fireEvent.change(screen.getByLabelText('Your Title'), { target: { value: 'Owner' } })
    fireEvent.click(screen.getByText('Confirm'))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/api/client/portal/acme/proposals/7/accept', {
      name: 'Carl Client',
      title: 'Owner',
      selected_item_ids: [13],
    })
  })

  it('sends a reason when rejecting', async () => {
    mockPost.mockResolvedValue({ proposal: { ...makeProposal(), status: 'rejected' } })
    renderPage()

    fireEvent.click(screen.getByText('Reject'))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Budget changed' } })
    fireEvent.click(screen.getByText('Confirm'))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/api/client/portal/acme/proposals/7/reject', {
      reason: 'Budget changed',
    })
  })
})
