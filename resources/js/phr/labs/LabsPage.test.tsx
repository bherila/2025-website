import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import LabsPage from '@/phr/labs/LabsPage'

const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('LabsPage', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({
      lab_results: [
        {
          id: 321,
          patient_id: 42,
          user_id: 7,
          test_name: 'Comprehensive Metabolic Panel',
          collection_datetime: '2026-05-19 08:00:00',
          result_datetime: '2026-05-19 09:00:00',
          result_status: null,
          ordering_provider: null,
          resulting_lab: null,
          analyte: 'Glucose',
          value: '111',
          value_numeric: '111',
          unit: 'mg/dL',
          range_min: '70.0000000000',
          range_max: '9999999.0000000000',
          range_unit: 'mg/dL',
          reference_range_text: null,
          normal_value: null,
          abnormal_flag: 'H',
          message_from_provider: null,
          result_comment: null,
          lab_director: null,
          source: null,
          notes: null,
          created_at: '2026-05-19 09:05:00',
          updated_at: '2026-05-19 09:05:00',
        },
      ],
      can_manage: false,
    })
  })

  it('drills to lab panel detail when a row is clicked', async () => {
    const onDrill = jest.fn()

    render(<LabsPage patientId={42} onDrill={onDrill} />)

    expect(await screen.findByText('70–∞ mg/dL')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Glucose'))

    await waitFor(() => {
      expect(onDrill).toHaveBeenCalledWith({ id: 'lab-panel-detail', instance: '321' })
    })
  })
})
