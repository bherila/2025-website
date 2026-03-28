import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { fetchWrapper } from '@/fetchWrapper';
import type { GenAiImportJobData, GenAiImportResultData } from '@/genai-processor/types';

import ImportTransactions from './ImportTransactions';

// Mock the child component
jest.mock('@/components/finance/TransactionsTable', () => {
  const MockTransactionsTable = () => <div data-testid="transactions-table" />;
  MockTransactionsTable.displayName = 'TransactionsTable';
  return MockTransactionsTable;
});

jest.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/spinner', () => ({
    Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ id, checked, onCheckedChange, ...props }: { id?: string; checked?: boolean; onCheckedChange?: (checked: boolean) => void; [key: string]: unknown }) => (
        <input
            type="checkbox"
            id={id}
            checked={checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            data-testid={id}
            {...props}
        />
    ),
}));

jest.mock('@/components/ui/label', () => ({
    Label: ({ children, ...props }: { children: React.ReactNode }) => <label {...props}>{children}</label>,
}));

jest.mock('@/data/finance/AccountLineItem', () => ({
    AccountLineItemSchema: {
        parse: (data: any) => data,
    },
}));

jest.mock('@/lib/DateHelper', () => ({
    parseDate: (dateString: string) => ({
        formatYMD: () => dateString,
    }),
}));

jest.mock('@/fetchWrapper', () => ({
    fetchWrapper: {
        post: jest.fn(),
        get: jest.fn(),
    }
}));

// Mock the GenAI hooks
const mockUpload = jest.fn();
const mockRefetch = jest.fn();

const mockJobPollingState = {
  status: null as string | null,
  results: [] as GenAiImportResultData[],
  error: null as string | null,
  job: null as GenAiImportJobData | null,
  estimatedWait: undefined as string | undefined,
  refetch: mockRefetch,
};

jest.mock('@/genai-processor/useGenAiFileUpload', () => ({
    useGenAiFileUpload: () => ({
        upload: mockUpload,
        uploading: false,
        error: null,
    }),
}));

jest.mock('@/genai-processor/useGenAiJobPolling', () => ({
    useGenAiJobPolling: () => mockJobPollingState,
}));

