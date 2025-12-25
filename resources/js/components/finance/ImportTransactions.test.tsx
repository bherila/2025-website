import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportTransactions from '@/components/finance/ImportTransactions';
import React from 'react';
import type { AccountLineItem } from '@/data/finance/AccountLineItem';
import { fetchWrapper } from '@/fetchWrapper';

// Mock the child component
jest.mock('@/components/finance/TransactionsTable', () => () => <div data-testid="transactions-table" />);

jest.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/spinner', () => ({
    Spinner: () => <div data-testid="spinner" />,
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
  it('parses CSV data and displays the import button', async () => {
    const onImportFinishedMock = jest.fn();

    // Mock get response for existing transactions
    (fetchWrapper.get as jest.Mock).mockResolvedValue([]);

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
});
