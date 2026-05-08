import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import ScheduleCTab from '../ScheduleCTab'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}))

const mockedFetchWrapper = fetchWrapper as jest.Mocked<typeof fetchWrapper>

describe('ScheduleCTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFetchWrapper.get.mockResolvedValue({
      method: 'regular',
      office_sqft: 120,
      home_sqft: 1200,
      months_used: 12,
      prior_year_op_carryover: 0,
      prior_year_op_carryover_ca: 0,
      prior_year_depreciation_carryover: 0,
      prior_year_depreciation_carryover_ca: 0,
      notes: null,
    })
  })

  it('renders Schedule C income routed from reviewed 1099 documents', async () => {
    render(
      <ScheduleCTab
        selectedYear={2024}
        scheduleCData={[{
          year: 2024,
          entities: [{
            entity_id: 1,
            entity_name: 'Consulting LLC',
            schedule_c_income: {
              gross_receipts: {
                label: 'Gross receipts',
                total: 2300,
                transactions: [],
              },
            },
            schedule_c_expense: {},
            schedule_c_home_office: {},
          }],
        }]}
        reviewed1099Docs={[
          {
            id: 1,
            user_id: 1,
            tax_year: 2024,
            form_type: '1099_nec',
            employment_entity_id: null,
            account_id: 5,
            original_filename: 'nec.pdf',
            stored_filename: null,
            s3_path: null,
            mime_type: 'application/pdf',
            file_size_bytes: 1,
            file_hash: 'nec',
            is_reviewed: true,
            misc_routing: null,
            notes: null,
            human_file_size: '1 B',
            download_count: 0,
            genai_job_id: null,
            genai_status: 'parsed',
            parsed_data: { payer_name: 'Client LLC', box1_nonemployeeComp: 1800 },
            uploader: null,
            employment_entity: null,
            account: { acct_id: 5, acct_name: 'Business Checking' },
            account_links: [],
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 2,
            user_id: 1,
            tax_year: 2024,
            form_type: '1099_misc',
            employment_entity_id: null,
            account_id: 5,
            original_filename: 'misc.pdf',
            stored_filename: null,
            s3_path: null,
            mime_type: 'application/pdf',
            file_size_bytes: 1,
            file_hash: 'misc',
            is_reviewed: true,
            misc_routing: 'sch_c',
            notes: null,
            human_file_size: '1 B',
            download_count: 0,
            genai_job_id: null,
            genai_status: 'parsed',
            parsed_data: { payer_name: 'Rental Client', box1_rents: 200, box3_other_income: 300 },
            uploader: null,
            employment_entity: null,
            account: { acct_id: 5, acct_name: 'Business Checking' },
            account_links: [],
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    expect(screen.getByText('Schedule C — Tax Document Income')).toBeInTheDocument()
    expect(screen.getByText('Client LLC — 1099-NEC')).toBeInTheDocument()
    expect(screen.getByText('Rental Client — 1099-MISC')).toBeInTheDocument()
    expect(screen.getByText('Total 1099 income routed to Schedule C')).toBeInTheDocument()
    expect(screen.getAllByText('$2,300')).not.toHaveLength(0)
    expect(screen.getByText('1099 gross receipts ($2,300.00) should reconcile with transaction-based gross receipts below.')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedFetchWrapper.get).toHaveBeenCalledWith('/api/finance/form-8829?entity_id=1&year=2024')
    })
    expect(await screen.findByDisplayValue('120')).toBeInTheDocument()
  })
})
