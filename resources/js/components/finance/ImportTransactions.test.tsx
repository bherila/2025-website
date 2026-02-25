import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import ImportTransactions from '@/components/finance/ImportTransactions';
import { fetchWrapper } from '@/fetchWrapper';

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
    Checkbox: ({ id, checked, onCheckedChange, ...props }: any) => (
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

describe('ImportTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchWrapper.get as jest.Mock).mockResolvedValue([]);
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
      expect(screen.getByText('Process with AI')).toBeInTheDocument();
    });

    // Should NOT have called the API
    expect(fetchWrapper.post).not.toHaveBeenCalledWith(
      '/api/finance/transactions/import-gemini',
      expect.anything()
    );
  });

  it('shows import checkboxes for PDF files', async () => {
    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('import-transactions')).toBeInTheDocument();
      expect(screen.getByTestId('attach-statement')).toBeInTheDocument();
      expect(screen.getByText('Import Transactions')).toBeInTheDocument();
      expect(screen.getByText('Attach as Statement')).toBeInTheDocument();
    });
  });

  it('calls Gemini API when Process with AI is clicked', async () => {
    (fetchWrapper.post as jest.Mock).mockResolvedValue({
      statementInfo: { brokerName: 'Test' },
      statementDetails: [],
      transactions: [{ date: '2025-01-01', description: 'Test', amount: 100, type: 'deposit' }],
    });

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Process with AI')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Process with AI'));

    await waitFor(() => {
      expect(fetchWrapper.post).toHaveBeenCalledWith(
        '/api/finance/transactions/import-gemini',
        expect.any(FormData)
      );
    });
  });

  it('shows Gemini error with retry button', async () => {
    (fetchWrapper.post as jest.Mock).mockRejectedValue(new Error('API error'));

    render(<ImportTransactions accountId={1} onImportFinished={jest.fn()} />);

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Process with AI')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Process with AI'));

    await waitFor(() => {
      expect(screen.getByText(/API error/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('reads text files directly without Gemini', async () => {
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

    // Should NOT have called Gemini API
    expect(fetchWrapper.post).not.toHaveBeenCalled();
  });
});

