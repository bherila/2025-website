import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from '../defaults'
import { computeRothConversion, saveRothConversionScenario, updateRothConversionScenario } from '../rothConversionApi'
import RothConversionPage from '../RothConversionPage'
import type { RothConversionInitialData, RothConversionInputs, RothConversionProjection } from '../types'

jest.mock('../rothConversionApi', () => ({
  computeRothConversion: jest.fn(),
  saveRothConversionScenario: jest.fn(),
  updateRothConversionScenario: jest.fn(),
}))

jest.mock('../RothConversionForm', () => ({
  __esModule: true,
  ROTH_CONVERSION_FORM_SECTIONS: [
    {
      id: 'people',
      label: 'People and Filing Status',
      shortLabel: 'People',
      description: 'People inputs',
      icon: function MockIcon(): ReactElement {
        return <svg aria-hidden="true" />
      },
    },
  ],
  RothConversionFormSection: function MockRothConversionFormSection({
    inputs,
    onChange,
  }: {
    inputs: RothConversionInputs
    onChange: (inputs: RothConversionInputs) => void
  }): ReactElement {
    return (
      <button
        type="button"
        onClick={() => onChange({
          ...inputs,
          people: {
            ...inputs.people,
            primaryBirthYear: inputs.people.primaryBirthYear - 1,
          },
        })}
      >
        Bump primary age
      </button>
    )
  },
}))

jest.mock('../RothConversionResultViews', () => ({
  formatProjectionMoney: (value: number): string => `$${value}`,
  getLifetimeTax: (scenario: RothConversionProjection['scenarios'][number]): number => scenario.summary.lifetimeFederalTax,
  getPreferredScenario: (projection: RothConversionProjection): RothConversionProjection['scenarios'][number] => projection.scenarios[0]!,
  ProjectionBalances: function MockProjectionBalances(): ReactElement {
    return <div data-testid="projection-balances" />
  },
  ProjectionCompare: function MockProjectionCompare(): ReactElement {
    return <div data-testid="projection-compare" />
  },
  ProjectionOverview: function MockProjectionOverview(): ReactElement {
    return <div data-testid="projection-overview" />
  },
  ProjectionSocialSecurity: function MockProjectionSocialSecurity(): ReactElement {
    return <div data-testid="projection-social-security" />
  },
  ProjectionTaxDetail: function MockProjectionTaxDetail(): ReactElement {
    return <div data-testid="projection-tax-detail" />
  },
  ProjectionYears: function MockProjectionYears(): ReactElement {
    return <div data-testid="projection-years" />
  },
}))

const mockCompute = computeRothConversion as jest.MockedFunction<typeof computeRothConversion>
const mockSave = saveRothConversionScenario as jest.MockedFunction<typeof saveRothConversionScenario>
const mockUpdate = updateRothConversionScenario as jest.MockedFunction<typeof updateRothConversionScenario>

function projection(): RothConversionProjection {
  return {
    inputs: DEFAULT_ROTH_CONVERSION_INPUTS,
    scenarios: [
      {
        id: 'base',
        name: 'Convert to top of 24%',
        strategy: {},
        summary: {
          lifetimeFederalTax: 100,
          lifetimeStateTax: 0,
          lifetimeNiit: 0,
          lifetimeIrmaa: 0,
          lifetimeSocialSecurity: 0,
          lifetimeExpenses: 0,
          presentValueLifetimeTax: 0,
          presentValueSocialSecurity: 0,
          presentValueLifetimeExpenses: 0,
          finalEstateValue: 200,
          presentValueFinalEstate: 0,
          irmaaHitYears: 0,
          cashShortfallTaxApproximationYears: 0,
          cashShortfallTaxRecomputedYears: 0,
          unfundedCashShortfall: 0,
        },
        years: [],
        socialSecurityBreakeven: [],
      },
    ],
    warnings: [],
    reference: {
      rmdRates: [],
      socialSecurityTaxation: [],
      irmaaTiers: [],
      conversionWindows: [],
    },
  }
}

function sharedInitialData(overrides: Partial<RothConversionInitialData> = {}): RothConversionInitialData {
  return {
    scenario: {
      id: 490,
      shortCode: 'abc1234',
      title: 'Shared plan',
      shareUrl: 'http://localhost/financial-planning/roth-conversion/s/abc1234',
      ownerUserId: 1,
    },
    inputs: {
      ...DEFAULT_ROTH_CONVERSION_INPUTS,
      people: {
        ...DEFAULT_ROTH_CONVERSION_INPUTS.people,
        primaryBirthYear: DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 61,
        primaryCurrentAge: 61,
      },
    },
    projection: null,
    canEdit: false,
    authenticated: false,
    ...overrides,
  }
}

describe('RothConversionPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompute.mockResolvedValue(projection())
    window.history.replaceState(null, '', '/financial-planning/roth-conversion/s/abc1234')
  })

  it('forks an anonymous shared scenario into URL state without saving', async () => {
    render(<RothConversionPage initialData={sharedInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: /fork/i }))

    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/financial-planning/roth-conversion')
    expect(window.location.search).toBe(`?birth=${DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 61}`)
    expect(screen.getByText('Forked to URL state. Edits update this link.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /people/i }))
    fireEvent.click(screen.getByRole('button', { name: /bump primary age/i }))

    await waitFor(() => {
      expect(window.location.search).toBe(`?birth=${DEFAULT_ROTH_CONVERSION_INPUTS.currentYear - 62}`)
    })
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('saves a forked short-code scenario for authenticated non-owners', async () => {
    mockSave.mockResolvedValue({
      id: 491,
      shortCode: 'forked1',
      shareUrl: 'http://localhost/financial-planning/roth-conversion/s/forked1',
      projection: projection(),
    })

    render(<RothConversionPage initialData={sharedInitialData({ authenticated: true })} />)

    fireEvent.click(screen.getByRole('button', { name: /fork/i }))

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        'Shared plan',
        expect.objectContaining({
          people: expect.objectContaining({ primaryCurrentAge: 61 }),
        }),
      )
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/financial-planning/roth-conversion/s/forked1')
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })
})
