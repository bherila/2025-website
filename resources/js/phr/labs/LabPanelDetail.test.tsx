import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import LabPanelDetail from '@/phr/labs/LabPanelDetail'

const mockGet = jest.fn()

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

describe('LabPanelDetail', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('renders panel metadata, row table, abnormal flag, trend, and source link', async () => {
    mockGet.mockResolvedValue({
      panel: {
        id: 321,
        panel_name: 'Comprehensive Metabolic Panel',
        collection_datetime: '2026-05-19 08:00:00',
        ordering_provider: 'Dr. Rivera',
        resulting_lab: 'Quest Diagnostics',
        source: 'MyChart',
        source_document_id: 77,
        source_document_url: '/api/phr/patients/42/documents/77/file',
        rows: [
          {
            id: 1,
            analyte: 'Glucose',
            value: '111',
            value_numeric: '111',
            unit: 'mg/dL',
            range_min: '70',
            range_max: '99',
            range_unit: 'mg/dL',
            reference_range_text: null,
            abnormal_flag: 'H',
            result_datetime: '2026-05-19 09:00:00',
            collection_datetime: '2026-05-19 08:00:00',
            trend: 'up',
          },
        ],
      },
    })

    render(<LabPanelDetail patientId={42} recordId="321" />)

    expect(await screen.findByText('Comprehensive Metabolic Panel')).toBeInTheDocument()
    expect(screen.getByText(/Ordering provider:\s*Dr. Rivera/)).toBeInTheDocument()
    expect(screen.getByText(/Lab\/source:\s*Quest Diagnostics · MyChart/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View source document' })).toHaveAttribute(
      'href',
      '/api/phr/patients/42/documents/77/file',
    )
    expect(screen.getByText('H')).toBeInTheDocument()
    expect(screen.getByText('↑')).toBeInTheDocument()
  })

  it('renders shared not-found column on 404', async () => {
    mockGet.mockRejectedValue('Not Found')

    render(<LabPanelDetail patientId={42} recordId="999" />)

    expect(
      await screen.findByText('Record not found. It may belong to a different patient.'),
    ).toBeInTheDocument()
  })
})