describe('ImportTransactions', () => {
  let consoleErrorSpy: jest.SpyInstance
  beforeAll(() => {
    const originalConsoleError = console.error.bind(console)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (typeof args[0] === 'string' && args[0].includes('inside a test was not wrapped in act')) {
        return
      }
      originalConsoleError(...args)
    })
  })
  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (fetchWrapper.get as jest.Mock).mockResolvedValue([]);
    mockUpload.mockReset();
    // Reset polling state
    Object.assign(mockJobPollingState, {
      status: null,
      results: [],
      error: null,
      job: null,
      estimatedWait: undefined,
    });
    // Mock window.fetch used by useFinanceAccounts
    ;(window as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ assetAccounts: [], liabilityAccounts: [], retirementAccounts: [] }),
    });
  });

  afterEach(() => {
    delete (window as any).fetch;
  });

  it('parses CSV data and displays the import button', async () => {
    const onImportFinishedMock = jest.fn();

    render(<ImportTransactions accountId={1} onImportFinished={onImportFinishedMock} />);

    const csvData = `date,time,description,amount,type
2025-01-01,10:00:00,DEPOSIT,1000.00,deposit
2025-01-02,14:30:00,GROCERY STORE,-75.50,withdrawal
2025-01-03,00:00:00,ONLINE PAYMENT,-25.00,withdrawal`;

    // Create a mock clipboard event
    const clipboardEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true
    });
    
    // Mock the clipboardData property
    Object.defineProperty(clipboardEvent, 'clipboardData', {
      value: {
        getData: (format: string) => format === 'text/plain' ? csvData : '',
        items: []
      }
    });

    // Dispatch the event to the document
    fireEvent(document, clipboardEvent);

    const importButton = await screen.findByText('Import 3 Transactions');
    expect(importButton).toBeInTheDocument();
  });

  it('shows Choose File button in empty state', () => {
    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);
    expect(screen.getByText('Choose File')).toBeInTheDocument();
  });

  it('has a hidden file input for click-to-select', () => {
    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('file');
  });

  it('shows Process with AI button for PDF files without auto-submitting', async () => {
    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    // Should show file info and Process with AI, not auto-submit
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    // Should NOT have called the upload hook
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('shows import-transactions and attach-statement checkboxes after AI parsing', async () => {
    const parsedResult = {
      toolCalls: [{
        toolName: 'addFinanceAccount',
        payload: {
          statementInfo: { brokerName: 'Test' },
          statementDetails: [{ section: 'S', line_item: 'L', statement_period_value: 1, ytd_value: 2, is_percentage: false }],
          transactions: [{ date: '2025-01-01', description: 'Test', amount: 100, type: 'deposit' }],
          lots: [],
        },
      }],
    };

    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    // Set polling state to 'parsed' with results (will apply once jobId is set)
    Object.assign(mockJobPollingState, {
      status: 'parsed',
      results: [{ id: 1, job_id: 42, result_index: 0, result_json: JSON.stringify(parsedResult), status: 'pending_review', imported_at: null, created_at: '', updated_at: '' }],
      error: null,
      job: null,
      estimatedWait: undefined,
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(screen.getByTestId('import-transactions')).toBeInTheDocument();
      expect(screen.getByTestId('attach-statement')).toBeInTheDocument();
    });
  });

  it('calls upload hook when Process with AI is clicked', async () => {
    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(file);
    });
  });

  it('shows queue status message after upload', async () => {
    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    Object.assign(mockJobPollingState, {
      status: 'pending',
      results: [],
      error: null,
      job: null,
      estimatedWait: undefined,
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      // Match the specific status heading which contains "Queued"
      expect(screen.getAllByText(/queue/i).length).toBeGreaterThan(0);
    });
  });

  it('shows upload error with retry button', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Upload failed'));

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(screen.getByText(/Upload failed/)).toBeInTheDocument();
    });
  });

  it('shows error when result_json is malformed', async () => {
    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    Object.assign(mockJobPollingState, {
      status: 'parsed',
      results: [{ id: 1, job_id: 42, result_index: 0, result_json: 'not valid json{{{', status: 'pending_review', imported_at: null, created_at: '', updated_at: '' }],
      error: null,
      job: null,
      estimatedWait: undefined,
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to parse AI result/)).toBeInTheDocument();
    });
  });

  it('shows deferred message for queued_tomorrow status', async () => {
    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    Object.assign(mockJobPollingState, {
      status: 'queued_tomorrow',
      results: [],
      error: null,
      job: null,
      estimatedWait: 'Your file will be processed on 2025-07-01',
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(screen.getByText(/Processing deferred/)).toBeInTheDocument();
      expect(screen.getByText(/2025-07-01/)).toBeInTheDocument();
    });
  });

  it('shows failed state with clear button when job fails', async () => {
    mockUpload.mockResolvedValueOnce({ jobId: 42, status: 'pending' });

    Object.assign(mockJobPollingState, {
      status: 'failed',
      results: [],
      error: null,
      job: null,
      estimatedWait: undefined,
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('process-with-ai')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('process-with-ai'));

    await waitFor(() => {
      expect(screen.getByText(/AI processing failed/)).toBeInTheDocument();
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });
  });

  it('reads text files directly without AI processing', async () => {
    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const csvContent = `date,time,description,amount,type
2025-01-01,10:00:00,DEPOSIT,1000.00,deposit`;

    // Use paste to deliver text content (same as the first test)
    const clipboardEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(clipboardEvent, 'clipboardData', {
      value: {
        getData: (format: string) => format === 'text/plain' ? csvContent : '',
        items: [],
      },
    });

    fireEvent(document, clipboardEvent);

    await waitFor(() => {
      expect(screen.getByText('Import 1 Transaction')).toBeInTheDocument();
    });

    // Should NOT have called upload hook
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

