import { render, screen } from '@testing-library/react'

import type { EmploymentEntity, TaxDocument } from '@/types/finance/tax-document'

jest.mock('@/components/finance/TaxDocumentReviewModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/finance/TaxDocumentUploadModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

import TaxDocumentsSection from '../TaxDocumentsSection'

const entity: EmploymentEntity = {
  id: 7,
  display_name: 'Acme Payroll',
  type: 'w2',
  is_hidden: false,
}

const document: TaxDocument = {
  id: 11,
  user_id: 1,
  tax_year: 2025,
  form_type: 'w2',
  employment_entity_id: 7,
  account_id: null,
  original_filename: 'acme-w2.pdf',
  stored_filename: 'stored-acme-w2.pdf',
  s3_path: 'tax_docs/1/stored-acme-w2.pdf',
  mime_type: 'application/pdf',
  file_size_bytes: 2048,
  file_hash: 'hash',
  is_reviewed: false,
  notes: null,
  human_file_size: '2 KB',
  download_count: 0,
  genai_job_id: null,
  genai_status: 'parsed',
  misc_routing: null,
  parsed_data: null,
  uploader: null,
  employment_entity: { id: 7, display_name: 'Acme Payroll' },
  account: null,
  account_links: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

describe('TaxDocumentsSection', () => {
  it('uses a muted border around W-2 document tables', () => {
    render(
      <TaxDocumentsSection
        selectedYear={2025}
        payslips={[]}
        documents={[document]}
        employmentEntities={[entity]}
        isLoading={false}
      />,
    )

    expect(screen.getByText('Acme Payroll').closest('.border-muted')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveClass('[&_tr]:border-muted')
  })
})
