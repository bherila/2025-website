import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { GenAiImportJobData } from '@/genai-processor/types'

import GenAiJobsList from './GenAiJobsList'

const job: GenAiImportJobData = {
  id: 42,
  user_id: 1,
  acct_id: 1,
  job_type: 'finance_transactions',
  file_hash: 'hash',
  original_filename: 'STATEMENT_2025-01_8W163GBF_2025-02-03T15_53_20.495-05_00.pdf',
  s3_path: 'genai-import/1/statement.pdf',
  mime_type: 'application/pdf',
  file_size_bytes: 1024,
  context_json: null,
  status: 'parsed',
  error_message: null,
  raw_response: null,
  retry_count: 0,
  scheduled_for: null,
  parsed_at: '2026-03-28T12:00:00Z',
  created_at: '2026-03-28T12:00:00Z',
  updated_at: '2026-03-28T12:01:00Z',
}

describe('GenAiJobsList', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [job] }),
    }) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders a wrapped destructive delete confirmation dialog', async () => {
    render(<GenAiJobsList accountId={1} onSelectJob={jest.fn()} />)

    const deleteButton = await screen.findByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    expect(await screen.findByText('Delete AI Import Job?')).toBeInTheDocument()

    const dialog = document.querySelector('[data-slot="alert-dialog-content"]')
    expect(dialog).toHaveClass('max-h-[calc(100vh-2rem)]')
    expect(dialog).toHaveClass('overflow-y-auto')

    const description = screen.getByText(/This will permanently delete the import job/i)
    expect(description).toHaveClass('break-words')

    const filename = screen.getByText(`"${job.original_filename}"`)
    expect(filename).toHaveClass('break-all')

    const confirmButton = within(dialog as HTMLElement).getByRole('button', { name: 'Delete' })
    expect(confirmButton).toHaveClass('bg-destructive')
    expect(confirmButton).toHaveClass('text-destructive-foreground')
  })

  it('removes a job after confirming delete', async () => {
    ;(window.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [job] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

    render(<GenAiJobsList accountId={1} onSelectJob={jest.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await waitFor(() => document.querySelector('[data-slot="alert-dialog-content"]'))
    const confirmDeleteButton = within(dialog as HTMLElement).getByRole('button', { name: 'Delete' })
    fireEvent.click(confirmDeleteButton)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument()
    })

    expect(window.fetch).toHaveBeenNthCalledWith(2, `/api/genai/import/jobs/${job.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
  })
})
