import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import TaxLineAdjustmentPopover from '../TaxLineAdjustmentPopover'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    post: jest.fn(),
  },
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => <select aria-label="Type" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
}))

jest.mock('lucide-react', () => ({
  Loader2: () => <svg data-testid="loader" />,
  Plus: () => <svg data-testid="plus" />,
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

describe('TaxLineAdjustmentPopover', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFetchWrapper.post.mockResolvedValue({})
  })

  it('posts a schedule line adjustment and refreshes facts', async () => {
    const onSaved = jest.fn()

    render(
      <TaxLineAdjustmentPopover
        taxYear={2025}
        form="schedule_c"
        lineRef="line_30"
        entityId={7}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '123.45' } })
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Correct home office amount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedFetchWrapper.post).toHaveBeenCalledWith('/api/finance/tax-line-adjustments', {
        tax_year: 2025,
        form: 'schedule_c',
        entity_id: 7,
        line_ref: 'line_30',
        kind: 'adjustment',
        amount: 123.45,
        description: 'Correct home office amount',
      })
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
