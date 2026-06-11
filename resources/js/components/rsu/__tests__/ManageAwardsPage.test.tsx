import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import ManageAwardsPage from '@/components/rsu/ManageAwardsPage'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

jest.mock('@/components/container', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/components/rsu/RsuSubNav', () => ({
  __esModule: true,
  default: () => <nav>RSU nav</nav>,
}))

jest.mock('@/components/rsu/RsuImportModal', () => ({
  RsuImportModal: () => <button type="button">Import PDF</button>,
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}))

const awards: IAward[] = [
  {
    id: 1,
    award_id: 'RSU-1',
    grant_date: '2026-01-01',
    vest_date: '2026-06-01',
    share_count: 4,
    symbol: 'META',
    grant_price: 10,
    grant_price_source: 'quote_close',
    vest_price: 123.45,
    vest_price_source: 'manual',
  },
  {
    id: 2,
    award_id: 'RSU-1',
    grant_date: '2026-01-01',
    vest_date: '2026-09-01',
    share_count: 6,
    symbol: 'META',
    grant_price: null,
    grant_price_source: null,
    vest_price: null,
    vest_price_source: null,
  },
]

describe('ManageAwardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(fetchWrapper.get).mockResolvedValue(awards)
    jest.mocked(fetchWrapper.post).mockResolvedValue({})
    jest.mocked(fetchWrapper.delete).mockResolvedValue({})
  })

  it('saves a blank vest price as null with the clear flag', async () => {
    render(<ManageAwardsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit RSU-1 2026-06-01' }))
    fireEvent.change(screen.getByLabelText('Vest Price (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchWrapper.post).toHaveBeenCalledWith('/api/rsu', [expect.objectContaining({
      id: 1,
      vest_price: null,
      clear_vest_price: true,
    })]))
  })

  it('renders price source labels for schedule rows', async () => {
    render(<ManageAwardsPage />)

    expect(await screen.findByText(/Grant: \$10.00 \(Quote close\)/)).toBeInTheDocument()
    expect(screen.getByText(/Vest: \$123.45 \(Manual\)/)).toBeInTheDocument()
    expect(screen.getByText(/Grant: .*No source/)).toBeInTheDocument()
    expect(screen.getByText(/Vest: .*No source/)).toBeInTheDocument()
  })

  it('bulk applies a manual vest price to every event in a schedule', async () => {
    render(<ManageAwardsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Bulk set vest price' }))
    fireEvent.change(screen.getByLabelText('Vest price'), { target: { value: '42.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to schedule' }))

    await waitFor(() => expect(fetchWrapper.post).toHaveBeenCalledWith('/api/rsu', [
      expect.objectContaining({
        id: 1,
        vest_price: 42.25,
        vest_price_source: 'manual',
        clear_vest_price: false,
      }),
      expect.objectContaining({
        id: 2,
        vest_price: 42.25,
        vest_price_source: 'manual',
        clear_vest_price: false,
      }),
    ]))
  })

  it('surfaces the backfill success and still-missing summary', async () => {
    jest.mocked(fetchWrapper.post).mockResolvedValue({ updated: [1, 2], missing: [3] })

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
    jest.mocked(fetchWrapper.get)
      .mockResolvedValueOnce(awards)
      .mockResolvedValueOnce([awards[1]])
    jest.mocked(fetchWrapper.delete)
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
