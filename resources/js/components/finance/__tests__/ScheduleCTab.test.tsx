import { render, screen } from '@testing-library/react'
import React from 'react'

import ScheduleCTab from '../ScheduleCTab'

describe('ScheduleCTab', () => {
  it('renders Schedule C income routed from reviewed 1099 documents', () => {
    render(
      <ScheduleCTab
        selectedYear={2024}
        scheduleCData={[]}
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
    expect(screen.getByText('$2,300')).toBeInTheDocument()
  })
})
