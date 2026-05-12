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
  default: function MockRothConversionForm({
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
            primaryCurrentAge: inputs.people.primaryCurrentAge + 1,
          },
        })}
      >
        Bump primary age
      </button>
    )
  },
}))

jest.mock('../RothConversionResults', () => ({
  __esModule: true,
  default: function MockRothConversionResults(): ReactElement {
    return <div data-testid="roth-conversion-results" />
  },
}))

const mockCompute = computeRothConversion as jest.MockedFunction<typeof computeRothConversion>
const mockSave = saveRothConversionScenario as jest.MockedFunction<typeof saveRothConversionScenario>
const mockUpdate = updateRothConversionScenario as jest.MockedFunction<typeof updateRothConversionScenario>

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
    mockCompute.mockResolvedValue({} as RothConversionProjection)
    window.history.replaceState(null, '', '/financial-planning/roth-conversion/s/abc1234')
  })

  it('forks an anonymous shared scenario into URL state without saving', async () => {
    render(<RothConversionPage initialData={sharedInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: /fork/i }))

    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/financial-planning/roth-conversion')
    expect(window.location.search).toBe('?age=61')
    expect(screen.getByText('Forked to URL state. Edits update this link.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /bump primary age/i }))

    await waitFor(() => {
      expect(window.location.search).toBe('?age=62')
    })
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('saves a forked short-code scenario for authenticated non-owners', async () => {
    mockSave.mockResolvedValue({
      id: 491,
      shortCode: 'forked1',
      shareUrl: 'http://localhost/financial-planning/roth-conversion/s/forked1',
      projection: {} as RothConversionProjection,
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
