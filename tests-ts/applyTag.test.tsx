import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import TransactionsTable from '@/components/finance/TransactionsTable'
import { useFinanceTags } from '@/components/finance/useFinanceTags'
import { fetchWrapper } from '@/fetchWrapper'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('@/components/finance/useFinanceTags', () => ({
  useFinanceTags: jest.fn(),
}))

// Data with tags so the Tags column renders
const mockData = [
  { 
    t_id: 1, 
    t_description: 'Test Transaction 1', 
    t_amt: 100, 
    t_date: '2023-01-01', 
    t_account_balance: 100, 
    t_price: 0, 
    t_commission: 0, 
    t_fee: 0,
    tags: [{ tag_id: 1, tag_label: 'Personal', tag_color: 'green' }]
  },
  { 
    t_id: 2, 
    t_description: 'Test Transaction 2', 
    t_amt: 200, 
    t_date: '2023-01-02', 
    t_account_balance: 300, 
    t_price: 0, 
    t_commission: 0, 
    t_fee: 0,
    tags: []
  },
] as any[]

describe('TransactionsTable Tag Application', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useFinanceTags as jest.Mock).mockReturnValue({
      tags: [{ tag_id: 10, tag_label: 'Work', tag_color: 'blue' }],
      isLoading: false,
    })
  })

  it('calls the correct API endpoint when applying a tag', async () => {
    render(
      <TransactionsTable 
        data={mockData} 
        enableTagging={true} 
      />
    )

    // Find the TagSelect combobox (it has role="combobox")
    const selectTrigger = screen.getByRole('combobox')
    fireEvent.click(selectTrigger)

    // Now the dropdown options should be visible - find and click "Work"
    const workOption = await screen.findByRole('option', { name: /work/i })
    fireEvent.click(workOption)

    // Click the "Add" button to apply the tag
    const addButton = screen.getByRole('button', { name: /add/i })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(fetchWrapper.post).toHaveBeenCalledWith(
        '/api/finance/tags/apply',
        expect.objectContaining({
          tag_id: 10,
          transaction_ids: expect.stringContaining('1')
        })
      )
    })
  })
})
