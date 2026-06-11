import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import ManageAwardsPage from '@/components/rsu/ManageAwardsPage'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}))

jest.mock('@/components/rsu/RsuSubNav', () => ({
  __esModule: true,
  default: () => <div data-testid="rsu-subnav" />,
}))

jest.mock('@/components/rsu/RsuImportModal', () => ({
  RsuImportModal: () => <button type="button">Import</button>,
}))

const awards = [
  { id: 1, award_id: 'RSU-1', grant_date: '2026-01-01', vest_date: '2026-04-01', share_count: 10, symbol: 'ABC' },
  { id: 2, award_id: 'RSU-1', grant_date: '2026-01-01', vest_date: '2026-07-01', share_count: 20, symbol: 'ABC' },
]

describe('ManageAwardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([])
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({})
    ;(fetchWrapper.delete as jest.Mock).mockResolvedValue({})
  })

  it('surfaces the backfill success and still-missing summary', async () => {
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({ updated: [1, 2], missing: [3] })

    render(<ManageAwardsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /backfill prices/i }))

    expect(await screen.findByText('Updated 2 vest prices; 1 vest event is still missing a price.')).toBeInTheDocument()
  })

  it('does not save a blank share count as zero', async () => {
    render(<ManageAwardsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /add vest event/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Share count is required.')).toBeInTheDocument()
    expect(fetchWrapper.post).not.toHaveBeenCalled()
  })

  it('deletes schedule rows sequentially and reports partial failure', async () => {
    ;(fetchWrapper.get as jest.Mock)
      .mockResolvedValueOnce(awards)
      .mockResolvedValueOnce([awards[1]])
    ;(fetchWrapper.delete as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('failed'))

    render(<ManageAwardsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Schedule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete schedule' }))

    await waitFor(() => expect(fetchWrapper.delete).toHaveBeenNthCalledWith(1, '/api/rsu/1', {}))
    expect(fetchWrapper.delete).toHaveBeenNthCalledWith(2, '/api/rsu/2', {})
    expect(await screen.findByText('Deleted 1 of 2 vest events; 1 failed.')).toBeInTheDocument()
  })
})
