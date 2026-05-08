import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { Form8829EntityFact } from '@/types/generated/tax-preview-facts'

import Form8829InputsForm from '../Form8829InputsForm'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('../TaxLineAdjustmentPopover', () => ({
  __esModule: true,
  default: () => <button type="button">Add line detail</button>,
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

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
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
  Save: () => <svg data-testid="save" />,
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

function makeFacts(): Form8829EntityFact {
  return {
    entityId: 12,
    entityName: 'Consulting LLC',
    method: 'regular',
    officeSqft: 100,
    homeSqft: 1000,
    monthsUsed: 12,
    businessUsePercentage: 10,
    priorYearOpCarryover: 0,
    priorYearOpCarryoverCa: 0,
    priorYearDepreciationCarryover: 0,
    priorYearDepreciationCarryoverCa: 0,
    line1OfficeSqft: 100,
    line2HomeSqft: 1000,
    line3BusinessUsePercentage: 10,
    line7BusinessUsePercentage: 10,
    line8TentativeProfit: 5000,
    line14DeductibleMortgageInterestAndTaxes: 0,
    line15OperatingExpenseLimit: 5000,
    line23OperatingExpensesTotal: 1000,
    line24AllowableOperatingIndirectExpenses: 100,
    line25PriorYearOpCarryover: 0,
    line26TotalOperatingExpenseClaim: 100,
    line27AllowableOperatingExpenses: 100,
    line28ExcessCasualtyAndDepreciationLimit: 4900,
    line30Depreciation: 0,
    line31PriorYearExcessCasualtyAndDepreciationCarryover: 0,
    line32TotalExcessCasualtyAndDepreciation: 0,
    line33AllowableExcessCasualtyAndDepreciation: 0,
    line36AllowableHomeOfficeDeduction: 100,
    line43OperatingCarryoverToNextYear: 0,
    line43OperatingCarryoverToNextYearCa: 0,
    line44ExcessCasualtyAndDepreciationCarryoverToNextYear: 0,
    line44ExcessCasualtyAndDepreciationCarryoverToNextYearCa: 0,
    carryoverToNextYear: 0,
    carryoverToNextYearCa: 0,
    regularDeduction: 100,
    simplifiedDeduction: 500,
    limitationReason: 'none',
    line36Sources: [],
    line43Sources: [],
    line44Sources: [],
    homeOfficeLines: [],
  }
}

describe('Form8829InputsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFetchWrapper.get.mockResolvedValue({
      method: 'regular',
      office_sqft: 120,
      home_sqft: 1200,
      months_used: 12,
      prior_year_op_carryover: 25,
      prior_year_op_carryover_ca: 35,
      prior_year_depreciation_carryover: 45,
      prior_year_depreciation_carryover_ca: 55,
      notes: 'Existing note',
    })
    mockedFetchWrapper.put.mockResolvedValue({})
  })

  it('loads persisted home office inputs and saves normalized values', async () => {
    const onSaved = jest.fn()

    render(
      <Form8829InputsForm
        taxYear={2025}
        entityId={12}
        entityName="Consulting LLC"
        facts={makeFacts()}
        onSaved={onSaved}
      />,
    )

    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Months'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Federal op carryover'), { target: { value: '75.50' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Updated note' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockedFetchWrapper.put).toHaveBeenCalledWith('/api/finance/form-8829', expect.objectContaining({
        entity_id: 12,
        tax_year: 2025,
        months_used: 8,
        office_sqft: 120,
        home_sqft: 1200,
        prior_year_op_carryover: 75.5,
        prior_year_op_carryover_ca: 35,
        prior_year_depreciation_carryover: 45,
        prior_year_depreciation_carryover_ca: 55,
        notes: 'Updated note',
      }))
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('blocks invalid month counts before saving', async () => {
    render(
      <Form8829InputsForm
        taxYear={2025}
        entityId={12}
        entityName="Consulting LLC"
        facts={makeFacts()}
      />,
    )

    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Months'), { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(screen.getByText('Months used must be between 1 and 12.')).toBeInTheDocument()
    expect(mockedFetchWrapper.put).not.toHaveBeenCalled()
  })
})
