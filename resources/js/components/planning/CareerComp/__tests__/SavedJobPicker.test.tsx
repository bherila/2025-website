import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { listSavedCareerJobs } from '../careerCompApi'
import { buildDefaultJob } from '../defaults'
import { DEFAULT_CAREER_COMP_INPUTS } from '../defaults'
import { SavedJobPicker } from '../SavedJobPicker'
import type { SavedCareerJob } from '../types'

jest.mock('../careerCompApi', () => ({
  listSavedCareerJobs: jest.fn(),
}))

const mockList = listSavedCareerJobs as jest.Mock

const savedJob: SavedCareerJob = {
  id: 7,
  kind: 'hypothetical',
  name: 'Saved Series B offer',
  spec: { ...buildDefaultJob('saved-7', 'Saved Series B offer') },
}

describe('SavedJobPicker', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockList.mockResolvedValue({ jobs: [savedJob] })
  })

  it('hides the picker behind a login prompt for guests and does not fetch', () => {
    render(<SavedJobPicker inputs={DEFAULT_CAREER_COMP_INPUTS} authenticated={false} onApply={jest.fn()} />)

    expect(screen.getByText(/log in to reuse jobs/i)).toBeInTheDocument()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('shows an empty state when the user has no saved jobs', async () => {
    mockList.mockResolvedValue({ jobs: [] })
    render(<SavedJobPicker inputs={DEFAULT_CAREER_COMP_INPUTS} authenticated onApply={jest.fn()} />)

    expect(await screen.findByText(/no saved jobs yet/i)).toBeInTheDocument()
  })

  it('loads a chosen saved job into the current slot', async () => {
    const onApply = jest.fn()
    render(<SavedJobPicker inputs={DEFAULT_CAREER_COMP_INPUTS} authenticated onApply={onApply} />)

    const button = await screen.findByRole('button', { name: 'Load saved job Saved Series B offer' })
    fireEvent.click(button)

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    const nextInputs = onApply.mock.calls[0][0]
    expect(nextInputs.currentJob).not.toBeNull()
    expect(nextInputs.currentJob.id).toBe('current')
    expect(nextInputs.currentJob.name).toBe('Saved Series B offer')
    expect(screen.getByText(/loaded .* into/i)).toBeInTheDocument()
  })
})
