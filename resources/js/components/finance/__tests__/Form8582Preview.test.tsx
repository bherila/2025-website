import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { Form8582Lines } from '@/types/finance/tax-return'

import Form8582Preview from '../Form8582Preview'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

function makeForm8582(overrides: Partial<Form8582Lines> = {}): Form8582Lines {
  return {
    activities: [],
    totalPassiveIncome: 0,
    totalPassiveLoss: 0,
    totalPriorYearUnallowed: 0,
    netPassiveResult: 0,
    rentalAllowance: 0,
    totalAllowedLoss: 0,
    totalSuspendedLoss: 0,
    netDeductionToReturn: 0,
    isLossLimited: false,
    magi: 0,
    isMarried: false,
    realEstateProfessional: false,
    ...overrides,
  }
}

describe('Form8582Preview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('still shows the carryforward editor when there are no passive activities', () => {
    render(
      <Form8582Preview
        form8582={makeForm8582()}
        year={2025}
        palCarryforwards={[]}
        onCarryforwardsChange={() => {}}
        realEstateProfessional={false}
        onRealEstateProfessionalChange={() => {}}
      />,
    )

    expect(screen.getByText(/No passive activity data found/i)).toBeInTheDocument()
    expect(screen.getByText(/Saved opening carryforwards for 2025/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('lets the user edit an existing carryforward entry', async () => {
    ;(fetchWrapper.put as jest.Mock).mockResolvedValue({
      id: 4,
      activity_name: 'Fund A',
      activity_ein: '12-3456789',
      ordinary_carryover: -2500,
      short_term_carryover: 0,
      long_term_carryover: 0,
    })
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([
      {
        id: 4,
        activity_name: 'Fund A',
        activity_ein: '12-3456789',
        ordinary_carryover: -2500,
        short_term_carryover: 0,
        long_term_carryover: 0,
      },
    ])

    const onCarryforwardsChange = jest.fn()

    render(
      <Form8582Preview
        form8582={makeForm8582()}
        year={2025}
        palCarryforwards={[
          {
            id: 4,
            activity_name: 'Fund A',
            activity_ein: '12-3456789',
            ordinary_carryover: -1000,
            short_term_carryover: 0,
            long_term_carryover: 0,
          },
        ]}
        onCarryforwardsChange={onCarryforwardsChange}
        realEstateProfessional={false}
        onRealEstateProfessionalChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Ordinary Carryover'), { target: { value: '-2500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fetchWrapper.put).toHaveBeenCalledWith('/api/finance/tax-loss-carryforwards/4', {
        activity_name: 'Fund A',
        activity_ein: '12-3456789',
        ordinary_carryover: -2500,
        short_term_carryover: 0,
        long_term_carryover: 0,
      })
    })
    expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-loss-carryforwards?year=2025')
    expect(onCarryforwardsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 4,
        ordinary_carryover: -2500,
      }),
    ])
  })

  it('saves current suspended losses into the next tax year opening balances', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([
      {
        id: 11,
        activity_name: 'Zero Carryforward Activity',
        activity_ein: null,
        ordinary_carryover: -900,
        short_term_carryover: 0,
        long_term_carryover: 0,
      },
    ])
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({})
    ;(fetchWrapper.delete as jest.Mock).mockResolvedValue({})

    render(
      <Form8582Preview
        form8582={makeForm8582({
          activities: [
            {
              activityName: 'Passive LP Fund (ordinary business)',
              ein: '12-3456789',
              isRentalRealEstate: false,
              activeParticipation: false,
              currentIncome: 0,
              currentLoss: -12000,
              priorYearUnallowed: 0,
              overallGainOrLoss: -12000,
              allowedLossThisYear: 0,
              suspendedLossCarryforward: 12000,
            },
            {
              activityName: 'Zero Carryforward Activity',
              isRentalRealEstate: false,
              activeParticipation: true,
              currentIncome: 5000,
              currentLoss: -5000,
              priorYearUnallowed: 0,
              overallGainOrLoss: 0,
              allowedLossThisYear: 5000,
              suspendedLossCarryforward: 0,
            },
          ],
        })}
        year={2025}
        palCarryforwards={[]}
        onCarryforwardsChange={() => {}}
        realEstateProfessional={false}
        onRealEstateProfessionalChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save suspended losses to 2026' }))

    await waitFor(() => {
      expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/tax-loss-carryforwards?year=2026')
    })
    expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/tax-loss-carryforwards', {
      tax_year: 2026,
      activity_name: 'Passive LP Fund (ordinary business)',
      activity_ein: '12-3456789',
      ordinary_carryover: -12000,
      short_term_carryover: 0,
      long_term_carryover: 0,
    })
    expect(fetchWrapper.delete).toHaveBeenCalledWith('/api/finance/tax-loss-carryforwards/11', {})
  })

  it('logs an error if a commit-forward delete fails', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([
      {
        id: 11,
        activity_name: 'Zero Carryforward Activity',
        activity_ein: null,
        ordinary_carryover: -900,
        short_term_carryover: 0,
        long_term_carryover: 0,
      },
    ])
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({})
    ;(fetchWrapper.delete as jest.Mock).mockRejectedValue(new Error('delete failed'))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <Form8582Preview
        form8582={makeForm8582({
          activities: [
            {
              activityName: 'Passive LP Fund (ordinary business)',
              ein: '12-3456789',
              isRentalRealEstate: false,
              activeParticipation: false,
              currentIncome: 0,
              currentLoss: -12000,
              priorYearUnallowed: 0,
              overallGainOrLoss: -12000,
              allowedLossThisYear: 0,
              suspendedLossCarryforward: 12000,
            },
            {
              activityName: 'Zero Carryforward Activity',
              isRentalRealEstate: false,
              activeParticipation: true,
              currentIncome: 5000,
              currentLoss: -5000,
              priorYearUnallowed: 0,
              overallGainOrLoss: 0,
              allowedLossThisYear: 5000,
              suspendedLossCarryforward: 0,
            },
          ],
        })}
        year={2025}
        palCarryforwards={[]}
        onCarryforwardsChange={() => {}}
        realEstateProfessional={false}
        onRealEstateProfessionalChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save suspended losses to 2026' }))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to commit suspended PAL carryforwards forward',
        expect.any(Error),
      )
    })

    consoleErrorSpy.mockRestore()
  })
})
